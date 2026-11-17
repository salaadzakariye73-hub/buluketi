import crypto from 'crypto';
import type { AuthUserPayload } from '../middleware/auth.ts';
import { recordAudit } from '../middleware/auth.ts';
import {
  Customer,
  InventoryTransaction,
  Payment,
  Product,
  Production,
  Sale,
  type BlockType,
  type IProduction,
  type ISale,
  type PaymentMethod,
  type ProductionStatus,
} from '../models/index.ts';

export class BusinessError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 400, code = 'BUSINESS_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface CreateProductionInput {
  clientTxId?: string;
  productionDate: string | Date;
  productId: string;
  blockType: BlockType;
  quantityProduced: number;
  damagedQuantity?: number;
  productionTeam: string;
  workerName: string;
  batchNumber: string;
  notes?: string;
  status: ProductionStatus;
  syncedFromOffline?: boolean;
}

export async function createProductionRecord(
  input: CreateProductionInput,
  actor: AuthUserPayload,
  ipAddress = ''
): Promise<{ duplicate: boolean; record: IProduction }> {
  if (input.clientTxId) {
    const existing = await Production.findOne({ clientTxId: input.clientTxId });
    if (existing) {
      return { duplicate: true, record: existing };
    }
  }

  const product = await Product.findById(input.productId);
  if (!product || !product.isActive) {
    throw new BusinessError('Selected block size product not found or inactive', 404, 'PRODUCT_NOT_FOUND');
  }

  const damagedQty = Math.max(0, Number(input.damagedQuantity || 0));
  if (damagedQty > input.quantityProduced) {
    throw new BusinessError('Damaged quantity cannot exceed produced quantity', 400, 'INVALID_DAMAGE_QTY');
  }

  const production = await Production.create({
    clientTxId: input.clientTxId || undefined,
    productionDate: new Date(input.productionDate),
    productId: product._id,
    blockSize: product.name,
    blockType: input.blockType,
    quantityProduced: input.quantityProduced,
    damagedQuantity: damagedQty,
    productionTeam: input.productionTeam.trim(),
    workerName: input.workerName.trim(),
    batchNumber: input.batchNumber.trim(),
    notes: (input.notes || '').trim(),
    status: input.status,
    recordedBy: actor.id,
    syncedFromOffline: Boolean(input.syncedFromOffline),
  });

  if (input.status === 'curing') {
    await Product.findByIdAndUpdate(product._id, {
      $inc: { curingStock: input.quantityProduced },
    });
  } else {
    const netGood = input.quantityProduced - damagedQty;
    const updatedProduct = await Product.findByIdAndUpdate(
      product._id,
      {
        $inc: {
          availableStock: netGood,
          damagedStock: damagedQty,
        },
      },
      { new: true }
    );

    await InventoryTransaction.create({
      clientTxId: input.clientTxId ? `${input.clientTxId}:prod` : undefined,
      productId: product._id,
      blockSize: product.name,
      type: 'production_ready',
      quantityDelta: netGood,
      balanceAfter: updatedProduct?.availableStock ?? netGood,
      referenceType: 'Production',
      referenceId: production._id,
      notes: `Batch ${production.batchNumber} ready for sale (${input.quantityProduced} produced, ${damagedQty} damaged)`,
      performedBy: actor.id,
    });
  }

  await recordAudit({
    user: actor,
    action: 'PRODUCTION_CREATED',
    entityType: 'Production',
    entityId: String(production._id),
    details: {
      blockSize: product.name,
      quantityProduced: input.quantityProduced,
      damagedQuantity: damagedQty,
      status: input.status,
      batchNumber: production.batchNumber,
      syncedFromOffline: Boolean(input.syncedFromOffline),
    },
    ipAddress,
  });

  return { duplicate: false, record: production };
}

export interface CreateSaleInput {
  clientTxId?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  saleDate: string | Date;
  productId: string;
  quantitySold: number;
  unitPrice?: number;
  amountPaid: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  syncedFromOffline?: boolean;
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `INV-${y}${m}${d}-${rand}`;
}

export async function createSaleRecord(
  input: CreateSaleInput,
  actor: AuthUserPayload,
  ipAddress = ''
): Promise<{ duplicate: boolean; record: ISale }> {
  if (input.clientTxId) {
    const existing = await Sale.findOne({ clientTxId: input.clientTxId });
    if (existing) {
      return { duplicate: true, record: existing };
    }
  }

  const product = await Product.findById(input.productId);
  if (!product || !product.isActive) {
    throw new BusinessError('Selected block size not found or inactive', 404, 'PRODUCT_NOT_FOUND');
  }

  // Atomic check & decrement: prevents race conditions and negative stock
  const updatedProduct = await Product.findOneAndUpdate(
    { _id: product._id, availableStock: { $gte: input.quantitySold } },
    { $inc: { availableStock: -input.quantitySold } },
    { new: true }
  );

  if (!updatedProduct) {
    throw new BusinessError(
      `Insufficient available stock for ${product.name}. Available: ${product.availableStock}, Requested: ${input.quantitySold}`,
      409,
      'INSUFFICIENT_STOCK'
    );
  }

  const unitPrice = typeof input.unitPrice === 'number' && input.unitPrice >= 0 ? input.unitPrice : product.unitPrice;
  const totalAmount = Number((input.quantitySold * unitPrice).toFixed(2));
  const amountPaid = Math.min(totalAmount, Math.max(0, Number(input.amountPaid || 0)));
  const remainingBalance = Number((totalAmount - amountPaid).toFixed(2));

  // Find or create customer
  let customer = input.customerId ? await Customer.findById(input.customerId) : null;
  if (!customer) {
    const trimmedPhone = input.customerPhone.trim();
    const trimmedName = input.customerName.trim();
    customer = await Customer.findOne({ phone: trimmedPhone });
    if (!customer) {
      customer = await Customer.create({
        name: trimmedName,
        phone: trimmedPhone,
        address: (input.customerAddress || '').trim(),
        totalPurchases: 0,
        totalPaid: 0,
        outstandingDebt: 0,
        createdBy: actor.id,
      });
    }
  }

  let sale: ISale;
  try {
    sale = await Sale.create({
      clientTxId: input.clientTxId || undefined,
      invoiceNumber: generateInvoiceNumber(),
      customerId: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone,
      saleDate: new Date(input.saleDate),
      productId: product._id,
      blockSize: product.name,
      quantitySold: input.quantitySold,
      unitPrice,
      totalAmount,
      amountPaid,
      remainingBalance,
      paymentMethod: input.paymentMethod,
      status: 'completed',
      notes: (input.notes || '').trim(),
      soldBy: actor.id,
      syncedFromOffline: Boolean(input.syncedFromOffline),
    });
  } catch (err) {
    // Rollback stock decrement if sale insert failed
    await Product.findByIdAndUpdate(product._id, { $inc: { availableStock: input.quantitySold } });
    throw err;
  }

  await Customer.findByIdAndUpdate(customer._id, {
    $inc: {
      totalPurchases: totalAmount,
      totalPaid: amountPaid,
      outstandingDebt: remainingBalance,
    },
  });

  if (amountPaid > 0) {
    await Payment.create({
      clientTxId: input.clientTxId ? `${input.clientTxId}:pay` : undefined,
      saleId: sale._id,
      customerId: customer._id,
      amount: amountPaid,
      paymentMethod: input.paymentMethod,
      paymentDate: new Date(input.saleDate),
      notes: `Initial payment for ${sale.invoiceNumber}`,
      recordedBy: actor.id,
    });
  }

  await InventoryTransaction.create({
    clientTxId: input.clientTxId ? `${input.clientTxId}:inv` : undefined,
    productId: product._id,
    blockSize: product.name,
    type: 'sale',
    quantityDelta: -input.quantitySold,
    balanceAfter: updatedProduct.availableStock,
    referenceType: 'Sale',
    referenceId: sale._id,
    notes: `Sale ${sale.invoiceNumber} to ${customer.name}`,
    performedBy: actor.id,
  });

  await recordAudit({
    user: actor,
    action: 'SALE_CREATED',
    entityType: 'Sale',
    entityId: String(sale._id),
    details: {
      invoiceNumber: sale.invoiceNumber,
      blockSize: product.name,
      quantitySold: input.quantitySold,
      totalAmount,
      amountPaid,
      remainingBalance,
      syncedFromOffline: Boolean(input.syncedFromOffline),
    },
    ipAddress,
  });

  return { duplicate: false, record: sale };
}
