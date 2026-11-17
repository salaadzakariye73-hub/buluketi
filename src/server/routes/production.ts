import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, recordAudit, requireRole, type AuthenticatedRequest } from '../middleware/auth.ts';
import { InventoryTransaction, Product, Production } from '../models/index.ts';
import { BusinessError, createProductionRecord } from '../services/businessLogic.ts';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('ADMIN', 'MANAGER', 'WORKER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.user!.role === 'WORKER') {
      filter.recordedBy = req.user!.id;
    }
    if (req.query.blockSize && typeof req.query.blockSize === 'string') {
      filter.blockSize = req.query.blockSize;
    }
    if (req.query.status && (req.query.status === 'curing' || req.query.status === 'ready')) {
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
      filter.productionDate = dateQuery;
    }
    if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
      const rx = new RegExp(req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ batchNumber: rx }, { workerName: rx }, { productionTeam: rx }, { blockSize: rx }];
    }

    const records = await Production.find(filter)
      .populate('recordedBy', 'name role')
      .sort({ productionDate: -1, createdAt: -1 })
      .limit(200)
      .lean();

    res.json(
      records.map((r) => ({
        id: String(r._id),
        clientTxId: r.clientTxId,
        productionDate: r.productionDate,
        productId: String(r.productId),
        blockSize: r.blockSize,
        blockType: r.blockType,
        quantityProduced: r.quantityProduced,
        damagedQuantity: r.damagedQuantity,
        productionTeam: r.productionTeam,
        workerName: r.workerName,
        batchNumber: r.batchNumber,
        notes: r.notes,
        status: r.status,
        syncedFromOffline: r.syncedFromOffline,
        recordedBy: r.recordedBy,
        createdAt: r.createdAt,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to load production records' });
  }
});

const createProdSchema = z.object({
  clientTxId: z.string().optional(),
  productionDate: z.string().min(1),
  productId: z.string().min(1),
  blockType: z.enum(['hollow', 'solid', 'paving']),
  quantityProduced: z.number().int().min(1),
  damagedQuantity: z.number().int().min(0).optional().default(0),
  productionTeam: z.string().min(1).max(120),
  workerName: z.string().min(1).max(120),
  batchNumber: z.string().min(1).max(60),
  notes: z.string().max(400).optional().default(''),
  status: z.enum(['curing', 'ready']),
});

router.post('/', requireRole('ADMIN', 'MANAGER', 'WORKER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createProdSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid production data', details: parsed.error.flatten() });
      return;
    }

    const result = await createProductionRecord(parsed.data, req.user!, req.ip);
    res.status(result.duplicate ? 200 : 201).json({
      duplicate: result.duplicate,
      id: String(result.record._id),
      record: result.record,
    });
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.status).json({ error: err.message, code: err.code });
      return;
    }
    console.error('[Production] Create error:', err);
    res.status(500).json({ error: 'Failed to record production' });
  }
});

const updateProdSchema = z.object({
  status: z.enum(['curing', 'ready']).optional(),
  damagedQuantity: z.number().int().min(0).optional(),
  productionTeam: z.string().min(1).max(120).optional(),
  workerName: z.string().min(1).max(120).optional(),
  notes: z.string().max(400).optional(),
});

router.patch('/:id', requireRole('ADMIN', 'MANAGER', 'WORKER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = updateProdSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid update data', details: parsed.error.flatten() });
      return;
    }

    const prod = await Production.findById(req.params.id);
    if (!prod) {
      res.status(404).json({ error: 'Production record not found' });
      return;
    }

    // Workers can only edit their own curing records
    if (req.user!.role === 'WORKER') {
      if (String(prod.recordedBy) !== req.user!.id) {
        res.status(403).json({ error: 'You can only edit your own production records' });
        return;
      }
      if (prod.status === 'ready') {
        res.status(403).json({ error: 'Completed Ready for Sale batches require Manager or Admin permission to modify' });
        return;
      }
    }

    const wasReady = prod.status === 'ready';
    const nextStatus = parsed.data.status || prod.status;
    const nextDamaged = parsed.data.damagedQuantity !== undefined ? parsed.data.damagedQuantity : prod.damagedQuantity;

    if (nextDamaged > prod.quantityProduced) {
      res.status(400).json({ error: 'Damaged quantity cannot exceed quantity produced' });
      return;
    }

    // Handle transition from curing -> ready
    if (!wasReady && nextStatus === 'ready') {
      const netGood = prod.quantityProduced - nextDamaged;
      const updatedProduct = await Product.findByIdAndUpdate(
        prod.productId,
        {
          $inc: {
            curingStock: -prod.quantityProduced,
            availableStock: netGood,
            damagedStock: nextDamaged,
          },
        },
        { new: true }
      );

      await InventoryTransaction.create({
        productId: prod.productId,
        blockSize: prod.blockSize,
        type: 'production_ready',
        quantityDelta: netGood,
        balanceAfter: updatedProduct?.availableStock ?? netGood,
        referenceType: 'Production',
        referenceId: prod._id,
        notes: `Batch ${prod.batchNumber} marked Ready for Sale (${prod.quantityProduced} total, ${nextDamaged} damaged)`,
        performedBy: req.user!.id,
      });
    } else if (wasReady && nextStatus === 'curing') {
      res.status(400).json({ error: 'Cannot revert Ready for Sale batch back to Curing directly' });
      return;
    } else if (wasReady && parsed.data.damagedQuantity !== undefined && parsed.data.damagedQuantity !== prod.damagedQuantity) {
      const dmgDiff = parsed.data.damagedQuantity - prod.damagedQuantity;
      const product = await Product.findById(prod.productId);
      if (!product || product.availableStock - dmgDiff < 0) {
        res.status(409).json({ error: 'Insufficient available stock to apply additional damaged quantity' });
        return;
      }
      product.availableStock -= dmgDiff;
      product.damagedStock += dmgDiff;
      await product.save();

      await InventoryTransaction.create({
        productId: prod.productId,
        blockSize: prod.blockSize,
        type: 'damage',
        quantityDelta: -dmgDiff,
        balanceAfter: product.availableStock,
        referenceType: 'Production',
        referenceId: prod._id,
        notes: `Updated damaged count on batch ${prod.batchNumber}`,
        performedBy: req.user!.id,
      });
    }

    prod.status = nextStatus;
    prod.damagedQuantity = nextDamaged;
    if (parsed.data.productionTeam) prod.productionTeam = parsed.data.productionTeam.trim();
    if (parsed.data.workerName) prod.workerName = parsed.data.workerName.trim();
    if (parsed.data.notes !== undefined) prod.notes = parsed.data.notes.trim();
    await prod.save();

    await recordAudit({
      user: req.user,
      action: 'PRODUCTION_UPDATED',
      entityType: 'Production',
      entityId: String(prod._id),
      details: { status: prod.status, damagedQuantity: prod.damagedQuantity },
      ipAddress: req.ip,
    });

    res.json({
      id: String(prod._id),
      status: prod.status,
      damagedQuantity: prod.damagedQuantity,
      productionTeam: prod.productionTeam,
      workerName: prod.workerName,
      notes: prod.notes,
    });
  } catch {
    res.status(500).json({ error: 'Failed to update production record' });
  }
});

export default router;
