import { FileText, Plus, Printer, Search, XCircle } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useNetwork } from '../context/NetworkContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { exportReportPDF } from '../lib/exportUtils.ts';
import { offlineDB, type QueuedSalePayload, type SyncQueueItem } from '../offline/db.ts';
import { cacheSalesSnapshot } from '../offline/syncService.ts';
import type { ProductItem, SaleRecord } from '../types/index.ts';

export const SalesPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, hasRole } = useAuth();
  const { isOnline } = useNetwork();

  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [pendingOffline, setPendingOffline] = useState<SyncQueueItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [blockSize, setBlockSize] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Invoice Modal
  const [selectedInvoice, setSelectedInvoice] = useState<SaleRecord | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const queued = await offlineDB.syncQueue.where('entityType').equals('sale').toArray();
      setPendingOffline(queued);

      if (isOnline) {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (blockSize) params.set('blockSize', blockSize);
        if (fromDate) params.set('from', fromDate);
        if (toDate) params.set('to', toDate);

        const [saleList, prodList] = await Promise.all([
          apiFetch<SaleRecord[]>(`/api/sales?${params.toString()}`),
          apiFetch<ProductItem[]>('/api/products'),
        ]);
        setSales(saleList);
        setProducts(prodList);
        await cacheSalesSnapshot(saleList);
      } else {
        const [cachedSales, cachedProds] = await Promise.all([
          offlineDB.cachedSales.toArray(),
          offlineDB.cachedProducts.toArray(),
        ]);
        setSales(cachedSales);
        setProducts(cachedProds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales');
    } finally {
      setLoading(false);
    }
  }, [blockSize, fromDate, isOnline, search, toDate]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const handleCancelSale = async (sale: SaleRecord) => {
    if (!window.confirm(t('sales.cancelConfirm'))) return;
    setError('');
    try {
      await apiFetch(`/api/sales/${sale.id}/cancel`, { method: 'POST' });
      await loadSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel sale');
    }
  };

  const fmtMoney = (n: number) =>
    `${settings.currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleDownloadInvoicePdf = (sale: SaleRecord) => {
    exportReportPDF({
      title: `${t('sales.invoiceTitle')} · ${sale.invoiceNumber}`,
      subtitle: `${t('sales.saleDate')}: ${new Date(sale.saleDate).toLocaleDateString()}`,
      companyName: settings.companyName,
      fileName: sale.invoiceNumber,
      summaryLines: [
        { label: t('sales.billedTo'), value: `${sale.customerName} (${sale.customerPhone})` },
        { label: t('sales.paymentMethod'), value: t(`sales.methods.${sale.paymentMethod}`) },
        { label: t('sales.totalAmount'), value: fmtMoney(sale.totalAmount) },
        { label: t('sales.amountPaid'), value: fmtMoney(sale.amountPaid) },
        { label: t('sales.remainingBalance'), value: fmtMoney(sale.remainingBalance) },
      ],
      headers: [t('sales.blockSize'), t('sales.quantitySold'), t('sales.unitPrice'), t('sales.totalAmount')],
      rows: [[sale.blockSize, sale.quantitySold, fmtMoney(sale.unitPrice), fmtMoney(sale.totalAmount)]],
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('sales.title')}</h1>
        <Link
          to="/sales/new"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#18334A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112638] whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>{t('nav.newSale')}</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
          <option value="">{t('common.all')} · {t('sales.blockSize')}</option>
          {products.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs text-[#273746]"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs text-[#273746]"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-4 py-2.5 text-xs font-medium text-[#C96D6D]">
          {error}
        </div>
      )}

      {/* Pending Offline Sales */}
      {pendingOffline.length > 0 && (
        <div className="rounded-xl border border-[#D6A451]/40 bg-[#D6A451]/10 p-4">
          <h2 className="text-xs font-semibold text-[#273746] mb-2">
            {t('sales.offlinePending')} ({pendingOffline.length})
          </h2>
          <div className="space-y-1.5 text-xs">
            {pendingOffline.map((q) => {
              const s = q.payload as QueuedSalePayload;
              return (
                <div key={q.clientTxId} className="flex items-center justify-between">
                  <span>
                    {s.customerName} · {s.blockSizeLabel} × {s.quantitySold}
                  </span>
                  <span className="font-medium text-[#D6A451]">{q.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sales Table */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-xs text-[#7B8790]">
                <th className="px-4 py-3 font-medium">{t('sales.invoiceNumber')}</th>
                <th className="px-4 py-3 font-medium">{t('common.date')}</th>
                <th className="px-4 py-3 font-medium">{t('sales.customerName')}</th>
                <th className="px-4 py-3 font-medium">{t('sales.blockSize')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('sales.quantitySold')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('sales.totalAmount')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('sales.amountPaid')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('sales.remainingBalance')}</th>
                <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : sales.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-[#F5F7F8]">
                    <td className="px-4 py-3 text-xs font-mono font-semibold text-[#18334A]">{sale.invoiceNumber}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-[#7B8790]">
                      {new Date(sale.saleDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/customers/${sale.customerId}`} className="text-xs font-semibold text-[#273746] hover:underline">
                        {sale.customerName}
                      </Link>
                      <div className="text-[11px] text-[#7B8790]">{sale.customerPhone}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#273746]">{sale.blockSize}</td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#273746]">
                      {sale.quantitySold.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-right font-semibold tabular-nums text-[#273746]">
                      {fmtMoney(sale.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#4D947C]">
                      {fmtMoney(sale.amountPaid)}
                    </td>
                    <td className="px-4 py-3 text-xs text-right tabular-nums text-[#D6A451]">
                      {fmtMoney(sale.remainingBalance)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {sale.status === 'completed' ? (
                        <span className="text-[#4D947C]">{t('sales.statuses.completed')}</span>
                      ) : (
                        <span className="text-[#C96D6D]">{t('sales.statuses.cancelled')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedInvoice(sale)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#18334A] hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="hidden xl:inline">{t('sales.viewInvoice')}</span>
                        </button>
                        {isOnline && sale.status === 'completed' && hasRole('ADMIN', 'MANAGER') && (
                          <button
                            type="button"
                            onClick={() => void handleCancelSale(sale)}
                            title={t('sales.cancelSale')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#C96D6D] hover:underline"
                          >
                            <XCircle className="h-3.5 w-3.5" />
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

      {/* Printable Invoice Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-[#E8EDF1] pb-4">
              <div>
                <div className="text-lg font-bold text-[#18334A]">{settings.companyName}</div>
                <div className="text-xs text-[#7B8790]">
                  {settings.companyAddress} · {settings.phoneNumber}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-bold text-[#273746]">{t('sales.invoiceTitle')}</div>
                <div className="text-sm font-mono font-semibold text-[#18334A]">{selectedInvoice.invoiceNumber}</div>
                <div className="text-xs text-[#7B8790]">{new Date(selectedInvoice.saleDate).toLocaleDateString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-[#7B8790] font-medium">{t('sales.billedTo')}</div>
                <div className="font-semibold text-[#273746] mt-0.5">{selectedInvoice.customerName}</div>
                <div className="text-[#7B8790]">{selectedInvoice.customerPhone}</div>
              </div>
              <div className="text-right">
                <div className="text-[#7B8790] font-medium">{t('sales.paymentMethod')}</div>
                <div className="font-semibold text-[#273746] mt-0.5">
                  {t(`sales.methods.${selectedInvoice.paymentMethod}`)}
                </div>
                <div className="text-[#7B8790]">{t(`sales.statuses.${selectedInvoice.status}`)}</div>
              </div>
            </div>

            <table className="w-full text-xs border-y border-[#E8EDF1]">
              <thead>
                <tr className="text-[#7B8790] border-b border-[#E8EDF1]">
                  <th className="py-2 text-left">{t('sales.blockSize')}</th>
                  <th className="py-2 text-right">{t('sales.quantitySold')}</th>
                  <th className="py-2 text-right">{t('sales.unitPrice')}</th>
                  <th className="py-2 text-right">{t('sales.totalAmount')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-3 font-medium text-[#273746]">{selectedInvoice.blockSize}</td>
                  <td className="py-3 text-right tabular-nums">{selectedInvoice.quantitySold.toLocaleString()}</td>
                  <td className="py-3 text-right tabular-nums">{fmtMoney(selectedInvoice.unitPrice)}</td>
                  <td className="py-3 text-right font-semibold tabular-nums">{fmtMoney(selectedInvoice.totalAmount)}</td>
                </tr>
              </tbody>
            </table>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-[#7B8790]">{t('sales.totalAmount')}</span>
                <span className="font-semibold tabular-nums">{fmtMoney(selectedInvoice.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#7B8790]">{t('sales.amountPaid')}</span>
                <span className="font-semibold text-[#4D947C] tabular-nums">{fmtMoney(selectedInvoice.amountPaid)}</span>
              </div>
              <div className="flex justify-between border-t border-[#E8EDF1] pt-1.5">
                <span className="font-semibold text-[#273746]">{t('sales.remainingBalance')}</span>
                <span className="font-bold text-[#D6A451] tabular-nums">{fmtMoney(selectedInvoice.remainingBalance)}</span>
              </div>
            </div>

            {settings.invoiceFooterNote && (
              <p className="text-center text-xs text-[#7B8790] border-t border-[#E8EDF1] pt-3">
                {settings.invoiceFooterNote}
              </p>
            )}

            <div className="no-print flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleDownloadInvoicePdf(selectedInvoice)}
                className="rounded-lg border border-[#E8EDF1] px-3.5 py-2 text-xs font-semibold text-[#18334A]"
              >
                {t('common.exportPdf')}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#18334A] px-3.5 py-2 text-xs font-semibold text-white"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>{t('common.print')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="rounded-lg border border-[#E8EDF1] px-3.5 py-2 text-xs font-semibold text-[#273746]"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
