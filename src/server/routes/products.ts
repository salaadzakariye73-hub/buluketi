import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, recordAudit, requireRole, type AuthenticatedRequest } from '../middleware/auth.ts';
import { InventoryTransaction, Product } from '../models/index.ts';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res: Response) => {
  try {
    const products = await Product.find().sort({ name: 1 }).lean();
    res.json(
      products.map((p) => ({
        id: String(p._id),
        name: p.name,
        code: p.code,
        dimensions: p.dimensions,
        unitPrice: p.unitPrice,
        openingStock: p.openingStock,
        availableStock: p.availableStock,
        curingStock: p.curingStock,
        damagedStock: p.damagedStock,
        lowStockThreshold: p.lowStockThreshold,
        isActive: p.isActive,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to load products' });
  }
});

const createProductSchema = z.object({
  name: z.string().min(1).max(60),
  code: z.string().min(2).max(20),
  dimensions: z.string().max(60).optional().default(''),
  unitPrice: z.number().min(0),
  openingStock: z.number().int().min(0).optional().default(0),
  lowStockThreshold: z.number().int().min(0).optional().default(500),
});

router.post('/', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid block size payload', details: parsed.error.flatten() });
      return;
    }

    const exists = await Product.findOne({
      $or: [{ name: parsed.data.name.trim() }, { code: parsed.data.code.trim().toUpperCase() }],
    });
    if (exists) {
      res.status(409).json({ error: 'Block size name or code already exists' });
      return;
    }

    const opening = parsed.data.openingStock;
    const product = await Product.create({
      name: parsed.data.name.trim(),
      code: parsed.data.code.trim().toUpperCase(),
      dimensions: parsed.data.dimensions.trim(),
      unitPrice: parsed.data.unitPrice,
      openingStock: opening,
      availableStock: opening,
      curingStock: 0,
      damagedStock: 0,
      lowStockThreshold: parsed.data.lowStockThreshold,
      isActive: true,
    });

    if (opening > 0) {
      await InventoryTransaction.create({
        productId: product._id,
        blockSize: product.name,
        type: 'opening',
        quantityDelta: opening,
        balanceAfter: opening,
        referenceType: 'Product',
        referenceId: product._id,
        notes: `Opening stock initialized for ${product.name}`,
        performedBy: req.user!.id,
      });
    }

    await recordAudit({
      user: req.user,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: String(product._id),
      details: { name: product.name, code: product.code, unitPrice: product.unitPrice, openingStock: opening },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: String(product._id),
      name: product.name,
      code: product.code,
      dimensions: product.dimensions,
      unitPrice: product.unitPrice,
      openingStock: product.openingStock,
      availableStock: product.availableStock,
      curingStock: product.curingStock,
      damagedStock: product.damagedStock,
      lowStockThreshold: product.lowStockThreshold,
      isActive: product.isActive,
    });
  } catch {
    res.status(500).json({ error: 'Failed to create block size' });
  }
});

const updateProductSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  dimensions: z.string().max(60).optional(),
  unitPrice: z.number().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

router.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid product update payload', details: parsed.error.flatten() });
      return;
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Block size not found' });
      return;
    }

    if (parsed.data.name) product.name = parsed.data.name.trim();
    if (parsed.data.dimensions !== undefined) product.dimensions = parsed.data.dimensions.trim();
    if (parsed.data.unitPrice !== undefined) product.unitPrice = parsed.data.unitPrice;
    if (parsed.data.lowStockThreshold !== undefined) product.lowStockThreshold = parsed.data.lowStockThreshold;
    if (parsed.data.isActive !== undefined) product.isActive = parsed.data.isActive;

    await product.save();

    await recordAudit({
      user: req.user,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: String(product._id),
      details: parsed.data,
      ipAddress: req.ip,
    });

    res.json({
      id: String(product._id),
      name: product.name,
      code: product.code,
      dimensions: product.dimensions,
      unitPrice: product.unitPrice,
      openingStock: product.openingStock,
      availableStock: product.availableStock,
      curingStock: product.curingStock,
      damagedStock: product.damagedStock,
      lowStockThreshold: product.lowStockThreshold,
      isActive: product.isActive,
    });
  } catch {
    res.status(500).json({ error: 'Failed to update block size' });
  }
});

const adjustStockSchema = z.object({
  type: z.enum(['opening', 'damage', 'adjustment']),
  quantity: z.number().int(),
  notes: z.string().min(2).max(240),
});

router.post('/:id/adjust', requireRole('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = adjustStockSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid adjustment payload', details: parsed.error.flatten() });
      return;
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: 'Block size not found' });
      return;
    }

    const { type, quantity, notes } = parsed.data;
    if (quantity === 0) {
      res.status(400).json({ error: 'Adjustment quantity must not be zero' });
      return;
    }

    let delta = quantity;
    if (type === 'damage') {
      const dmg = Math.abs(quantity);
      if (product.availableStock < dmg) {
        res.status(409).json({ error: 'Damaged blocks cannot exceed available stock' });
        return;
      }
      product.damagedStock += dmg;
      product.availableStock -= dmg;
      delta = -dmg;
    } else if (type === 'opening') {
      const addOpening = Math.abs(quantity);
      product.openingStock += addOpening;
      product.availableStock += addOpening;
      delta = addOpening;
    } else {
      if (product.availableStock + quantity < 0) {
        res.status(409).json({ error: 'Adjustment would result in negative available stock' });
        return;
      }
      product.availableStock += quantity;
      delta = quantity;
    }

    await product.save();

    await InventoryTransaction.create({
      productId: product._id,
      blockSize: product.name,
      type,
      quantityDelta: delta,
      balanceAfter: product.availableStock,
      referenceType: 'ManualAdjustment',
      notes: notes.trim(),
      performedBy: req.user!.id,
    });

    await recordAudit({
      user: req.user,
      action: 'STOCK_ADJUSTED',
      entityType: 'Product',
      entityId: String(product._id),
      details: { type, delta, balanceAfter: product.availableStock, notes },
      ipAddress: req.ip,
    });

    res.json({
      id: String(product._id),
      availableStock: product.availableStock,
      openingStock: product.openingStock,
      damagedStock: product.damagedStock,
    });
  } catch {
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

export default router;
