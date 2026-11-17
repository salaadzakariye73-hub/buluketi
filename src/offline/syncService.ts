import { apiFetch } from '../lib/api.ts';
import type {
  AuthUser,
  CustomerRecord,
  DashboardData,
  ProductItem,
  ProductionRecord,
  SaleRecord,
} from '../types/index.ts';
import {
  offlineDB,
  type QueuedProductionPayload,
  type QueuedSalePayload,
  type SyncQueueItem,
} from './db.ts';

export function generateClientTxId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function queueOfflineProduction(payload: QueuedProductionPayload, user: AuthUser): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    clientTxId: generateClientTxId(),
    entityType: 'production',
    payload,
    createdAtClient: new Date().toISOString(),
    userId: user.id,
    userName: user.name,
    status: 'pending',
  };
  await offlineDB.syncQueue.add(item);

  // Update provisional cached stock locally if ready
  if (payload.status === 'ready') {
    const prod = await offlineDB.cachedProducts.get(payload.productId);
    if (prod) {
      const netGood = Math.max(0, payload.quantityProduced - payload.damagedQuantity);
      await offlineDB.cachedProducts.update(prod.id, {
        availableStock: prod.availableStock + netGood,
        damagedStock: prod.damagedStock + payload.damagedQuantity,
      });
    }
  }
  return item;
}

export async function queueOfflineSale(payload: QueuedSalePayload, user: AuthUser): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    clientTxId: generateClientTxId(),
    entityType: 'sale',
    payload,
    createdAtClient: new Date().toISOString(),
    userId: user.id,
    userName: user.name,
    status: 'pending',
  };
  await offlineDB.syncQueue.add(item);

  // Provisionally reduce cached stock locally
  const prod = await offlineDB.cachedProducts.get(payload.productId);
  if (prod) {
    await offlineDB.cachedProducts.update(prod.id, {
      availableStock: Math.max(0, prod.availableStock - payload.quantitySold),
    });
  }
  return item;
}

export async function cacheReferenceData(): Promise<void> {
  try {
    const [products, customers] = await Promise.all([
      apiFetch<ProductItem[]>('/api/products'),
      apiFetch<CustomerRecord[]>('/api/customers').catch(() => [] as CustomerRecord[]),
    ]);
    await offlineDB.cachedProducts.clear();
    if (products.length > 0) await offlineDB.cachedProducts.bulkPut(products);

    if (customers.length > 0) {
      await offlineDB.cachedCustomers.clear();
      await offlineDB.cachedCustomers.bulkPut(customers);
    }
  } catch {
    // Ignore cache refresh errors when offline
  }
}

export async function cacheDashboardSnapshot(data: DashboardData): Promise<void> {
  await offlineDB.cachedDashboard.put({
    key: 'latest',
    updatedAt: new Date().toISOString(),
    data,
  });
}

export async function cacheProductionSnapshot(records: ProductionRecord[]): Promise<void> {
  await offlineDB.cachedProductions.clear();
  if (records.length > 0) await offlineDB.cachedProductions.bulkPut(records);
}

export async function cacheSalesSnapshot(records: SaleRecord[]): Promise<void> {
  await offlineDB.cachedSales.clear();
  if (records.length > 0) await offlineDB.cachedSales.bulkPut(records);
}

export interface SyncRunSummary {
  synced: number;
  duplicates: number;
  conflicts: number;
  errors: number;
}

export async function runPendingSync(): Promise<SyncRunSummary> {
  const pending = await offlineDB.syncQueue.where('status').anyOf(['pending', 'error']).toArray();
  if (pending.length === 0) {
    return { synced: 0, duplicates: 0, conflicts: 0, errors: 0 };
  }

  const batchItems = pending.map((item) => {
    if (item.entityType === 'production') {
      const p = item.payload as QueuedProductionPayload;
      return {
        clientTxId: item.clientTxId,
        entityType: 'production' as const,
        createdAtClient: item.createdAtClient,
        payload: {
          productionDate: p.productionDate,
          productId: p.productId,
          blockType: p.blockType,
          quantityProduced: p.quantityProduced,
          damagedQuantity: p.damagedQuantity,
          productionTeam: p.productionTeam,
          workerName: p.workerName,
          batchNumber: p.batchNumber,
          notes: p.notes,
          status: p.status,
        },
      };
    }
    const s = item.payload as QueuedSalePayload;
    return {
      clientTxId: item.clientTxId,
      entityType: 'sale' as const,
      createdAtClient: item.createdAtClient,
      payload: {
        customerId: s.customerId,
        customerName: s.customerName,
        customerPhone: s.customerPhone,
        customerAddress: s.customerAddress,
        saleDate: s.saleDate,
        productId: s.productId,
        quantitySold: s.quantitySold,
        unitPrice: s.unitPrice,
        amountPaid: s.amountPaid,
        paymentMethod: s.paymentMethod,
        notes: s.notes,
      },
    };
  });

  const response = await apiFetch<{
    results: Array<{
      clientTxId: string;
      status: 'synced' | 'duplicate' | 'conflict' | 'error';
      message?: string;
    }>;
  }>('/api/sync/batch', {
    method: 'POST',
    body: JSON.stringify({ items: batchItems }),
  });

  const summary: SyncRunSummary = { synced: 0, duplicates: 0, conflicts: 0, errors: 0 };

  for (const res of response.results) {
    const queueRow = pending.find((q) => q.clientTxId === res.clientTxId);
    if (!queueRow?.id) continue;

    if (res.status === 'synced') {
      await offlineDB.syncQueue.delete(queueRow.id);
      summary.synced++;
    } else if (res.status === 'duplicate') {
      await offlineDB.syncQueue.delete(queueRow.id);
      summary.duplicates++;
    } else if (res.status === 'conflict') {
      await offlineDB.syncQueue.update(queueRow.id, {
        status: 'conflict',
        errorMessage: res.message || 'Stock or authorization conflict',
      });
      summary.conflicts++;
    } else {
      await offlineDB.syncQueue.update(queueRow.id, {
        status: 'error',
        errorMessage: res.message || 'Sync error',
      });
      summary.errors++;
    }
  }

  await cacheReferenceData();
  return summary;
}
