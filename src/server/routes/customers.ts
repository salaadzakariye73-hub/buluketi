import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, recordAudit, requireRole, type AuthenticatedRequest } from '../middleware/auth.ts';
import { Customer, Payment, Sale } from '../models/index.ts';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('ADMIN', 'MANAGER', 'SALESPERSON'), async (req, res: Response) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
      const rx = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { phone: rx }, { address: rx }];
    }
    if (req.query.debtOnly === 'true') {
      filter.outstandingDebt = { $gt: 0 };
    }

    const customers = await Customer.find(filter).sort({ outstandingDebt: -1, createdAt: -1 }).lean();
    res.json(
      customers.map((c) => ({
        id: String(c._id),
        name: c.name,
        phone: c.phone,
        address: c.address,
        totalPurchases: c.totalPurchases,
        totalPaid: c.totalPaid,
        outstandingDebt: c.outstandingDebt,
        notes: c.notes,
        createdAt: c.createdAt,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to load customers' });
  }
});

router.get('/:id', requireRole('ADMIN', 'MANAGER', 'SALESPERSON'), async (req, res: Response) => {
  try {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    const [sales, payments] = await Promise.all([
      Sale.find({ customerId: customer._id }).sort({ saleDate: -1 }).lean(),
      Payment.find({ customerId: customer._id }).populate('recordedBy', 'name').sort({ paymentDate: -1 }).lean(),
    ]);

    res.json({
      customer: {
        id: String(customer._id),
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        totalPurchases: customer.totalPurchases,
        totalPaid: customer.totalPaid,
        outstandingDebt: customer.outstandingDebt,
        notes: customer.notes,
        createdAt: customer.createdAt,
      },
      sales: sales.map((s) => ({
        id: String(s._id),
        invoiceNumber: s.invoiceNumber,
        saleDate: s.saleDate,
        blockSize: s.blockSize,
        quantitySold: s.quantitySold,
        unitPrice: s.unitPrice,
        totalAmount: s.totalAmount,
        amountPaid: s.amountPaid,
        remainingBalance: s.remainingBalance,
        paymentMethod: s.paymentMethod,
        status: s.status,
      })),
      payments: payments.map((p) => ({
        id: String(p._id),
        saleId: p.saleId ? String(p.saleId) : undefined,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        paymentDate: p.paymentDate,
        notes: p.notes,
        recordedBy: p.recordedBy,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load customer details' });
  }
});

const customerSchema = z.object({
  name: z.string().min(2).max(120),
  phone: z.string().min(3).max(40),
  address: z.string().max(200).optional().default(''),
  notes: z.string().max(400).optional().default(''),
});

router.post('/', requireRole('ADMIN', 'MANAGER', 'SALESPERSON'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid customer data', details: parsed.error.flatten() });
      return;
    }

    const customer = await Customer.create({
      name: parsed.data.name.trim(),
      phone: parsed.data.phone.trim(),
      address: parsed.data.address.trim(),
      notes: parsed.data.notes.trim(),
      createdBy: req.user!.id,
    });

    await recordAudit({
      user: req.user,
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: String(customer._id),
      details: { name: customer.name, phone: customer.phone },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: String(customer._id),
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      totalPurchases: customer.totalPurchases,
      totalPaid: customer.totalPaid,
      outstandingDebt: customer.outstandingDebt,
      notes: customer.notes,
    });
  } catch {
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

router.patch('/:id', requireRole('ADMIN', 'MANAGER', 'SALESPERSON'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = customerSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid customer update', details: parsed.error.flatten() });
      return;
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    if (parsed.data.name) customer.name = parsed.data.name.trim();
    if (parsed.data.phone) customer.phone = parsed.data.phone.trim();
    if (parsed.data.address !== undefined) customer.address = parsed.data.address.trim();
    if (parsed.data.notes !== undefined) customer.notes = parsed.data.notes.trim();
    await customer.save();

    res.json({
      id: String(customer._id),
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      totalPurchases: customer.totalPurchases,
      totalPaid: customer.totalPaid,
      outstandingDebt: customer.outstandingDebt,
      notes: customer.notes,
    });
  } catch {
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

const paymentSchema = z.object({
  clientTxId: z.string().optional(),
  saleId: z.string().optional(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['cash', 'mobile_money', 'bank_transfer']),
  paymentDate: z.string().optional(),
  notes: z.string().max(240).optional().default(''),
});

router.post('/:id/payments', requireRole('ADMIN', 'MANAGER', 'SALESPERSON'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = paymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid payment payload', details: parsed.error.flatten() });
      return;
    }

    if (parsed.data.clientTxId) {
      const existing = await Payment.findOne({ clientTxId: parsed.data.clientTxId });
      if (existing) {
        res.json({ duplicate: true, id: String(existing._id) });
        return;
      }
    }

    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    if (parsed.data.amount > customer.outstandingDebt + 0.01) {
      res.status(400).json({ error: 'Payment amount exceeds outstanding customer debt' });
      return;
    }

    const amount = Number(parsed.data.amount.toFixed(2));
    const payment = await Payment.create({
      clientTxId: parsed.data.clientTxId || undefined,
      saleId: parsed.data.saleId || undefined,
      customerId: customer._id,
      amount,
      paymentMethod: parsed.data.paymentMethod,
      paymentDate: parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : new Date(),
      notes: parsed.data.notes.trim(),
      recordedBy: req.user!.id,
    });

    customer.totalPaid = Number((customer.totalPaid + amount).toFixed(2));
    customer.outstandingDebt = Math.max(0, Number((customer.totalPurchases - customer.totalPaid).toFixed(2)));
    await customer.save();

    if (parsed.data.saleId) {
      const sale = await Sale.findById(parsed.data.saleId);
      if (sale && sale.status === 'completed') {
        sale.amountPaid = Number((sale.amountPaid + amount).toFixed(2));
        sale.remainingBalance = Math.max(0, Number((sale.totalAmount - sale.amountPaid).toFixed(2)));
        await sale.save();
      }
    } else {
      // Allocate across oldest unpaid sales
      let remainingToApply = amount;
      const unpaidSales = await Sale.find({
        customerId: customer._id,
        status: 'completed',
        remainingBalance: { $gt: 0 },
      }).sort({ saleDate: 1 });

      for (const s of unpaidSales) {
        if (remainingToApply <= 0) break;
        const apply = Math.min(remainingToApply, s.remainingBalance);
        s.amountPaid = Number((s.amountPaid + apply).toFixed(2));
        s.remainingBalance = Number((s.remainingBalance - apply).toFixed(2));
        await s.save();
        remainingToApply = Number((remainingToApply - apply).toFixed(2));
      }
    }

    await recordAudit({
      user: req.user,
      action: 'CUSTOMER_PAYMENT_RECORDED',
      entityType: 'Payment',
      entityId: String(payment._id),
      details: { customerName: customer.name, amount, method: parsed.data.paymentMethod },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: String(payment._id),
      outstandingDebt: customer.outstandingDebt,
      totalPaid: customer.totalPaid,
    });
  } catch {
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

export default router;
