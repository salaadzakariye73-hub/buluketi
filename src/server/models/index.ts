import mongoose, { Schema, type Document, type Model } from 'mongoose';

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

export interface IUser extends Document {
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: UserRole;
  preferredLanguage: LanguageCode;
  isActive: boolean;
  lastLoginAt?: Date;
  resetTokenHash?: string;
  resetTokenExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '', trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'MANAGER', 'WORKER', 'SALESPERSON'], required: true, default: 'WORKER' },
    preferredLanguage: { type: String, enum: ['en', 'so'], default: 'en' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    resetTokenHash: { type: String },
    resetTokenExpires: { type: Date },
  },
  { timestamps: true }
);

export interface IProduct extends Document {
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
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    code: { type: String, required: true, trim: true, unique: true },
    dimensions: { type: String, default: '', trim: true },
    unitPrice: { type: Number, required: true, min: 0 },
    openingStock: { type: Number, default: 0, min: 0 },
    availableStock: { type: Number, default: 0, min: 0 },
    curingStock: { type: Number, default: 0, min: 0 },
    damagedStock: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 500, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export interface IProduction extends Document {
  clientTxId?: string;
  productionDate: Date;
  productId: mongoose.Types.ObjectId;
  blockSize: string;
  blockType: BlockType;
  quantityProduced: number;
  damagedQuantity: number;
  productionTeam: string;
  workerName: string;
  batchNumber: string;
  notes: string;
  status: ProductionStatus;
  recordedBy: mongoose.Types.ObjectId;
  syncedFromOffline: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProductionSchema = new Schema<IProduction>(
  {
    clientTxId: { type: String, unique: true, sparse: true, trim: true },
    productionDate: { type: Date, required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    blockSize: { type: String, required: true, trim: true, index: true },
    blockType: { type: String, enum: ['hollow', 'solid', 'paving'], default: 'hollow' },
    quantityProduced: { type: Number, required: true, min: 1 },
    damagedQuantity: { type: Number, default: 0, min: 0 },
    productionTeam: { type: String, required: true, trim: true },
    workerName: { type: String, required: true, trim: true },
    batchNumber: { type: String, required: true, trim: true },
    notes: { type: String, default: '', trim: true },
    status: { type: String, enum: ['curing', 'ready'], required: true, default: 'curing', index: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    syncedFromOffline: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export interface IInventoryTransaction extends Document {
  clientTxId?: string;
  productId: mongoose.Types.ObjectId;
  blockSize: string;
  type: 'opening' | 'production_ready' | 'sale' | 'sale_cancelled' | 'damage' | 'adjustment';
  quantityDelta: number;
  balanceAfter: number;
  referenceType: string;
  referenceId?: mongoose.Types.ObjectId;
  notes: string;
  performedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const InventoryTransactionSchema = new Schema<IInventoryTransaction>(
  {
    clientTxId: { type: String, unique: true, sparse: true, trim: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    blockSize: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['opening', 'production_ready', 'sale', 'sale_cancelled', 'damage', 'adjustment'],
      required: true,
      index: true,
    },
    quantityDelta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    referenceType: { type: String, default: 'manual' },
    referenceId: { type: Schema.Types.ObjectId },
    notes: { type: String, default: '', trim: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export interface ICustomer extends Document {
  name: string;
  phone: string;
  address: string;
  totalPurchases: number;
  totalPaid: number;
  outstandingDebt: number;
  notes: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, required: true, trim: true, index: true },
    address: { type: String, default: '', trim: true },
    totalPurchases: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    outstandingDebt: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export interface ISale extends Document {
  clientTxId?: string;
  invoiceNumber: string;
  customerId: mongoose.Types.ObjectId;
  customerName: string;
  customerPhone: string;
  saleDate: Date;
  productId: mongoose.Types.ObjectId;
  blockSize: string;
  quantitySold: number;
  unitPrice: number;
  totalAmount: number;
  amountPaid: number;
  remainingBalance: number;
  paymentMethod: PaymentMethod;
  status: 'completed' | 'cancelled';
  notes: string;
  soldBy: mongoose.Types.ObjectId;
  cancelledBy?: mongoose.Types.ObjectId;
  cancelledAt?: Date;
  syncedFromOffline: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SaleSchema = new Schema<ISale>(
  {
    clientTxId: { type: String, unique: true, sparse: true, trim: true },
    invoiceNumber: { type: String, required: true, unique: true, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    customerName: { type: String, required: true, trim: true },
    customerPhone: { type: String, required: true, trim: true },
    saleDate: { type: Date, required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    blockSize: { type: String, required: true, trim: true, index: true },
    quantitySold: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ['cash', 'mobile_money', 'bank_transfer'], required: true },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed', index: true },
    notes: { type: String, default: '', trim: true },
    soldBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    syncedFromOffline: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export interface IPayment extends Document {
  clientTxId?: string;
  saleId?: mongoose.Types.ObjectId;
  customerId: mongoose.Types.ObjectId;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: Date;
  notes: string;
  recordedBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    clientTxId: { type: String, unique: true, sparse: true, trim: true },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: { type: String, enum: ['cash', 'mobile_money', 'bank_transfer'], required: true },
    paymentDate: { type: Date, required: true, default: Date.now },
    notes: { type: String, default: '', trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export interface IExpense extends Document {
  expenseDate: Date;
  category: ExpenseCategory;
  description: string;
  amount: number;
  responsibleEmployee: string;
  recordedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExpenseSchema = new Schema<IExpense>(
  {
    expenseDate: { type: Date, required: true, index: true },
    category: {
      type: String,
      enum: ['cement', 'sand', 'aggregate', 'salaries', 'transportation', 'electricity', 'water', 'maintenance', 'other'],
      required: true,
      index: true,
    },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    responsibleEmployee: { type: String, required: true, trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export interface IAuditLog extends Document {
  userId?: mongoose.Types.ObjectId;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true, index: true },
    entityId: { type: String },
    details: { type: Schema.Types.Mixed },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true }
);

export interface ICompanySettings extends Document {
  key: string;
  companyName: string;
  companyLogo: string;
  companyAddress: string;
  phoneNumber: string;
  currency: string;
  defaultLanguage: LanguageCode;
  lowStockAlertDefault: number;
  invoiceFooterNote: string;
  updatedAt: Date;
}

const CompanySettingsSchema = new Schema<ICompanySettings>(
  {
    key: { type: String, unique: true, default: 'default' },
    companyName: { type: String, required: true, default: 'BULUKEETI PRO Concrete Works' },
    companyLogo: { type: String, default: '' },
    companyAddress: { type: String, default: 'Mogadishu Industrial Zone, Somalia' },
    phoneNumber: { type: String, default: '+252 61 000 0000' },
    currency: { type: String, default: 'USD' },
    defaultLanguage: { type: String, enum: ['en', 'so'], default: 'en' },
    lowStockAlertDefault: { type: Number, default: 500, min: 0 },
    invoiceFooterNote: { type: String, default: 'Thank you for your business.' },
  },
  { timestamps: true }
);

function getModel<T extends Document>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);
}

export const User = getModel<IUser>('User', UserSchema);
export const Product = getModel<IProduct>('Product', ProductSchema);
export const Production = getModel<IProduction>('Production', ProductionSchema);
export const InventoryTransaction = getModel<IInventoryTransaction>('InventoryTransaction', InventoryTransactionSchema);
export const Customer = getModel<ICustomer>('Customer', CustomerSchema);
export const Sale = getModel<ISale>('Sale', SaleSchema);
export const Payment = getModel<IPayment>('Payment', PaymentSchema);
export const Expense = getModel<IExpense>('Expense', ExpenseSchema);
export const AuditLog = getModel<IAuditLog>('AuditLog', AuditLogSchema);
export const CompanySettings = getModel<ICompanySettings>('CompanySettings', CompanySettingsSchema);
