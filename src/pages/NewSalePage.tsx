import { ArrowLeft } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useNetwork } from '../context/NetworkContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { offlineDB } from '../offline/db.ts';
import { generateClientTxId, queueOfflineSale } from '../offline/syncService.ts';
import type { CustomerRecord, PaymentMethod, ProductItem } from '../types/index.ts';

export const NewSalePage: React.FC = () => {
  const { t } = useTranslation();
  const { user, settings, hasRole } = useAuth();
  const { isOnline, refreshQueueState } = useNetwork();
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [productId, setProductId] = useState('');
  const [quantitySold, setQuantitySold] = useState<number>(100);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [paidManuallyEdited, setPaidManuallyEdited] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [offlineMsg, setOfflineMsg] = useState('');

  useEffect(() => {
    const loadRef = async () => {
      try {
        if (isOnline) {
          const [prodList, custList] = await Promise.all([
            apiFetch<ProductItem[]>('/api/products'),
            apiFetch<CustomerRecord[]>('/api/customers'),
          ]);
          const active = prodList.filter((p) => p.isActive);
          setProducts(active);
          setCustomers(custList);
          if (active.length > 0) {
            setProductId(active[0].id);
            setUnitPrice(active[0].unitPrice);
          }
        } else {
          const [cachedProds, cachedCusts] = await Promise.all([
            offlineDB.cachedProducts.toArray(),
            offlineDB.cachedCustomers.toArray(),
          ]);
          const active = cachedProds.filter((p) => p.isActive);
          setProducts(active);
          setCustomers(cachedCusts);
          if (active.length > 0) {
            setProductId(active[0].id);
            setUnitPrice(active[0].unitPrice);
          }
        }
      } catch {
        const cachedProds = await offlineDB.cachedProducts.toArray();
        setProducts(cachedProds);
        if (cachedProds.length > 0) {
          setProductId(cachedProds[0].id);
          setUnitPrice(cachedProds[0].unitPrice);
        }
      }
    };
    void loadRef();
  }, [isOnline]);

  const selectedProduct = products.find((p) => p.id === productId);
  const totalAmount = Number((quantitySold * unitPrice).toFixed(2));
  const remainingBalance = Math.max(0, Number((totalAmount - amountPaid).toFixed(2)));

  useEffect(() => {
    if (!paidManuallyEdited) {
      setAmountPaid(totalAmount);
    }
  }, [totalAmount, paidManuallyEdited]);

  const handleProductChange = (newId: string) => {
    setProductId(newId);
    const p = products.find((x) => x.id === newId);
    if (p) setUnitPrice(p.unitPrice);
  };

  const handleCustomerSelect = (cid: string) => {
    setSelectedCustomerId(cid);
    if (!cid) {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      return;
    }
    const c = customers.find((x) => x.id === cid);
    if (c) {
      setCustomerName(c.name);
      setCustomerPhone(c.phone);
      setCustomerAddress(c.address || '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOfflineMsg('');

    if (!selectedProduct) {
      setError(t('common.requiredField'));
      return;
    }
    if (quantitySold > selectedProduct.availableStock) {
      setError(`${t('sales.insufficientStock')} (${selectedProduct.availableStock.toLocaleString()})`);
      return;
    }

    setSubmitting(true);
    try {
      if (isOnline) {
        await apiFetch('/api/sales', {
          method: 'POST',
          body: JSON.stringify({
            clientTxId: generateClientTxId(),
            customerId: selectedCustomerId || undefined,
            customerName,
            customerPhone,
            customerAddress,
            saleDate,
            productId,
            quantitySold,
            unitPrice,
            amountPaid,
            paymentMethod,
            notes,
          }),
        });
        navigate('/sales');
      } else if (user) {
        await queueOfflineSale(
          {
            customerId: selectedCustomerId || undefined,
            customerName,
            customerPhone,
            customerAddress,
            saleDate,
            productId,
            blockSizeLabel: selectedProduct.name,
            quantitySold,
            unitPrice,
            amountPaid,
            paymentMethod,
            notes,
          },
          user
        );
        await refreshQueueState();
        setOfflineMsg(t('common.offlineQueuedSuccess'));
        setTimeout(() => navigate('/sales'), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sale');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link
          to="/sales"
          className="inline-flex items-center gap-1 rounded-lg border border-[#E8EDF1] bg-white px-3 py-1.5 text-xs font-medium text-[#273746] hover:bg-[#F5F7F8]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('common.back')}</span>
        </Link>
        <h1 className="text-xl font-bold text-[#273746]">{t('sales.newSaleTitle')}</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-4 py-3 text-xs font-medium text-[#C96D6D]">
          {error}
        </div>
      )}

      {offlineMsg && (
        <div className="rounded-lg border border-[#4D947C]/30 bg-[#4D947C]/10 px-4 py-3 text-xs font-medium text-[#4D947C]">
          {offlineMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('sales.selectCustomer')}</label>
          <select
            value={selectedCustomerId}
            onChange={(e) => handleCustomerSelect(e.target.value)}
            className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
          >
            <option value="">— {t('sales.newCustomerMode')} —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.phone})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('sales.customerName')}</label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('sales.customerPhone')}</label>
            <input
              type="text"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('sales.saleDate')}</label>
            <input
              type="date"
              required
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('sales.blockSize')}</label>
            <select
              required
              value={productId}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {t('inventory.availableStock')}: {p.availableStock.toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('sales.quantitySold')}</label>
            <input
              type="number"
              min={1}
              required
              value={quantitySold}
              onChange={(e) => setQuantitySold(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm tabular-nums text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">
              {t('sales.unitPrice')} ({settings.currency})
            </label>
            <input
              type="number"
              step="0.01"
              min={0}
              required
              readOnly={!hasRole('ADMIN', 'MANAGER')}
              value={unitPrice}
              onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm tabular-nums text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">
              {t('sales.amountPaid')} ({settings.currency})
            </label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={totalAmount}
              required
              value={amountPaid}
              onChange={(e) => {
                setPaidManuallyEdited(true);
                setAmountPaid(Math.max(0, Number(e.target.value)));
              }}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm tabular-nums text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('sales.paymentMethod')}</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            >
              <option value="cash">{t('sales.methods.cash')}</option>
              <option value="mobile_money">{t('sales.methods.mobile_money')}</option>
              <option value="bank_transfer">{t('sales.methods.bank_transfer')}</option>
            </select>
          </div>
        </div>

        {/* Summary Calculation Strip */}
        <div className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] p-4 grid grid-cols-3 gap-4 text-xs">
          <div>
            <div className="text-[#7B8790]">{t('sales.totalAmount')}</div>
            <div className="text-base font-bold text-[#18334A] tabular-nums mt-0.5">
              {settings.currency} {totalAmount.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[#7B8790]">{t('sales.amountPaid')}</div>
            <div className="text-base font-bold text-[#4D947C] tabular-nums mt-0.5">
              {settings.currency} {amountPaid.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[#7B8790]">{t('sales.remainingBalance')}</div>
            <div className="text-base font-bold text-[#D6A451] tabular-nums mt-0.5">
              {settings.currency} {remainingBalance.toFixed(2)}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('common.notes')}</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            to="/sales"
            className="rounded-lg border border-[#E8EDF1] px-4 py-2.5 text-xs font-semibold text-[#273746]"
          >
            {t('common.cancel')}
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#4D947C] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#3f7d68] disabled:opacity-60"
          >
            {submitting ? t('common.saving') : t('sales.completeSale')}
          </button>
        </div>
      </form>
    </div>
  );
};
