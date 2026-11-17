import { Search, SlidersHorizontal } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.tsx';
import { useNetwork } from '../context/NetworkContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { offlineDB } from '../offline/db.ts';
import type { InventorySummaryItem } from '../types/index.ts';

interface StockTx {
  id: string;
  blockSize: string;
  type: 'opening' | 'production_ready' | 'sale' | 'sale_cancelled' | 'damage' | 'adjustment';
  quantityDelta: number;
  balanceAfter: number;
  notes: string;
  performedBy?: { name?: string };
  createdAt: string;
}

export const InventoryPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, hasRole } = useAuth();
  const { isOnline } = useNetwork();

  const [items, setItems] = useState<InventorySummaryItem[]>([]);
  const [transactions, setTransactions] = useState<StockTx[]>([]);
  const [search, setSearch] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Adjustment modal
  const [adjustTarget, setAdjustTarget] = useState<InventorySummaryItem | null>(null);
  const [adjType, setAdjType] = useState<'opening' | 'damage' | 'adjustment'>('opening');
  const [adjQty, setAdjQty] = useState(100);
  const [adjNotes, setAdjNotes] = useState('');
  const [savingAdj, setSavingAdj] = useState(false);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isOnline) {
        const [summary, txs] = await Promise.all([
          apiFetch<InventorySummaryItem[]>('/api/inventory/summary'),
          hasRole('ADMIN', 'MANAGER', 'SALESPERSON')
            ? apiFetch<StockTx[]>('/api/inventory/transactions')
            : Promise.resolve([] as StockTx[]),
        ]);
        setItems(summary);
        setTransactions(txs);
      } else {
        const cached = await offlineDB.cachedProducts.toArray();
        setItems(
          cached.map((p) => ({
            ...p,
            readyProduction: 0,
            curingBlocks: p.curingStock,
            soldBlocks: 0,
            damagedBlocks: p.damagedStock,
            adjustments: 0,
            computedStock: p.availableStock,
            isLowStock: p.availableStock <= p.lowStockThreshold,
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [hasRole, isOnline]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    setSavingAdj(true);
    setError('');
    try {
      await apiFetch(`/api/products/${adjustTarget.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          type: adjType,
          quantity: adjQty,
          notes: adjNotes,
        }),
      });
      setAdjustTarget(null);
      setAdjNotes('');
      await loadInventory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjustment failed');
    } finally {
      setSavingAdj(false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (onlyLowStock && !item.isLowStock) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return item.name.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('inventory.title')}</h1>
          <p className="text-xs text-[#7B8790] mt-0.5">{t('inventory.formulaNote')}</p>
        </div>
      </div>

      {/* Filter Bar */}
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
            checked={onlyLowStock}
            onChange={(e) => setOnlyLowStock(e.target.checked)}
            className="rounded border-[#E8EDF1]"
          />
          <span>{t('inventory.lowStock')}</span>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-4 py-2.5 text-xs font-medium text-[#C96D6D]">
          {error}
        </div>
      )}

      {/* Stock Balance Table */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-xs text-[#7B8790]">
                <th className="px-4 py-3 font-medium">{t('production.blockSize')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('inventory.unitPrice')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('inventory.openingStock')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('inventory.readyProduction')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('inventory.curingStock')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('inventory.soldBlocks')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('inventory.damagedBlocks')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('inventory.availableStock')}</th>
                <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                {hasRole('ADMIN', 'MANAGER') && isOnline && (
                  <th className="px-4 py-3 font-medium text-right">{t('common.actions')}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F5F7F8]">
                    <td className="px-4 py-3">
                      <div className="text-xs font-semibold text-[#273746]">{item.name}</div>
                      <div className="text-[11px] text-[#7B8790]">
                        {item.code} {item.dimensions ? `· ${item.dimensions}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#273746]">
                      {settings.currency} {item.unitPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#7B8790]">
                      {item.openingStock.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#4D947C]">
                      +{item.readyProduction.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#D6A451]">
                      {item.curingBlocks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#273746]">
                      -{item.soldBlocks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#C96D6D]">
                      -{item.damagedBlocks.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-bold tabular-nums text-[#18334A]">
                      {item.availableStock.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {item.isLowStock ? (
                        <span className="text-[#D6A451]">{t('inventory.lowStock')}</span>
                      ) : (
                        <span className="text-[#4D947C]">{t('inventory.healthyStock')}</span>
                      )}
                    </td>
                    {hasRole('ADMIN', 'MANAGER') && isOnline && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustTarget(item);
                            setAdjType('opening');
                            setAdjQty(100);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#18334A] hover:underline"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          <span>{t('inventory.adjustStock')}</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Movement History */}
      {transactions.length > 0 && (
        <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#E8EDF1]">
            <h2 className="text-sm font-semibold text-[#273746]">{t('inventory.movementHistory')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-xs text-[#7B8790]">
                  <th className="px-4 py-2.5 font-medium">{t('common.date')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('production.blockSize')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('inventory.adjustmentType')}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t('common.quantity')}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{t('inventory.availableStock')}</th>
                  <th className="px-4 py-2.5 font-medium">{t('common.notes')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8EDF1]">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-[#F5F7F8]">
                    <td className="px-4 py-2.5 text-xs tabular-nums text-[#7B8790]">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-[#273746]">{tx.blockSize}</td>
                    <td className="px-4 py-2.5 text-xs text-[#273746]">{t(`inventory.txTypes.${tx.type}`)}</td>
                    <td
                      className={`px-4 py-2.5 text-xs text-right font-semibold tabular-nums ${
                        tx.quantityDelta >= 0 ? 'text-[#4D947C]' : 'text-[#C96D6D]'
                      }`}
                    >
                      {tx.quantityDelta >= 0 ? `+${tx.quantityDelta.toLocaleString()}` : tx.quantityDelta.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-right font-semibold tabular-nums text-[#18334A]">
                      {tx.balanceAfter.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#7B8790]">
                      {tx.notes} {tx.performedBy?.name ? `· ${tx.performedBy.name}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {adjustTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleSaveAdjustment} className="w-full max-w-md rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-[#273746]">
              {t('inventory.adjustStock')} · {adjustTarget.name}
            </h2>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('inventory.adjustmentType')}</label>
              <select
                value={adjType}
                onChange={(e) => setAdjType(e.target.value as 'opening' | 'damage' | 'adjustment')}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm text-[#273746]"
              >
                <option value="opening">{t('inventory.adjTypes.opening')}</option>
                <option value="damage">{t('inventory.adjTypes.damage')}</option>
                <option value="adjustment">{t('inventory.adjTypes.adjustment')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('common.quantity')}</label>
              <input
                type="number"
                required
                value={adjQty}
                onChange={(e) => setAdjQty(Number(e.target.value))}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm tabular-nums text-[#273746]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('common.notes')}</label>
              <input
                type="text"
                required
                minLength={2}
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm text-[#273746]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustTarget(null)}
                className="rounded-lg border border-[#E8EDF1] px-4 py-2 text-xs font-semibold text-[#273746]"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={savingAdj}
                className="rounded-lg bg-[#18334A] px-4 py-2 text-xs font-semibold text-white"
              >
                {savingAdj ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
