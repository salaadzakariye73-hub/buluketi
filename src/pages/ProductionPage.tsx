import { CheckCircle2, Edit3, Plus, Search } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useNetwork } from '../context/NetworkContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { offlineDB, type QueuedProductionPayload, type SyncQueueItem } from '../offline/db.ts';
import { cacheProductionSnapshot } from '../offline/syncService.ts';
import type { ProductItem, ProductionRecord, ProductionStatus } from '../types/index.ts';

export const ProductionPage: React.FC = () => {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const { isOnline } = useNetwork();

  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [pendingOffline, setPendingOffline] = useState<SyncQueueItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [blockSize, setBlockSize] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Edit modal
  const [editing, setEditing] = useState<ProductionRecord | null>(null);
  const [editStatus, setEditStatus] = useState<ProductionStatus>('curing');
  const [editDamaged, setEditDamaged] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const queued = await offlineDB.syncQueue.where('entityType').equals('production').toArray();
      setPendingOffline(queued);

      if (isOnline) {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (blockSize) params.set('blockSize', blockSize);
        if (statusFilter) params.set('status', statusFilter);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);

        const [prodList, prodItems] = await Promise.all([
          apiFetch<ProductionRecord[]>(`/api/production?${params.toString()}`),
          apiFetch<ProductItem[]>('/api/products'),
        ]);
        setRecords(prodList);
        setProducts(prodItems);
        await cacheProductionSnapshot(prodList);
      } else {
        const [cachedRecs, cachedProds] = await Promise.all([
          offlineDB.cachedProductions.toArray(),
          offlineDB.cachedProducts.toArray(),
        ]);
        setRecords(cachedRecs);
        setProducts(cachedProds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load production');
    } finally {
      setLoading(false);
    }
  }, [blockSize, fromDate, isOnline, search, statusFilter, toDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleMarkReady = async (rec: ProductionRecord) => {
    try {
      await apiFetch(`/api/production/${rec.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ready' }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark ready');
    }
  };

  const openEdit = (rec: ProductionRecord) => {
    setEditing(rec);
    setEditStatus(rec.status);
    setEditDamaged(rec.damagedQuantity);
    setEditNotes(rec.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    setError('');
    try {
      await apiFetch(`/api/production/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: editStatus,
          damagedQuantity: editDamaged,
          notes: editNotes,
        }),
      });
      setEditing(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update batch');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('production.title')}</h1>
        <Link
          to="/production/new"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#18334A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112638] whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>{t('nav.addProduction')}</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative">
          <Search className="h-4 w-4 text-[#7B8790] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.search')}
            className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] pl-9 pr-3 py-2 text-xs text-[#273746]"
          />
        </div>
        <select
          value={blockSize}
          onChange={(e) => setBlockSize(e.target.value)}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs text-[#273746]"
        >
          <option value="">{t('common.all')} · {t('production.blockSize')}</option>
          {products.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs text-[#273746]"
        >
          <option value="">{t('common.all')} · {t('common.status')}</option>
          <option value="curing">{t('production.statuses.curing')}</option>
          <option value="ready">{t('production.statuses.ready')}</option>
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          aria-label={t('common.from')}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs text-[#273746]"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          aria-label={t('common.to')}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs text-[#273746]"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-4 py-2.5 text-xs font-medium text-[#C96D6D]">
          {error}
        </div>
      )}

      {/* Pending Offline Queue Preview */}
      {pendingOffline.length > 0 && (
        <div className="rounded-xl border border-[#D6A451]/40 bg-[#D6A451]/10 p-4">
          <h2 className="text-xs font-semibold text-[#273746] mb-2">
            {t('production.offlinePending')} ({pendingOffline.length})
          </h2>
          <div className="space-y-1.5 text-xs">
            {pendingOffline.map((q) => {
              const p = q.payload as QueuedProductionPayload;
              return (
                <div key={q.clientTxId} className="flex items-center justify-between">
                  <span>
                    {p.batchNumber} · {p.blockSizeLabel} · {p.quantityProduced.toLocaleString()} {t('common.blocks')} ({t(`production.statuses.${p.status}`)})
                  </span>
                  <span className="font-medium text-[#D6A451]">{q.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Production History Table */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-xs text-[#7B8790]">
                <th className="px-4 py-3 font-medium">{t('common.date')}</th>
                <th className="px-4 py-3 font-medium">{t('production.batchNumber')}</th>
                <th className="px-4 py-3 font-medium">{t('production.blockSize')}</th>
                <th className="px-4 py-3 font-medium">{t('production.blockType')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('production.quantityProduced')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('production.damagedQuantity')}</th>
                <th className="px-4 py-3 font-medium">{t('production.workerName')}</th>
                <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                records.map((rec) => (
                  <tr key={rec.id} className="hover:bg-[#F5F7F8]">
                    <td className="px-4 py-3 text-xs tabular-nums text-[#273746]">
                      {new Date(rec.productionDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono font-medium text-[#18334A]">{rec.batchNumber}</td>
                    <td className="px-4 py-3 text-xs font-medium text-[#273746]">{rec.blockSize}</td>
                    <td className="px-4 py-3 text-xs text-[#7B8790]">{t(`production.types.${rec.blockType}`)}</td>
                    <td className="px-4 py-3 text-xs text-right font-semibold tabular-nums text-[#273746]">
                      {rec.quantityProduced.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#C96D6D]">
                      {rec.damagedQuantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#273746]">
                      {rec.workerName} <span className="text-[#7B8790]">· {rec.productionTeam}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {rec.status === 'ready' ? (
                        <span className="text-[#4D947C]">{t('production.statuses.ready')}</span>
                      ) : (
                        <span className="text-[#D6A451]">{t('production.statuses.curing')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {isOnline && rec.status === 'curing' && hasRole('ADMIN', 'MANAGER', 'WORKER') && (
                          <button
                            type="button"
                            onClick={() => void handleMarkReady(rec)}
                            title={t('production.markReady')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#4D947C] hover:underline"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="hidden xl:inline">{t('production.markReady')}</span>
                          </button>
                        )}
                        {isOnline && (hasRole('ADMIN', 'MANAGER') || rec.status === 'curing') && (
                          <button
                            type="button"
                            onClick={() => openEdit(rec)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#18334A] hover:underline"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>{t('common.edit')}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleSaveEdit} className="w-full max-w-md rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-[#273746]">
              {t('production.editBatch')} · {editing.batchNumber}
            </h2>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('production.status')}</label>
              <select
                value={editStatus}
                disabled={editing.status === 'ready'}
                onChange={(e) => setEditStatus(e.target.value as ProductionStatus)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm text-[#273746]"
              >
                <option value="curing">{t('production.statuses.curing')}</option>
                <option value="ready">{t('production.statuses.ready')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('production.damagedQuantity')}</label>
              <input
                type="number"
                min={0}
                max={editing.quantityProduced}
                value={editDamaged}
                onChange={(e) => setEditDamaged(Number(e.target.value))}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm text-[#273746] tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('common.notes')}</label>
              <textarea
                rows={2}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm text-[#273746]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-[#E8EDF1] px-4 py-2 text-xs font-semibold text-[#273746]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-lg bg-[#18334A] px-4 py-2 text-xs font-semibold text-white"
              >
                {savingEdit ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
