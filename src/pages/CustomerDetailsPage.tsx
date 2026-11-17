import { ArrowLeft, DollarSign } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import type { CustomerRecord, PaymentMethod } from '../types/index.ts';

interface CustomerDetailsResponse {
  customer: CustomerRecord;
  sales: Array<{
    id: string;
    invoiceNumber: string;
    saleDate: string;
    blockSize: string;
    quantitySold: number;
    totalAmount: number;
    amountPaid: number;
    remainingBalance: number;
    status: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    notes: string;
    recordedBy?: { name?: string };
  }>;
}

export const CustomerDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { settings } = useAuth();

  const [details, setDetails] = useState<CustomerDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Payment modal
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payNotes, setPayNotes] = useState('');
  const [savingPay, setSavingPay] = useState(false);

  const loadDetails = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<CustomerDetailsResponse>(`/api/customers/${id}`);
      setDetails(data);
      setPayAmount(data.customer.outstandingDebt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingPay(true);
    setError('');
    try {
      await apiFetch(`/api/customers/${id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: payAmount,
          paymentMethod: payMethod,
          notes: payNotes,
        }),
      });
      setShowPay(false);
      setPayNotes('');
      await loadDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSavingPay(false);
    }
  };

  const fmtMoney = (n: number) =>
    `${settings.currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return <div className="text-xs text-[#7B8790] py-8">{t('common.loading')}</div>;
  }

  if (!details) {
    return <div className="text-xs text-[#C96D6D] py-8">{error || t('common.noData')}</div>;
  }

  const { customer, sales, payments } = details;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/customers"
            className="inline-flex items-center gap-1 rounded-lg border border-[#E8EDF1] bg-white px-3 py-1.5 text-xs font-medium text-[#273746]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>{t('common.back')}</span>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#273746]">{customer.name}</h1>
            <div className="text-xs text-[#7B8790]">
              {customer.phone} {customer.address ? `· ${customer.address}` : ''}
            </div>
          </div>
        </div>

        {customer.outstandingDebt > 0 && (
          <button
            type="button"
            onClick={() => setShowPay(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4D947C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3f7d68]"
          >
            <DollarSign className="h-3.5 w-3.5" />
            <span>{t('customers.recordPayment')}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-4 py-2.5 text-xs font-medium text-[#C96D6D]">
          {error}
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
          <div className="text-xs text-[#7B8790]">{t('customers.totalPurchases')}</div>
          <div className="mt-1 text-2xl font-bold text-[#273746] tabular-nums">{fmtMoney(customer.totalPurchases)}</div>
        </div>
        <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
          <div className="text-xs text-[#7B8790]">{t('customers.totalPaid')}</div>
          <div className="mt-1 text-2xl font-bold text-[#4D947C] tabular-nums">{fmtMoney(customer.totalPaid)}</div>
        </div>
        <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
          <div className="text-xs text-[#7B8790]">{t('customers.outstandingDebt')}</div>
          <div className="mt-1 text-2xl font-bold text-[#D6A451] tabular-nums">{fmtMoney(customer.outstandingDebt)}</div>
        </div>
      </div>

      {/* Purchase History */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E8EDF1]">
          <h2 className="text-sm font-semibold text-[#273746]">{t('customers.purchaseHistory')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-[#7B8790]">
                <th className="px-4 py-2.5 font-medium">{t('sales.invoiceNumber')}</th>
                <th className="px-4 py-2.5 font-medium">{t('common.date')}</th>
                <th className="px-4 py-2.5 font-medium">{t('sales.blockSize')}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t('sales.quantitySold')}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t('sales.totalAmount')}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t('sales.remainingBalance')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#7B8790]">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#18334A]">{s.invoiceNumber}</td>
                    <td className="px-4 py-2.5 tabular-nums text-[#7B8790]">
                      {new Date(s.saleDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-[#273746]">{s.blockSize}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{s.quantitySold.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{fmtMoney(s.totalAmount)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[#D6A451]">
                      {fmtMoney(s.remainingBalance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E8EDF1]">
          <h2 className="text-sm font-semibold text-[#273746]">{t('customers.paymentHistory')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-[#7B8790]">
                <th className="px-4 py-2.5 font-medium">{t('common.date')}</th>
                <th className="px-4 py-2.5 font-medium">{t('sales.paymentMethod')}</th>
                <th className="px-4 py-2.5 font-medium text-right">{t('common.amount')}</th>
                <th className="px-4 py-2.5 font-medium">{t('common.notes')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#7B8790]">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 tabular-nums text-[#7B8790]">
                      {new Date(p.paymentDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5 text-[#273746]">{t(`sales.methods.${p.paymentMethod}`)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[#4D947C]">
                      {fmtMoney(p.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-[#7B8790]">{p.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleRecordPayment} className="w-full max-w-md rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-[#273746]">{t('customers.recordPayment')}</h2>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">
                {t('common.amount')} ({settings.currency})
              </label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                max={customer.outstandingDebt}
                required
                value={payAmount}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('sales.paymentMethod')}</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              >
                <option value="cash">{t('sales.methods.cash')}</option>
                <option value="mobile_money">{t('sales.methods.mobile_money')}</option>
                <option value="bank_transfer">{t('sales.methods.bank_transfer')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('common.notes')}</label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPay(false)}
                className="rounded-lg border border-[#E8EDF1] px-4 py-2 text-xs font-semibold text-[#273746]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={savingPay}
                className="rounded-lg bg-[#4D947C] px-4 py-2 text-xs font-semibold text-white"
              >
                {savingPay ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
