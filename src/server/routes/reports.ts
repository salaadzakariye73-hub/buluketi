import { Router, type Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { Customer, Expense, Product, Production, Sale } from '../models/index.ts';

const router = Router();
router.use(authenticate);

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

router.get('/dashboard', async (_req, res: Response) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const days14Start = new Date(todayStart);
    days14Start.setDate(days14Start.getDate() - 13);

    const months6Start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      todayProdAgg,
      monthProdAgg,
      todaySalesAgg,
      monthSalesAgg,
      products,
      debtAgg,
      dailyProdRaw,
      dailySalesRaw,
      monthlyProdRaw,
      monthlySalesRaw,
      monthlyExpRaw,
      recentSales,
      recentProduction,
    ] = await Promise.all([
      Production.aggregate([
        { $match: { productionDate: { $gte: todayStart } } },
        { $group: { _id: null, qty: { $sum: '$quantityProduced' } } },
      ]),
      Production.aggregate([
        { $match: { productionDate: { $gte: monthStart } } },
        { $group: { _id: null, qty: { $sum: '$quantityProduced' } } },
      ]),
      Sale.aggregate([
        { $match: { status: 'completed', saleDate: { $gte: todayStart } } },
        { $group: { _id: null, qty: { $sum: '$quantitySold' }, revenue: { $sum: '$totalAmount' } } },
      ]),
      Sale.aggregate([
        { $match: { status: 'completed', saleDate: { $gte: monthStart } } },
        { $group: { _id: null, qty: { $sum: '$quantitySold' }, revenue: { $sum: '$totalAmount' } } },
      ]),
      Product.find({ isActive: true }).sort({ name: 1 }).lean(),
      Customer.aggregate([{ $group: { _id: null, totalDebt: { $sum: '$outstandingDebt' } } }]),
      Production.aggregate([
        { $match: { productionDate: { $gte: days14Start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$productionDate' } },
            produced: { $sum: '$quantityProduced' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Sale.aggregate([
        { $match: { status: 'completed', saleDate: { $gte: days14Start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$saleDate' } },
            sold: { $sum: '$quantitySold' },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Production.aggregate([
        { $match: { productionDate: { $gte: months6Start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$productionDate' } },
            produced: { $sum: '$quantityProduced' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Sale.aggregate([
        { $match: { status: 'completed', saleDate: { $gte: months6Start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$saleDate' } },
            sold: { $sum: '$quantitySold' },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Expense.aggregate([
        { $match: { expenseDate: { $gte: months6Start } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$expenseDate' } },
            expenses: { $sum: '$amount' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Sale.find().sort({ createdAt: -1 }).limit(6).lean(),
      Production.find().sort({ createdAt: -1 }).limit(6).lean(),
    ]);

    const totalAvailableStock = products.reduce((acc, p) => acc + (p.availableStock || 0), 0);
    const totalDamagedBlocks = products.reduce((acc, p) => acc + (p.damagedStock || 0), 0);
    const lowStockAlerts = products
      .filter((p) => p.availableStock <= p.lowStockThreshold)
      .map((p) => ({
        id: String(p._id),
        name: p.name,
        availableStock: p.availableStock,
        lowStockThreshold: p.lowStockThreshold,
      }));

    // Build continuous 14-day series
    const prodMap = new Map(dailyProdRaw.map((d) => [d._id, d.produced]));
    const salesMap = new Map(dailySalesRaw.map((d) => [d._id, { sold: d.sold, revenue: d.revenue }]));
    const dailyChart = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(days14Start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dailyChart.push({
        date: key,
        produced: prodMap.get(key) || 0,
        sold: salesMap.get(key)?.sold || 0,
        revenue: Number((salesMap.get(key)?.revenue || 0).toFixed(2)),
      });
    }

    // Build continuous 6-month series
    const mProdMap = new Map(monthlyProdRaw.map((m) => [m._id, m.produced]));
    const mSalesMap = new Map(monthlySalesRaw.map((m) => [m._id, { sold: m.sold, revenue: m.revenue }]));
    const mExpMap = new Map(monthlyExpRaw.map((m) => [m._id, m.expenses]));
    const monthlyChart = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyChart.push({
        month: key,
        produced: mProdMap.get(key) || 0,
        sold: mSalesMap.get(key)?.sold || 0,
        revenue: Number((mSalesMap.get(key)?.revenue || 0).toFixed(2)),
        expenses: Number((mExpMap.get(key) || 0).toFixed(2)),
      });
    }

    const recentTransactions = [
      ...recentSales.map((s) => ({
        id: String(s._id),
        kind: 'sale' as const,
        title: s.invoiceNumber,
        subtitle: `${s.customerName} · ${s.blockSize} (${s.quantitySold})`,
        amount: s.totalAmount,
        status: s.status,
        date: s.saleDate,
      })),
      ...recentProduction.map((p) => ({
        id: String(p._id),
        kind: 'production' as const,
        title: p.batchNumber,
        subtitle: `${p.blockSize} · ${p.quantityProduced} (${p.workerName})`,
        amount: p.quantityProduced,
        status: p.status,
        date: p.productionDate,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8);

    res.json({
      kpis: {
        productionToday: todayProdAgg[0]?.qty || 0,
        salesToday: todaySalesAgg[0]?.qty || 0,
        availableStock: totalAvailableStock,
        todayRevenue: Number((todaySalesAgg[0]?.revenue || 0).toFixed(2)),
        monthlyProduction: monthProdAgg[0]?.qty || 0,
        monthlySales: monthSalesAgg[0]?.qty || 0,
        damagedBlocks: totalDamagedBlocks,
        outstandingDebts: Number((debtAgg[0]?.totalDebt || 0).toFixed(2)),
      },
      dailyChart,
      monthlyChart,
      inventoryOverview: products.map((p) => ({
        id: String(p._id),
        name: p.name,
        code: p.code,
        availableStock: p.availableStock,
        curingStock: p.curingStock,
        damagedStock: p.damagedStock,
        lowStockThreshold: p.lowStockThreshold,
      })),
      lowStockAlerts,
      recentTransactions,
    });
  } catch (err) {
    console.error('[Reports] Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

router.get('/analytics', requireRole('ADMIN', 'MANAGER'), async (req, res: Response) => {
  try {
    const from = typeof req.query.from === 'string' && req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = typeof req.query.to === 'string' && req.query.to ? new Date(req.query.to) : new Date();
    to.setHours(23, 59, 59, 999);

    const blockSize = typeof req.query.blockSize === 'string' && req.query.blockSize ? req.query.blockSize : '';

    const prodMatch: Record<string, unknown> = { productionDate: { $gte: from, $lte: to } };
    const saleMatch: Record<string, unknown> = { status: 'completed', saleDate: { $gte: from, $lte: to } };
    if (blockSize) {
      prodMatch.blockSize = blockSize;
      saleMatch.blockSize = blockSize;
    }

    const [productions, sales, expenses, products, debtors] = await Promise.all([
      Production.find(prodMatch).sort({ productionDate: -1 }).lean(),
      Sale.find(saleMatch).sort({ saleDate: -1 }).lean(),
      Expense.find({ expenseDate: { $gte: from, $lte: to } }).sort({ expenseDate: -1 }).lean(),
      Product.find(blockSize ? { name: blockSize } : {}).sort({ name: 1 }).lean(),
      Customer.find({ outstandingDebt: { $gt: 0 } }).sort({ outstandingDebt: -1 }).lean(),
    ]);

    const totalProduced = productions.reduce((sum, p) => sum + p.quantityProduced, 0);
    const totalReady = productions.filter((p) => p.status === 'ready').reduce((sum, p) => sum + p.quantityProduced, 0);
    const totalCuring = productions.filter((p) => p.status === 'curing').reduce((sum, p) => sum + p.quantityProduced, 0);
    const totalDamagedInProd = productions.reduce((sum, p) => sum + p.damagedQuantity, 0);

    const totalSoldQty = sales.reduce((sum, s) => sum + s.quantitySold, 0);
    const totalRevenue = Number(sales.reduce((sum, s) => sum + s.totalAmount, 0).toFixed(2));
    const totalCollected = Number(sales.reduce((sum, s) => sum + s.amountPaid, 0).toFixed(2));
    const totalExpenses = Number(expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2));
    const estimatedGrossProfit = Number((totalRevenue - totalExpenses).toFixed(2));
    const totalCustomerDebts = Number(debtors.reduce((sum, c) => sum + c.outstandingDebt, 0).toFixed(2));

    const expensesByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expensesByCategory[e.category] = Number(((expensesByCategory[e.category] || 0) + e.amount).toFixed(2));
    }

    res.json({
      period: { from: from.toISOString(), to: to.toISOString(), blockSize: blockSize || 'ALL' },
      summary: {
        totalProduced,
        totalReady,
        totalCuring,
        totalDamagedInProd,
        totalSoldQty,
        totalRevenue,
        totalCollected,
        totalExpenses,
        estimatedGrossProfit,
        totalCustomerDebts,
      },
      expensesByCategory,
      productions: productions.map((p) => ({
        id: String(p._id),
        date: p.productionDate,
        batchNumber: p.batchNumber,
        blockSize: p.blockSize,
        blockType: p.blockType,
        quantityProduced: p.quantityProduced,
        damagedQuantity: p.damagedQuantity,
        workerName: p.workerName,
        status: p.status,
      })),
      sales: sales.map((s) => ({
        id: String(s._id),
        date: s.saleDate,
        invoiceNumber: s.invoiceNumber,
        customerName: s.customerName,
        blockSize: s.blockSize,
        quantitySold: s.quantitySold,
        unitPrice: s.unitPrice,
        totalAmount: s.totalAmount,
        amountPaid: s.amountPaid,
        remainingBalance: s.remainingBalance,
        paymentMethod: s.paymentMethod,
      })),
      inventory: products.map((p) => ({
        id: String(p._id),
        name: p.name,
        code: p.code,
        openingStock: p.openingStock,
        availableStock: p.availableStock,
        curingStock: p.curingStock,
        damagedStock: p.damagedStock,
        unitPrice: p.unitPrice,
      })),
      expenses: expenses.map((e) => ({
        id: String(e._id),
        date: e.expenseDate,
        category: e.category,
        description: e.description,
        amount: e.amount,
        responsibleEmployee: e.responsibleEmployee,
      })),
      debtors: debtors.map((c) => ({
        id: String(c._id),
        name: c.name,
        phone: c.phone,
        totalPurchases: c.totalPurchases,
        totalPaid: c.totalPaid,
        outstandingDebt: c.outstandingDebt,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to generate analytics report' });
  }
});

export default router;
