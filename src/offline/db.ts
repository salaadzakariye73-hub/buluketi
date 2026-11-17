import Dexie, { type Table } from 'dexie';
import type {
  BlockType,
  CustomerRecord,
  DashboardData,
  PaymentMethod,
  ProductItem,
  ProductionRecord,
  ProductionStatus,
  SaleRecord,
} from '../types/index.ts';

export interface QueuedProductionPayload {
  productionDate: string;
  productId: string;
  blockSizeLabel: string;
  blockType: BlockType;
  quantityProduced: number;
  damagedQuantity: number;
  productionTeam: string;
  workerName: string;
  batchNumber: string;
  notes: string;
  status: ProductionStatus;
}

export interface QueuedSalePayload {
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  saleDate: string;
  productId: string;
  blockSizeLabel: string;
  quantitySold: number;
  unitPrice: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  notes: string;
}

export interface SyncQueueItem {
  id?: number;
  clientTxId: string;
  entityType: 'production' | 'sale';
  payload: QueuedProductionPayload | QueuedSalePayload;
  createdAtClient: string;
  userId: string;
  userName: string;
  status: 'pending' | 'syncing' | 'conflict' | 'error';
  errorMessage?: string;
}

export interface CachedDashboardEntry {
  key: string;
  updatedAt: string;
  data: DashboardData;
}

class BulukeetiOfflineDB extends Dexie {
  syncQueue!: Table<SyncQueueItem, number>;
  cachedProducts!: Table<ProductItem, string>;
  cachedCustomers!: Table<CustomerRecord, string>;
  cachedProductions!: Table<ProductionRecord, string>;
  cachedSales!: Table<SaleRecord, string>;
  cachedDashboard!: Table<CachedDashboardEntry, string>;

  constructor() {
    super('BulukeetiProOfflineDB');
    this.version(1).stores({
      syncQueue: '++id, clientTxId, entityType, status, createdAtClient',
      cachedProducts: 'id, name, code',
      cachedCustomers: 'id, name, phone',
      cachedProductions: 'id, productionDate, blockSize, status',
      cachedSales: 'id, invoiceNumber, saleDate, customerName',
      cachedDashboard: 'key',
    });
  }
}

export const offlineDB = new BulukeetiOfflineDB();
