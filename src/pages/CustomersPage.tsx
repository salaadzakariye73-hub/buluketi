import { ArrowRight, Plus, Search } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useNetwork } from '../context/NetworkContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { offlineDB } from '../offline/db.ts';
import type { CustomerRecord } from '../types/index.ts';

export const CustomersPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const { isOnline } = useNetwork();

  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [search, setSearch] = useState('');
  const [debtOnly, setDebtOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Customer modal
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isOnline) {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (debtOnly) params.set('debtOnly', 'true');
        const list = await apiFetch<CustomerRecord[]>(`/api/customers?${params.toString()}`);
        setCustomers(list);
      } else {
        const cached = await offlineDB.cachedCustomers.toArray();
        setCustomers(cached);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [debtOnly, isOnline, search]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/customers', {
        method: 'POST',
        body: JSON.stringify({ name, phone, address, notes }),
      });
      setShowAdd(false);
      setName('');
      setPhone('');
      setAddress('');
      setNotes('');
      await loadCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  };

  const fmtMoney = (n: number) =>
    `${settings.currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('customers.title')}</h1>
        {isOnline && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#18334A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112638]"
          >
            <Plus className="h-4 w-4" />
            <span>{t('customers.addCustomer')}</span>
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 text-[#7B8790] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] pl-9 pr-3 py-2 text-xs text-[#273746]"
          />
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-[#273746] cursor-pointer">
          <input
            type="checkbox"
            checked={debtOnly}
            onChange={(e) => setDebtOnly(e.target.checked)}
            className="rounded border-[#E8EDF1]"
          />
          <span>{t('customers.debtOnlyFilter')}</span>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-4 py-2.5 text-xs font-medium text-[#C96D6D]">
          {error}
        </div>
      )}

      {/* Customer Table */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-xs text-[#7B8790]">
                <th className="px-4 py-3 font-medium">{t('customers.name')}</th>
                <th className="px-4 py-3 font-medium">{t('customers.phone')}</th>
                <th className="px-4 py-3 font-medium">{t('customers.address')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('customers.totalPurchases')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('customers.totalPaid')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('customers.outstandingDebt')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F5F7F8]">
                    <td className="px-4 py-3 text-xs font-semibold text-[#273746]">{c.name}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-[#7B8790]">{c.phone}</td>
                    <td className="px-4 py-3 text-xs text-[#7B8790]">{c.address || '—'}</td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#273746]">
                      {fmtMoney(c.totalPurchases)}
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#4D947C]">
                      {fmtMoney(c.totalPaid)}
                    </td>
                    <td className="px-4 py-3 text-xs text-right font-bold tabular-nums text-[#D6A451]">
                      {fmtMoney(c.outstandingDebt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/customers/${c.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#18334A] hover:underline"
                      >
                        <span>{t('customers.viewDetails')}</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleCreate} className="w-full max-w-md rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-[#273746]">{t('customers.addCustomer')}</h2>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('customers.name')}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('customers.phone')}</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('customers.address')}</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('common.notes')}</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-[#E8EDF1] px-4 py-2 text-xs font-semibold text-[#273746]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#18334A] px-4 py-2 text-xs font-semibold text-white"
              >
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
