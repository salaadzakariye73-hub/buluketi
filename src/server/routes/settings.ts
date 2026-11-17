import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, recordAudit, requireRole, type AuthenticatedRequest } from '../middleware/auth.ts';
import {
  AuditLog,
  CompanySettings,
  Customer,
  Expense,
  InventoryTransaction,
  Payment,
  Product,
  Production,
  Sale,
  User,
} from '../models/index.ts';

const router = Router();

// Public settings endpoint (non-sensitive branding for login page & default language)
router.get('/public', async (_req, res: Response) => {
  try {
    const settings = await CompanySettings.findOne({ key: 'default' }).lean();
    res.json({
      companyName: settings?.companyName || 'BULUKEETI PRO',
      companyLogo: settings?.companyLogo || '',
      defaultLanguage: settings?.defaultLanguage || 'en',
      currency: settings?.currency || 'USD',
    });
  } catch {
    res.json({
      companyName: 'BULUKEETI PRO',
      companyLogo: '',
      defaultLanguage: 'en',
      currency: 'USD',
    });
  }
});

router.get('/', authenticate, async (_req, res: Response) => {
  try {
    const settings = await CompanySettings.findOne({ key: 'default' }).lean();
    res.json(settings || {});
  } catch {
    res.status(500).json({ error: 'Failed to load company settings' });
  }
});

const settingsSchema = z.object({
  companyName: z.string().min(2).max(160).optional(),
  companyLogo: z.string().max(400000).optional(),
  companyAddress: z.string().max(240).optional(),
  phoneNumber: z.string().max(60).optional(),
  currency: z.string().min(1).max(12).optional(),
  defaultLanguage: z.enum(['en', 'so']).optional(),
  lowStockAlertDefault: z.number().int().min(0).optional(),
  invoiceFooterNote: z.string().max(300).optional(),
});

router.patch('/', authenticate, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid settings payload', details: parsed.error.flatten() });
      return;
    }

    const settings = await CompanySettings.findOneAndUpdate(
      { key: 'default' },
      { $set: parsed.data },
      { new: true, upsert: true }
    );

    await recordAudit({
      user: req.user,
      action: 'SETTINGS_UPDATED',
      entityType: 'CompanySettings',
      entityId: String(settings._id),
      details: { updatedFields: Object.keys(parsed.data) },
      ipAddress: req.ip,
    });

    res.json(settings);
  } catch {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

router.get('/audit-logs', authenticate, requireRole('ADMIN', 'MANAGER'), async (_req, res: Response) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(150).lean();
    res.json(
      logs.map((l) => ({
        id: String(l._id),
        userName: l.userName,
        userRole: l.userRole,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        details: l.details,
        createdAt: l.createdAt,
      }))
    );
  } catch {
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

// Download complete database state as JSON (Admin only)
router.get('/backup', authenticate, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [
      companySettings,
      users,
      products,
      productions,
      inventoryTransactions,
      customers,
      sales,
      payments,
      expenses,
      auditLogs,
    ] = await Promise.all([
      CompanySettings.find().lean(),
      User.find().select('-resetTokenHash -resetTokenExpires').lean(),
      Product.find().lean(),
      Production.find().lean(),
      InventoryTransaction.find().lean(),
      Customer.find().lean(),
      Sale.find().lean(),
      Payment.find().lean(),
      Expense.find().lean(),
      AuditLog.find().sort({ createdAt: -1 }).limit(1000).lean(),
    ]);

    const backupPayload = {
      format: 'bulukeeti-pro-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: req.user?.email || 'admin',
      collections: {
        companySettings,
        users,
        products,
        productions,
        inventoryTransactions,
        customers,
        sales,
        payments,
        expenses,
        auditLogs,
      },
    };

    await recordAudit({
      user: req.user,
      action: 'DATABASE_BACKUP_EXPORTED',
      entityType: 'System',
      details: {
        counts: {
          users: users.length,
          products: products.length,
          productions: productions.length,
          sales: sales.length,
          customers: customers.length,
          expenses: expenses.length,
        },
      },
      ipAddress: req.ip,
    });

    const dateStamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="bulukeeti-pro-backup-${dateStamp}.json"`);
    res.send(JSON.stringify(backupPayload, null, 2));
  } catch (err) {
    console.error('[Backup] Export error:', err);
    res.status(500).json({ error: 'Failed to generate database backup' });
  }
});

const backupRestoreSchema = z.object({
  format: z.literal('bulukeeti-pro-backup'),
  version: z.literal(1),
  collections: z.object({
    companySettings: z.array(z.record(z.string(), z.unknown())),
    users: z.array(z.record(z.string(), z.unknown())),
    products: z.array(z.record(z.string(), z.unknown())),
    productions: z.array(z.record(z.string(), z.unknown())),
    inventoryTransactions: z.array(z.record(z.string(), z.unknown())),
    customers: z.array(z.record(z.string(), z.unknown())),
    sales: z.array(z.record(z.string(), z.unknown())),
    payments: z.array(z.record(z.string(), z.unknown())),
    expenses: z.array(z.record(z.string(), z.unknown())),
    auditLogs: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  }),
});

// Restore complete database state from JSON backup (Admin only)
router.post('/restore', authenticate, requireRole('ADMIN'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = backupRestoreSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid backup file format or structure', details: parsed.error.flatten() });
      return;
    }

    const { collections } = parsed.data;
    const hasActiveAdmin = collections.users.some(
      (u) => u.role === 'ADMIN' && u.isActive !== false && typeof u.passwordHash === 'string'
    );
    if (!hasActiveAdmin) {
      res.status(400).json({ error: 'Backup must contain at least one active ADMIN user account' });
      return;
    }

    const replaceCollection = async (
      model: { deleteMany: (q: object) => Promise<unknown>; insertMany: (docs: unknown[], opts?: object) => Promise<unknown> },
      docs: Array<Record<string, unknown>>
    ) => {
      await model.deleteMany({});
      if (docs.length > 0) {
        const sanitized = docs.map((doc) => {
          const copy = { ...doc };
          delete copy.__v;
          return copy;
        });
        await model.insertMany(sanitized, { ordered: true });
      }
    };

    await replaceCollection(CompanySettings, collections.companySettings);
    await replaceCollection(User, collections.users);
    await replaceCollection(Product, collections.products);
    await replaceCollection(Production, collections.productions);
    await replaceCollection(InventoryTransaction, collections.inventoryTransactions);
    await replaceCollection(Customer, collections.customers);
    await replaceCollection(Sale, collections.sales);
    await replaceCollection(Payment, collections.payments);
    await replaceCollection(Expense, collections.expenses);
    await replaceCollection(AuditLog, collections.auditLogs);

    await recordAudit({
      user: req.user,
      action: 'DATABASE_BACKUP_RESTORED',
      entityType: 'System',
      details: {
        counts: {
          users: collections.users.length,
          products: collections.products.length,
          productions: collections.productions.length,
          sales: collections.sales.length,
          customers: collections.customers.length,
          expenses: collections.expenses.length,
        },
      },
      ipAddress: req.ip,
    });

    res.json({
      message: 'Database restored successfully',
      counts: {
        users: collections.users.length,
        products: collections.products.length,
        productions: collections.productions.length,
        inventoryTransactions: collections.inventoryTransactions.length,
        customers: collections.customers.length,
        sales: collections.sales.length,
        payments: collections.payments.length,
        expenses: collections.expenses.length,
      },
    });
  } catch (err) {
    console.error('[Backup] Restore error:', err);
    res.status(500).json({ error: 'Failed to restore database from backup' });
  }
});

export default router;

