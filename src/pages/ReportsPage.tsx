import { FileDown, FileSpreadsheet, Printer } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { exportReportExcel, exportReportPDF, type ExportTableConfig } from '../lib/exportUtils.ts';
import type { ExpenseCategory, ProductItem } from '../types/index.ts';

interface AnalyticsPayload {
  period: { from: string; to: string; blockSize: string };
  summary: {
    totalProduced: number;
    totalReady: number;
    totalCuring: number;
    totalDamagedInProd: number;
    totalSoldQty: number;
    totalRevenue: number;
    totalCollected: number;
    totalExpenses: number;
    estimatedGrossProfit: number;
    totalCustomerDebts: number;
  };
  expensesByCategory: Record<string, number>;
  productions: Array<{
    id: string;
    date: string;
    batchNumber: string;
    blockSize: string;
    blockType: string;
    quantityProduced: number;
    damagedQuantity: number;
    workerName: string;
    status: string;
  }>;
  sales: Array<{
    id: string;
    date: string;
    invoiceNumber: string;
    customerName: string;
    blockSize: string;
    quantitySold: number;
    unitPrice: number;
    totalAmount: number;
    amountPaid: number;
    remainingBalance: number;
    paymentMethod: string;
  }>;
  inventory: Array<{
    id: string;
    name: string;
    code: string;
    openingStock: number;
    availableStock: number;
    curingStock: number;
    damagedStock: number;
    unitPrice: number;
  }>;
  expenses: Array<{
    id: string;
    date: string;
    category: ExpenseCategory;
    description: string;
    amount: number;
    responsibleEmployee: string;
  }>;
  debtors: Array<{
    id: string;
    name: string;
    phone: string;
    totalPurchases: number;
    totalPaid: number;
    outstandingDebt: number;
  }>;
}

type ReportTab = 'overview' | 'production' | 'sales' | 'inventory' | 'debts' | 'expenses';

export const ReportsPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useAuth();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [tab, setTab] = useState<ReportTab>('overview');
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [blockSize, setBlockSize] = useState('');
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      if (blockSize) params.set('blockSize', blockSize);
      const [report, prods] = await Promise.all([
        apiFetch<AnalyticsPayload>(`/api/reports/analytics?${params.toString()}`),
        apiFetch<ProductItem[]>('/api/products'),
      ]);
      setData(report);
      setProducts(prods);
    } finally {
      setLoading(false);
    }
  }, [blockSize, fromDate, toDate]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const applyPreset = (preset: 'daily' | 'weekly' | 'monthly') => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    setToDate(todayStr);
    if (preset === 'daily') {
      setFromDate(todayStr);
    } else if (preset === 'weekly') {
      const w = new Date(now);
      w.setDate(w.getDate() - 6);
      setFromDate(w.toISOString().slice(0, 10));
    } else {
      setFromDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
    }
  };

  const fmtMoney = (n: number) =>
    `${settings.currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const buildExportConfig = (): ExportTableConfig | null => {
    if (!data) return null;
    const periodSub = `${t('common.from')}: ${fromDate} · ${t('common.to')}: ${toDate}`;
    const summaryLines = [
      { label: t('reports.revenue'), value: fmtMoney(data.summary.totalRevenue) },
      { label: t('reports.expensesTotal'), value: fmtMoney(data.summary.totalExpenses) },
      { label: t('reports.grossProfit'), value: fmtMoney(data.summary.estimatedGrossProfit) },
      { label: t('reports.customerDebts'), value: fmtMoney(data.summary.totalCustomerDebts) },
    ];

    if (tab === 'production') {
      return {
        title: t('reports.tabs.production'),
        subtitle: periodSub,
        companyName: settings.companyName,
        fileName: `production-report-${fromDate}-to-${toDate}`,
        summaryLines,
        headers: [
          t('common.date'),
          t('production.batchNumber'),
          t('production.blockSize'),
          t('production.quantityProduced'),
          t('production.damagedQuantity'),
          t('production.workerName'),
          t('common.status'),
        ],
        rows: data.productions.map((p) => [
          new Date(p.date).toLocaleDateString(),
          p.batchNumber,
          p.blockSize,
          p.quantityProduced,
          p.damagedQuantity,
          p.workerName,
          t(`production.statuses.${p.status}`),
        ]),
      };
    }

    if (tab === 'sales') {
      return {
        title: t('reports.tabs.sales'),
        subtitle: periodSub,
        companyName: settings.companyName,
        fileName: `sales-report-${fromDate}-to-${toDate}`,
        summaryLines,
        headers: [
          t('common.date'),
          t('sales.invoiceNumber'),
          t('sales.customerName'),
          t('sales.blockSize'),
          t('sales.quantitySold'),
          t('sales.totalAmount'),
          t('sales.amountPaid'),
          t('sales.remainingBalance'),
        ],
        rows: data.sales.map((s) => [
          new Date(s.date).toLocaleDateString(),
          s.invoiceNumber,
          s.customerName,
          s.blockSize,
          s.quantitySold,
          s.totalAmount.toFixed(2),
          s.amountPaid.toFixed(2),
          s.remainingBalance.toFixed(2),
        ]),
      };
    }

    if (tab === 'inventory') {
      return {
        title: t('reports.tabs.inventory'),
        subtitle: periodSub,
        companyName: settings.companyName,
        fileName: `inventory-report-${toDate}`,
        summaryLines,
        headers: [
          t('production.blockSize'),
          t('inventory.openingStock'),
          t('inventory.availableStock'),
          t('inventory.curingStock'),
          t('inventory.damagedBlocks'),
          t('inventory.unitPrice'),
        ],
        rows: data.inventory.map((i) => [
          i.name,
          i.openingStock,
          i.availableStock,
          i.curingStock,
          i.damagedStock,
          i.unitPrice.toFixed(2),
        ]),
      };
    }

    if (tab === 'debts') {
      return {
        title: t('reports.tabs.debts'),
        subtitle: periodSub,
        companyName: settings.companyName,
        fileName: `customer-debts-${toDate}`,
        summaryLines,
        headers: [
          t('customers.name'),
          t('customers.phone'),
          t('customers.totalPurchases'),
          t('customers.totalPaid'),
          t('customers.outstandingDebt'),
        ],
        rows: data.debtors.map((c) => [
          c.name,
          c.phone,
          c.totalPurchases.toFixed(2),
          c.totalPaid.toFixed(2),
          c.outstandingDebt.toFixed(2),
        ]),
      };
    }

    if (tab === 'expenses') {
      return {
        title: t('reports.tabs.expenses'),
        subtitle: periodSub,
        companyName: settings.companyName,
        fileName: `expenses-report-${fromDate}-to-${toDate}`,
        summaryLines,
        headers: [
          t('expenses.date'),
          t('expenses.category'),
          t('expenses.description'),
          t('expenses.responsibleEmployee'),
          t('expenses.amount'),
        ],
        rows: data.expenses.map((e) => [
          new Date(e.date).toLocaleDateString(),
          t(`expenses.categories.${e.category}`),
          e.description,
          e.responsibleEmployee,
          e.amount.toFixed(2),
        ]),
      };
    }

    return {
      title: t('reports.tabs.overview'),
      subtitle: periodSub,
      companyName: settings.companyName,
      fileName: `financial-summary-${fromDate}-to-${toDate}`,
      summaryLines,
      headers: [t('reports.title'), t('common.total')],
      rows: [
        [t('reports.totalProduced'), data.summary.totalProduced],
        [t('reports.totalDamaged'), data.summary.totalDamagedInProd],
        [t('reports.totalSold'), data.summary.totalSoldQty],
        [t('reports.revenue'), fmtMoney(data.summary.totalRevenue)],
        [t('reports.collected'), fmtMoney(data.summary.totalCollected)],
        [t('reports.expensesTotal'), fmtMoney(data.summary.totalExpenses)],
        [t('reports.grossProfit'), fmtMoney(data.summary.estimatedGrossProfit)],
        [t('reports.customerDebts'), fmtMoney(data.summary.totalCustomerDebts)],
      ],
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('reports.title')}</h1>
        <div className="no-print flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8EDF1] bg-white px-3 py-2 text-xs font-semibold text-[#273746] hover:bg-[#F5F7F8]"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>{t('common.print')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const cfg = buildExportConfig();
              if (cfg) exportReportPDF(cfg);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#18334A] px-3 py-2 text-xs font-semibold text-white hover:bg-[#112638]"
          >
            <FileDown className="h-3.5 w-3.5" />
            <span>{t('common.exportPdf')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const cfg = buildExportConfig();
              if (cfg) exportReportExcel(cfg);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4D947C] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3f7d68]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>{t('common.exportExcel')}</span>
          </button>
        </div>
      </div>

      {/* Date Presets & Block Size Filters */}
      <div className="no-print rounded-xl border border-[#E8EDF1] bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg bg-[#F5F7F8] p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => applyPreset('daily')}
            className="rounded-md px-3 py-1.5 hover:bg-white text-[#273746]"
          >
            {t('reports.presets.daily')}
          </button>
          <button
            type="button"
            onClick={() => applyPreset('weekly')}
            className="rounded-md px-3 py-1.5 hover:bg-white text-[#273746]"
          >
            {t('reports.presets.weekly')}
          </button>
          <button
            type="button"
            onClick={() => applyPreset('monthly')}
            className="rounded-md px-3 py-1.5 hover:bg-white text-[#273746]"
          >
            {t('reports.presets.monthly')}
          </button>
        </div>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs"
        />
        <select
          value={blockSize}
          onChange={(e) => setBlockSize(e.target.value)}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs"
        >
          <option value="">{t('common.all')} · {t('production.blockSize')}</option>
          {products.map((p) => (
            <option key={p.id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Report Tabs */}
      <div className="no-print flex flex-wrap gap-1.5 border-b border-[#E8EDF1] pb-2">
        {(['overview', 'production', 'sales', 'inventory', 'debts', 'expenses'] as ReportTab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              tab === key ? 'bg-[#18334A] text-white' : 'bg-white border border-[#E8EDF1] text-[#273746] hover:bg-[#F5F7F8]'
            }`}
          >
            {t(`reports.tabs.${key}`)}
          </button>
        ))}
      </div>

      {loading || !data ? (
        <div className="py-10 text-center text-xs text-[#7B8790]">{t('common.loading')}</div>
      ) : (
        <>
          {tab === 'overview' && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
                <div className="text-xs text-[#7B8790]">{t('reports.revenue')}</div>
                <div className="mt-1 text-xl font-bold text-[#4D947C] tabular-nums">{fmtMoney(data.summary.totalRevenue)}</div>
              </div>
              <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
                <div className="text-xs text-[#7B8790]">{t('reports.expensesTotal')}</div>
                <div className="mt-1 text-xl font-bold text-[#C96D6D] tabular-nums">{fmtMoney(data.summary.totalExpenses)}</div>
              </div>
              <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
                <div className="text-xs text-[#7B8790]">{t('reports.grossProfit')}</div>
                <div className="mt-1 text-xl font-bold text-[#18334A] tabular-nums">
                  {fmtMoney(data.summary.estimatedGrossProfit)}
                </div>
              </div>
              <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
                <div className="text-xs text-[#7B8790]">{t('reports.customerDebts')}</div>
                <div className="mt-1 text-xl font-bold text-[#D6A451] tabular-nums">
                  {fmtMoney(data.summary.totalCustomerDebts)}
                </div>
              </div>
              <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
                <div className="text-xs text-[#7B8790]">{t('reports.totalProduced')}</div>
                <div className="mt-1 text-xl font-bold text-[#273746] tabular-nums">
                  {data.summary.totalProduced.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
                <div className="text-xs text-[#7B8790]">{t('reports.totalSold')}</div>
                <div className="mt-1 text-xl font-bold text-[#273746] tabular-nums">
                  {data.summary.totalSoldQty.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
                <div className="text-xs text-[#7B8790]">{t('reports.totalDamaged')}</div>
                <div className="mt-1 text-xl font-bold text-[#C96D6D] tabular-nums">
                  {data.summary.totalDamagedInProd.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-[#E8EDF1] bg-white p-4">
                <div className="text-xs text-[#7B8790]">{t('reports.collected')}</div>
                <div className="mt-1 text-xl font-bold text-[#4D947C] tabular-nums">{fmtMoney(data.summary.totalCollected)}</div>
              </div>
            </div>
          )}

          {tab === 'production' && (
            <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-[#7B8790]">
                    <th className="px-4 py-3">{t('common.date')}</th>
                    <th className="px-4 py-3">{t('production.batchNumber')}</th>
                    <th className="px-4 py-3">{t('production.blockSize')}</th>
                    <th className="px-4 py-3 text-right">{t('production.quantityProduced')}</th>
                    <th className="px-4 py-3 text-right">{t('production.damagedQuantity')}</th>
                    <th className="px-4 py-3">{t('production.workerName')}</th>
                    <th className="px-4 py-3">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EDF1]">
                  {data.productions.map((p) => (
                    <tr key={p.id}>
                      <td className="px-4 py-2.5 tabular-nums">{new Date(p.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 font-mono">{p.batchNumber}</td>
                      <td className="px-4 py-2.5">{p.blockSize}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{p.quantityProduced.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#C96D6D]">{p.damagedQuantity.toLocaleString()}</td>
                      <td className="px-4 py-2.5">{p.workerName}</td>
                      <td className="px-4 py-2.5">{t(`production.statuses.${p.status}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'sales' && (
            <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-[#7B8790]">
                    <th className="px-4 py-3">{t('common.date')}</th>
                    <th className="px-4 py-3">{t('sales.invoiceNumber')}</th>
                    <th className="px-4 py-3">{t('sales.customerName')}</th>
                    <th className="px-4 py-3">{t('sales.blockSize')}</th>
                    <th className="px-4 py-3 text-right">{t('sales.quantitySold')}</th>
                    <th className="px-4 py-3 text-right">{t('sales.totalAmount')}</th>
                    <th className="px-4 py-3 text-right">{t('sales.amountPaid')}</th>
                    <th className="px-4 py-3 text-right">{t('sales.remainingBalance')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EDF1]">
                  {data.sales.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2.5 tabular-nums">{new Date(s.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 font-mono">{s.invoiceNumber}</td>
                      <td className="px-4 py-2.5">{s.customerName}</td>
                      <td className="px-4 py-2.5">{s.blockSize}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{s.quantitySold.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{fmtMoney(s.totalAmount)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#4D947C]">{fmtMoney(s.amountPaid)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#D6A451]">{fmtMoney(s.remainingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'inventory' && (
            <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-[#7B8790]">
                    <th className="px-4 py-3">{t('production.blockSize')}</th>
                    <th className="px-4 py-3 text-right">{t('inventory.openingStock')}</th>
                    <th className="px-4 py-3 text-right">{t('inventory.availableStock')}</th>
                    <th className="px-4 py-3 text-right">{t('inventory.curingStock')}</th>
                    <th className="px-4 py-3 text-right">{t('inventory.damagedBlocks')}</th>
                    <th className="px-4 py-3 text-right">{t('inventory.unitPrice')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EDF1]">
                  {data.inventory.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-2.5 font-semibold">{i.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{i.openingStock.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#18334A]">
                        {i.availableStock.toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#D6A451]">{i.curingStock.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#C96D6D]">{i.damagedStock.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(i.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'debts' && (
            <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-[#7B8790]">
                    <th className="px-4 py-3">{t('customers.name')}</th>
                    <th className="px-4 py-3">{t('customers.phone')}</th>
                    <th className="px-4 py-3 text-right">{t('customers.totalPurchases')}</th>
                    <th className="px-4 py-3 text-right">{t('customers.totalPaid')}</th>
                    <th className="px-4 py-3 text-right">{t('customers.outstandingDebt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EDF1]">
                  {data.debtors.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2.5 font-semibold">{c.name}</td>
                      <td className="px-4 py-2.5 tabular-nums">{c.phone}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(c.totalPurchases)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[#4D947C]">{fmtMoney(c.totalPaid)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#D6A451]">
                        {fmtMoney(c.outstandingDebt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'expenses' && (
            <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-[#7B8790]">
                    <th className="px-4 py-3">{t('expenses.date')}</th>
                    <th className="px-4 py-3">{t('expenses.category')}</th>
                    <th className="px-4 py-3">{t('expenses.description')}</th>
                    <th className="px-4 py-3">{t('expenses.responsibleEmployee')}</th>
                    <th className="px-4 py-3 text-right">{t('expenses.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E8EDF1]">
                  {data.expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="px-4 py-2.5 tabular-nums">{new Date(e.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5">{t(`expenses.categories.${e.category}`)}</td>
                      <td className="px-4 py-2.5">{e.description}</td>
                      <td className="px-4 py-2.5">{e.responsibleEmployee}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-[#C96D6D]">
                        {fmtMoney(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
