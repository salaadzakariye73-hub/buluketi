import { AlertTriangle, ArrowRight, Plus, RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../context/AuthContext.tsx';
import { useNetwork } from '../context/NetworkContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { offlineDB } from '../offline/db.ts';
import { cacheDashboardSnapshot } from '../offline/syncService.ts';
import type { DashboardData } from '../types/index.ts';

export const DashboardPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, hasRole } = useAuth();
  const { isOnline, pendingCount, isSyncing, syncNow } = useNetwork();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isOnline) {
        const fresh = await apiFetch<DashboardData>('/api/reports/dashboard');
        setData(fresh);
        await cacheDashboardSnapshot(fresh);
      } else {
        const cached = await offlineDB.cachedDashboard.get('latest');
        if (cached) setData(cached.data);
      }
    } catch (err) {
      const cached = await offlineDB.cachedDashboard.get('latest');
      if (cached) {
        setData(cached.data);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      }
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const fmtMoney = (n: number) =>
    `${settings.currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 rounded-lg bg-[#E8EDF1] animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border border-[#E8EDF1] bg-white animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('dashboard.title')}</h1>
          <p className="text-xs text-[#7B8790] mt-0.5">
            {settings.companyName} · {isOnline ? t('common.online') : t('common.offline')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {pendingCount > 0 && isOnline && (
            <button
              type="button"
              onClick={() => void syncNow().then(() => loadDashboard())}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D6A451] bg-[#D6A451]/10 px-3 py-2 text-xs font-semibold text-[#273746]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>
                {t('common.syncNow')} ({pendingCount})
              </span>
            </button>
          )}
          {hasRole('ADMIN', 'MANAGER', 'WORKER') && (
            <Link
              to="/production/new"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8EDF1] bg-white px-3.5 py-2 text-xs font-semibold text-[#18334A] hover:bg-[#F5F7F8] whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('nav.addProduction')}</span>
            </Link>
          )}
          {hasRole('ADMIN', 'MANAGER', 'SALESPERSON') && (
            <Link
              to="/sales/new"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#18334A] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#112638] whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('nav.newSale')}</span>
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-4 py-3 text-sm text-[#C96D6D]">
          {error}
        </div>
      )}

      {/* 8 Compact KPI Statistic Cards */}
      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
              <div className="text-xs font-medium text-[#7B8790]">{t('dashboard.productionToday')}</div>
              <div className="mt-1.5 text-2xl font-bold text-[#273746] tabular-nums">
                {data.kpis.productionToday.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7B8790]">{t('common.blocks')}</div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
              <div className="text-xs font-medium text-[#7B8790]">{t('dashboard.salesToday')}</div>
              <div className="mt-1.5 text-2xl font-bold text-[#273746] tabular-nums">
                {data.kpis.salesToday.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7B8790]">{t('common.blocks')}</div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
              <div className="text-xs font-medium text-[#7B8790]">{t('dashboard.availableStock')}</div>
              <div className="mt-1.5 text-2xl font-bold text-[#18334A] tabular-nums">
                {data.kpis.availableStock.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7B8790]">{t('common.blocks')}</div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
              <div className="text-xs font-medium text-[#7B8790]">{t('dashboard.todayRevenue')}</div>
              <div className="mt-1.5 text-2xl font-bold text-[#4D947C] tabular-nums">
                {fmtMoney(data.kpis.todayRevenue)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7B8790]">{t('dashboard.revenue')}</div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
              <div className="text-xs font-medium text-[#7B8790]">{t('dashboard.monthlyProduction')}</div>
              <div className="mt-1.5 text-2xl font-bold text-[#273746] tabular-nums">
                {data.kpis.monthlyProduction.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7B8790]">{t('common.blocks')}</div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
              <div className="text-xs font-medium text-[#7B8790]">{t('dashboard.monthlySales')}</div>
              <div className="mt-1.5 text-2xl font-bold text-[#273746] tabular-nums">
                {data.kpis.monthlySales.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7B8790]">{t('common.blocks')}</div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
              <div className="text-xs font-medium text-[#7B8790]">{t('dashboard.damagedBlocks')}</div>
              <div className="mt-1.5 text-2xl font-bold text-[#C96D6D] tabular-nums">
                {data.kpis.damagedBlocks.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7B8790]">{t('common.blocks')}</div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
              <div className="text-xs font-medium text-[#7B8790]">{t('dashboard.outstandingDebts')}</div>
              <div className="mt-1.5 text-2xl font-bold text-[#D6A451] tabular-nums">
                {fmtMoney(data.kpis.outstandingDebts)}
              </div>
              <div className="mt-0.5 text-[11px] text-[#7B8790]">{t('nav.customers')}</div>
            </div>
          </div>

          {/* Low-Stock Alerts & Inventory Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-xl border border-[#E8EDF1] bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#273746]">{t('dashboard.inventoryOverview')}</h2>
                <Link to="/inventory" className="text-xs font-medium text-[#18334A] hover:underline inline-flex items-center gap-1">
                  <span>{t('nav.inventory')}</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E8EDF1] text-left text-xs text-[#7B8790]">
                      <th className="pb-2.5 font-medium">{t('production.blockSize')}</th>
                      <th className="pb-2.5 font-medium text-right">{t('inventory.availableStock')}</th>
                      <th className="pb-2.5 font-medium text-right">{t('inventory.curingStock')}</th>
                      <th className="pb-2.5 font-medium text-right">{t('inventory.damagedBlocks')}</th>
                      <th className="pb-2.5 font-medium text-right">{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8EDF1]">
                    {data.inventoryOverview.map((item) => {
                      const low = item.availableStock <= item.lowStockThreshold;
                      return (
                        <tr key={item.id} className="hover:bg-[#F5F7F8]">
                          <td className="py-2.5 font-medium text-[#273746]">
                            {item.name} <span className="text-xs text-[#7B8790]">· {item.code}</span>
                          </td>
                          <td className="py-2.5 text-right font-semibold tabular-nums text-[#18334A]">
                            {item.availableStock.toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-[#7B8790]">
                            {item.curingStock.toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-[#C96D6D]">
                            {item.damagedStock.toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right text-xs font-medium">
                            {low ? (
                              <span className="text-[#D6A451]">{t('inventory.lowStock')}</span>
                            ) : (
                              <span className="text-[#4D947C]">{t('inventory.healthyStock')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[#273746]">{t('dashboard.lowStockAlerts')}</h2>
                <AlertTriangle className="h-4 w-4 text-[#D6A451]" />
              </div>
              {data.lowStockAlerts.length === 0 ? (
                <p className="text-xs text-[#4D947C] font-medium py-4">{t('dashboard.noLowStock')}</p>
              ) : (
                <div className="space-y-3">
                  {data.lowStockAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between border-b border-[#E8EDF1] pb-2.5 last:border-none last:pb-0"
                    >
                      <div>
                        <div className="text-sm font-semibold text-[#273746]">{alert.name}</div>
                        <div className="text-xs text-[#7B8790]">
                          {t('dashboard.threshold')}: {alert.lowStockThreshold.toLocaleString()}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#D6A451] tabular-nums">
                          {alert.availableStock.toLocaleString()}
                        </div>
                        <div className="text-[11px] text-[#7B8790]">{t('common.blocks')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Charts: Daily Production & Daily Sales */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl border border-[#E8EDF1] bg-white p-5">
              <h2 className="text-sm font-semibold text-[#273746] mb-4">{t('dashboard.dailyProductionChart')}</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF1" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7B8790' }} tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: '#7B8790' }} />
                    <Tooltip />
                    <Bar dataKey="produced" name={t('dashboard.produced')} fill="#18334A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-5">
              <h2 className="text-sm font-semibold text-[#273746] mb-4">{t('dashboard.dailySalesChart')}</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF1" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#7B8790' }} tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: '#7B8790' }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sold" name={t('dashboard.sold')} stroke="#18334A" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="revenue" name={t('dashboard.revenue')} stroke="#4D947C" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Monthly Performance & Recent Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-xl border border-[#E8EDF1] bg-white p-5">
              <h2 className="text-sm font-semibold text-[#273746] mb-4">{t('dashboard.monthlyPerformanceChart')}</h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthlyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF1" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#7B8790' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#7B8790' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="revenue" name={t('dashboard.revenue')} fill="#4D947C" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name={t('dashboard.expenses')} fill="#C96D6D" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-xl border border-[#E8EDF1] bg-white p-5">
              <h2 className="text-sm font-semibold text-[#273746] mb-4">{t('dashboard.recentTransactions')}</h2>
              {data.recentTransactions.length === 0 ? (
                <p className="text-xs text-[#7B8790] py-4">{t('common.noData')}</p>
              ) : (
                <div className="divide-y divide-[#E8EDF1]">
                  {data.recentTransactions.map((tx) => (
                    <div key={`${tx.kind}-${tx.id}`} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#273746] truncate">{tx.title}</div>
                        <div className="text-[11px] text-[#7B8790] truncate">{tx.subtitle}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold tabular-nums text-[#273746]">
                          {tx.kind === 'sale' ? fmtMoney(tx.amount) : `${tx.amount.toLocaleString()} ${t('common.blocks')}`}
                        </div>
                        <div className="text-[11px] text-[#7B8790]">{new Date(tx.date).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
