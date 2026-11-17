export type UserRole = 'ADMIN' | 'MANAGER' | 'WORKER' | 'SALESPERSON';
export type LanguageCode = 'en' | 'so';
export type BlockType = 'hollow' | 'solid' | 'paving';
export type ProductionStatus = 'curing' | 'ready';
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer';
export type ExpenseCategory =
  | 'cement'
  | 'sand'
  | 'aggregate'
  | 'salaries'
  | 'transportation'
  | 'electricity'
  | 'water'
  | 'maintenance'
  | 'other';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  preferredLanguage: LanguageCode;
  isActive?: boolean;
  lastLoginAt?: string;
}

export interface ProductItem {
  id: string;
  name: string;
  code: string;
  dimensions: string;
  unitPrice: number;
  openingStock: number;
  availableStock: number;
  curingStock: number;
  damagedStock: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export interface InventorySummaryItem extends ProductItem {
  readyProduction: number;
  curingBlocks: number;
  soldBlocks: number;
  damagedBlocks: number;
  adjustments: number;
  computedStock: number;
  isLowStock: boolean;
}

export interface ProductionRecord {
  id: string;
  clientTxId?: string;
  productionDate: string;
  productId: string;
  blockSize: string;
  blockType: BlockType;
  quantityProduced: number;
  damagedQuantity: number;
  productionTeam: string;
  workerName: string;
  batchNumber: string;
  notes: string;
  status: ProductionStatus;
  syncedFromOffline?: boolean;
  recordedBy?: { _id?: string; name?: string; role?: UserRole } | string;
}

export interface SaleRecord {
  id: string;
  clientTxId?: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  saleDate: string;
  productId: string;
  blockSize: string;
  quantitySold: number;
  unitPrice: number;
  totalAmount: number;
  amountPaid: number;
  remainingBalance: number;
  paymentMethod: PaymentMethod;
  status: 'completed' | 'cancelled';
  notes: string;
  syncedFromOffline?: boolean;
  soldBy?: { _id?: string; name?: string; role?: UserRole } | string;
}

export interface CustomerRecord {
  id: string;
  name: string;
  phone: string;
  address: string;
  totalPurchases: number;
  totalPaid: number;
  outstandingDebt: number;
  notes: string;
  createdAt?: string;
}

export interface ExpenseRecord {
  id: string;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  responsibleEmployee: string;
  recordedBy?: { name?: string };
}

export interface CompanySettingsData {
  companyName: string;
  companyLogo: string;
  companyAddress: string;
  phoneNumber: string;
  currency: string;
  defaultLanguage: LanguageCode;
  lowStockAlertDefault: number;
  invoiceFooterNote: string;
}

export interface DashboardData {
  kpis: {
    productionToday: number;
    salesToday: number;
    availableStock: number;
    todayRevenue: number;
    monthlyProduction: number;
    monthlySales: number;
    damagedBlocks: number;
    outstandingDebts: number;
  };
  dailyChart: Array<{ date: string; produced: number; sold: number; revenue: number }>;
  monthlyChart: Array<{ month: string; produced: number; sold: number; revenue: number; expenses: number }>;
  inventoryOverview: Array<{
    id: string;
    name: string;
    code: string;
    availableStock: number;
    curingStock: number;
    damagedStock: number;
    lowStockThreshold: number;
  }>;
  lowStockAlerts: Array<{
    id: string;
    name: string;
    availableStock: number;
    lowStockThreshold: number;
  }>;
  recentTransactions: Array<{
    id: string;
    kind: 'sale' | 'production';
    title: string;
    subtitle: string;
    amount: number;
    status: string;
    date: string;
  }>;
}
