import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, recordAudit, requireRole, type AuthenticatedRequest } from '../middleware/auth.ts';
import { Expense } from '../models/index.ts';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('ADMIN', 'MANAGER'), async (req, res: Response) => {
  try {
    const filter: Record<string, unknown> = {};
    if (req.query.category && typeof req.query.category === 'string') {
      filter.category = req.query.category;
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
      filter.expenseDate = dateQuery;
    }

    const expenses = await Expense.find(filter)
      .populate('recordedBy', 'name')
      .sort({ expenseDate: -1, createdAt: -1 })
      .limit(200)
      .lean();

    res.json(
      expenses.map((e) => ({
        id: String(e._id),
        expenseDate: e.expenseDate,
        category: e.category,
        description: e.description,
        amount: e.amount,
        responsibleEmployee: e.responsibleEmployee,
        recordedBy: e.recordedBy,
        createdAt: e.createdAt,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to load expenses' });
  }
});

const expenseSchema = z.object({
  expenseDate: z.string().min(1),
  category: z.enum([
    'cement',
    'sand',
    'aggregate',
    'salaries',
    'transportation',
    'electricity',
    'water',
    'maintenance',
    'other',
  ]),
  description: z.string().min(2).max(240),
  amount: z.number().positive(),
  responsibleEmployee: z.string().min(2).max(120),
});

router.post('/', requireRole('ADMIN', 'MANAGER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid expense payload', details: parsed.error.flatten() });
      return;
    }

    const expense = await Expense.create({
      expenseDate: new Date(parsed.data.expenseDate),
      category: parsed.data.category,
      description: parsed.data.description.trim(),
      amount: Number(parsed.data.amount.toFixed(2)),
      responsibleEmployee: parsed.data.responsibleEmployee.trim(),
      recordedBy: req.user!.id,
    });

    await recordAudit({
      user: req.user,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: String(expense._id),
      details: { category: expense.category, amount: expense.amount },
      ipAddress: req.ip,
    });

    res.status(201).json({
      id: String(expense._id),
      expenseDate: expense.expenseDate,
      category: expense.category,
      description: expense.description,
      amount: expense.amount,
      responsibleEmployee: expense.responsibleEmployee,
    });
  } catch {
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await Expense.findByIdAndDelete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    await recordAudit({
      user: req.user,
      action: 'EXPENSE_DELETED',
      entityType: 'Expense',
      entityId: req.params.id,
      details: { category: deleted.category, amount: deleted.amount },
      ipAddress: req.ip,
    });
    res.json({ deleted: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

export default router;
