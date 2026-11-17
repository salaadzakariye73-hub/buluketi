import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth.ts';
import { BusinessError, createProductionRecord, createSaleRecord } from '../services/businessLogic.ts';

const router = Router();
router.use(authenticate);

const syncItemSchema = z.discriminatedUnion('entityType', [
  z.object({
    clientTxId: z.string().min(8),
    entityType: z.literal('production'),
    createdAtClient: z.string(),
    payload: z.object({
      productionDate: z.string(),
      productId: z.string(),
      blockType: z.enum(['hollow', 'solid', 'paving']),
      quantityProduced: z.number().int().min(1),
      damagedQuantity: z.number().int().min(0).optional().default(0),
      productionTeam: z.string().min(1),
      workerName: z.string().min(1),
      batchNumber: z.string().min(1),
      notes: z.string().optional(),
      status: z.enum(['curing', 'ready']),
    }),
  }),
  z.object({
    clientTxId: z.string().min(8),
    entityType: z.literal('sale'),
    createdAtClient: z.string(),
    payload: z.object({
      customerId: z.string().optional(),
      customerName: z.string().min(1),
      customerPhone: z.string().min(3),
      customerAddress: z.string().optional(),
      saleDate: z.string(),
      productId: z.string(),
      quantitySold: z.number().int().min(1),
      unitPrice: z.number().min(0).optional(),
      amountPaid: z.number().min(0),
      paymentMethod: z.enum(['cash', 'mobile_money', 'bank_transfer']),
      notes: z.string().optional(),
    }),
  }),
]);

const batchSyncSchema = z.object({
  items: z.array(syncItemSchema).max(100),
});

router.post('/batch', async (req: AuthenticatedRequest, res: Response) => {
  const parsed = batchSyncSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid sync batch payload', details: parsed.error.flatten() });
    return;
  }

  const results: Array<{
    clientTxId: string;
    entityType: string;
    status: 'synced' | 'duplicate' | 'conflict' | 'error';
    message?: string;
    serverId?: string;
  }> = [];

  for (const item of parsed.data.items) {
    try {
      if (item.entityType === 'production') {
        if (!['ADMIN', 'MANAGER', 'WORKER'].includes(req.user!.role)) {
          results.push({
            clientTxId: item.clientTxId,
            entityType: 'production',
            status: 'conflict',
            message: 'Role not authorized to sync production records',
          });
          continue;
        }
        const out = await createProductionRecord(
          {
            ...item.payload,
            clientTxId: item.clientTxId,
            syncedFromOffline: true,
          },
          req.user!,
          req.ip
        );
        results.push({
          clientTxId: item.clientTxId,
          entityType: 'production',
          status: out.duplicate ? 'duplicate' : 'synced',
          serverId: String(out.record._id),
        });
      } else if (item.entityType === 'sale') {
        if (!['ADMIN', 'MANAGER', 'SALESPERSON'].includes(req.user!.role)) {
          results.push({
            clientTxId: item.clientTxId,
            entityType: 'sale',
            status: 'conflict',
            message: 'Role not authorized to sync sales records',
          });
          continue;
        }
        const out = await createSaleRecord(
          {
            ...item.payload,
            clientTxId: item.clientTxId,
            syncedFromOffline: true,
          },
          req.user!,
          req.ip
        );
        results.push({
          clientTxId: item.clientTxId,
          entityType: 'sale',
          status: out.duplicate ? 'duplicate' : 'synced',
          serverId: String(out.record._id),
        });
      }
    } catch (err) {
      if (err instanceof BusinessError) {
        results.push({
          clientTxId: item.clientTxId,
          entityType: item.entityType,
          status: err.status === 409 ? 'conflict' : 'error',
          message: err.message,
        });
      } else {
        results.push({
          clientTxId: item.clientTxId,
          entityType: item.entityType,
          status: 'error',
          message: err instanceof Error ? err.message : 'Sync failed',
        });
      }
    }
  }

  res.json({ results });
});

export default router;
