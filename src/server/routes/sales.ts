import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, recordAudit, requireRole, type AuthenticatedRequest } from '../middleware/auth.ts';
import { Customer, InventoryTransaction, Product, Sale } from '../models/index.ts';
import { BusinessError, createSaleRecord } from '../services/businessLogic.ts';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('ADMIN', 'MANAGER', 'SALESPERSON'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.user!.role === 'SALESPERSON') {
      filter.soldBy = req.user!.id;
    }
    if (req.query.blockSize && typeof req.query.blockSize === 'string') {
      filter.blockSize = req.query.blockSize;
    }
    if (req.query.status && (req.query.status === 'completed' || req.query.status === 'cancelled')) {
      filter.status = req.query.status;
    }
    if (req.query.from || req.query.to) {
      const dateQuery: Record<string, Date> = {};
      if (typeof req.query.from === 'string' && req.query.from) {
        dateQuery.$gte = new Date(req.query.from);
      }
      if (typeof req.query.to === 'string' && req.query.to) {
        const end = new Date(req.query.to);
        end.setHours(23, 59, 59, 999);
        dateQuery.$lte = end;
      }
      filter.saleDate = dateQuery;
    }
    if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
      const rx = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ invoiceNumber: rx }, { customerName: rx }, { customerPhone: rx }, { blockSize: rx }];
    }

    const sales = await Sale.find(filter)
      .populate('soldBy', 'name role')
      .sort({ saleDate: -1, createdAt: -1 })
      .limit(200)
      .lean();

    res.json(
      sales.map((s) => ({
        id: String(s._id),
        clientTxId: s.clientTxId,
        invoiceNumber: s.invoiceNumber,
        customerId: String(s.customerId),
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        saleDate: s.saleDate,
        productId: String(s.productId),
        blockSize: s.blockSize,
        quantitySold: s.quantitySold,
        unitPrice: s.unitPrice,
        totalAmount: s.totalAmount,
        amountPaid: s.amountPaid,
        remainingBalance: s.remainingBalance,
        paymentMethod: s.paymentMethod,
        status: s.status,
        notes: s.notes,
        syncedFromOffline: s.syncedFromOffline,
        soldBy: s.soldBy,
        createdAt: s.createdAt,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to load sales records' });
  }
});

router.get('/:id', requireRole('ADMIN', 'MANAGER', 'SALESPERSON'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id).populate('soldBy', 'name role').lean();
    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }
    if (req.user!.role === 'SALESPERSON' && String((sale.soldBy as { _id?: unknown })?._id || sale.soldBy) !== req.user!.id) {
      res.status(403).json({ error: 'Access denied to this sale record' });
      return;
    }
    res.json({
      id: String(sale._id),
      invoiceNumber: sale.invoiceNumber,
      customerId: String(sale.customerId),
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      saleDate: sale.saleDate,
      productId: String(sale.productId),
      blockSize: sale.blockSize,
      quantitySold: sale.quantitySold,
      unitPrice: sale.unitPrice,
      totalAmount: sale.totalAmount,
      amountPaid: sale.amountPaid,
      remainingBalance: sale.remainingBalance,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      notes: sale.notes,
      soldBy: sale.soldBy,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load sale details' });
  }
});

const createSaleSchema = z.object({
  clientTxId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().min(1).max(120),
  customerPhone: z.string().min(3).max(40),
  customerAddress: z.string().max(200).optional(),
  saleDate: z.string().min(1),
  productId: z.string().min(1),
  quantitySold: z.number().int().min(1),
  unitPrice: z.number().min(0).optional(),
  amountPaid: z.number().min(0),
  paymentMethod: z.enum(['cash', 'mobile_money', 'bank_transfer']),
  notes: z.string().max(400).optional(),
});

router.post('/', requireRole('ADMIN', 'MANAGER', 'SALESPERSON'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid sale data', details: parsed.error.flatten() });
      return;
    }

    const result = await createSaleRecord(parsed.data, req.user!, req.ip);
    res.status(result.duplicate ? 200 : 201).json({
      duplicate: result.duplicate,
      id: String(result.record._id),
      invoiceNumber: result.record.invoiceNumber,
      record: result.record,
    });
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error('[Sales] Create error:', err);
    res.status(500).json({ error: 'Failed to create sale' });
  }
});

router.post('/:id/cancel', requireRole('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }
    if (sale.status === 'cancelled') {
      res.status(400).json({ error: 'Sale is already cancelled' });
      return;
    }

    sale.status = 'cancelled';
    sale.cancelledBy = req.user!.id as unknown as typeof sale.cancelledBy;
    sale.cancelledAt = new Date();
    await sale.save();

    // Restore stock
    const updatedProduct = await Product.findByIdAndUpdate(
      sale.productId,
      { $inc: { availableStock: sale.quantitySold } },
      { new: true }
    );

    // Reverse customer totals safely
    const customer = await Customer.findById(sale.customerId);
    if (customer) {
      customer.totalPurchases = Math.max(0, Number((customer.totalPurchases - sale.totalAmount).toFixed(2)));
      customer.totalPaid = Math.max(0, Number((customer.totalPaid - sale.amountPaid).toFixed(2)));
      customer.outstandingDebt = Math.max(0, Number((customer.totalPurchases - customer.totalPaid).toFixed(2)));
      await customer.save();
    }

    await InventoryTransaction.create({
      productId: sale.productId,
      blockSize: sale.blockSize,
      type: 'sale_cancelled',
      quantityDelta: sale.quantitySold,
      balanceAfter: updatedProduct?.availableStock ?? sale.quantitySold,
      referenceType: 'Sale',
      referenceId: sale._id,
      notes: `Sale ${sale.invoiceNumber} cancelled; stock restored`,
      performedBy: req.user!.id,
    });

    await recordAudit({
      user: req.user,
      action: 'SALE_CANCELLED',
      entityType: 'Sale',
      entityId: String(sale._id),
      details: { invoiceNumber: sale.invoiceNumber, quantityRestored: sale.quantitySold },
      ipAddress: req.ip,
    });

    res.json({ id: String(sale._id), status: 'cancelled' });
  } catch {
    res.status(500).json({ error: 'Failed to cancel sale' });
  }
});

export default router;
