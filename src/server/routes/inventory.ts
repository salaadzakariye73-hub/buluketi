import { Router, type Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { InventoryTransaction, Product, Production, Sale } from '../models/index.ts';

const router = Router();
router.use(authenticate);

router.get('/summary', async (_req, res: Response) => {
  try {
    const [products, readyAgg, curingAgg, salesAgg, adjAgg] = await Promise.all([
      Product.find().sort({ name: 1 }).lean(),
      Production.aggregate([
        { $match: { status: 'ready' } },
        { $group: { _id: '$productId', totalProduced: { $sum: '$quantityProduced' }, totalDamaged: { $sum: '$damagedQuantity' } } },
      ]),
      Production.aggregate([
        { $match: { status: 'curing' } },
        { $group: { _id: '$productId', totalCuring: { $sum: '$quantityProduced' } } },
      ]),
      Sale.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$productId', totalSold: { $sum: '$quantitySold' } } },
      ]),
      InventoryTransaction.aggregate([
        { $match: { type: 'adjustment' } },
        { $group: { _id: '$productId', totalAdjusted: { $sum: '$quantityDelta' } } },
      ]),
    ]);

    const readyMap = new Map(readyAgg.map((x) => [String(x._id), x]));
    const curingMap = new Map(curingAgg.map((x) => [String(x._id), x]));
    const salesMap = new Map(salesAgg.map((x) => [String(x._id), x]));
    const adjMap = new Map(adjAgg.map((x) => [String(x._id), x]));

    const items = products.map((p) => {
      const pid = String(p._id);
      const readyProduction = readyMap.get(pid)?.totalProduced ?? 0;
      const curingBlocks = curingMap.get(pid)?.totalCuring ?? p.curingStock ?? 0;
      const soldBlocks = salesMap.get(pid)?.totalSold ?? 0;
      const damagedBlocks = p.damagedStock ?? 0;
      const adjustments = adjMap.get(pid)?.totalAdjusted ?? 0;

      // Authoritative formula: Opening Stock + Ready Production - Sales - Damaged + Adjustments
      const computedStock = p.openingStock + readyProduction - soldBlocks - damagedBlocks + adjustments;

      return {
        id: pid,
        name: p.name,
        code: p.code,
        dimensions: p.dimensions,
        unitPrice: p.unitPrice,
        openingStock: p.openingStock,
        readyProduction,
        curingBlocks,
        soldBlocks,
        damagedBlocks,
        adjustments,
        availableStock: p.availableStock,
        computedStock,
        lowStockThreshold: p.lowStockThreshold,
        isLowStock: p.availableStock <= p.lowStockThreshold,
        isActive: p.isActive,
      };
    });

    res.json(items);
  } catch {
    res.status(500).json({ error: 'Failed to load inventory summary' });
  }
});

router.get('/transactions', requireRole('ADMIN', 'MANAGER', 'SALESPERSON'), async (req, res: Response) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.productId && typeof req.query.productId === 'string') {
      filter.productId = req.query.productId;
    }
    if (req.query.type && typeof req.query.type === 'string') {
      filter.type = req.query.type;
    }

    const txs = await InventoryTransaction.find(filter)
      .populate('performedBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json(
      txs.map((t) => ({
        id: String(t._id),
        productId: String(t.productId),
        blockSize: t.blockSize,
        type: t.type,
        quantityDelta: t.quantityDelta,
        balanceAfter: t.balanceAfter,
        referenceType: t.referenceType,
        notes: t.notes,
        performedBy: t.performedBy,
        createdAt: t.createdAt,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to load inventory history' });
  }
});

export default router;
