import { Download, Plus, RotateCcw, Upload } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { cacheReferenceData } from '../offline/syncService.ts';
import type { CompanySettingsData, LanguageCode, ProductItem } from '../types/index.ts';

interface AuditRow {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  createdAt: string;
}

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, refreshSettings } = useAuth();

  const [form, setForm] = useState<CompanySettingsData>(settings);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Add new block size
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newDims, setNewDims] = useState('');
  const [newPrice, setNewPrice] = useState(0.5);
  const [newThreshold, setNewThreshold] = useState(500);

  // Database Backup & Restore
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [pendingBackupPayload, setPendingBackupPayload] = useState<{
    format: string;
    version: number;
    exportedAt?: string;
    collections: Record<string, unknown[]>;
  } | null>(null);
  const [pendingBackupName, setPendingBackupName] = useState('');
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [s, prods, logs] = await Promise.all([
        apiFetch<CompanySettingsData>('/api/settings'),
        apiFetch<ProductItem[]>('/api/products'),
        apiFetch<AuditRow[]>('/api/settings/audit-logs'),
      ]);
      setForm({ ...settings, ...s });
      setProducts(prods);
      setAuditLogs(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }, [settings]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((prev) => ({ ...prev, companyLogo: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(form),
      });
      await refreshSettings();
      setMessage(t('settings.savedSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProduct = async (p: ProductItem, unitPrice: number, lowStockThreshold: number) => {
    setError('');
    try {
      await apiFetch(`/api/products/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ unitPrice, lowStockThreshold }),
      });
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update product');
    }
  };

  const handleAddBlockSize = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: newName,
          code: newCode,
          dimensions: newDims,
          unitPrice: newPrice,
          lowStockThreshold: newThreshold,
        }),
      });
      setShowAddBlock(false);
      setNewName('');
      setNewCode('');
      setNewDims('');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add block size');
    }
  };

  const handleDownloadBackup = async () => {
    setDownloadingBackup(true);
    setError('');
    setMessage('');
    try {
      const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
      const token = localStorage.getItem('bulukeeti_token');
      const res = await fetch(`${apiBase}/api/settings/backup`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Failed to download backup');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bulukeeti-pro-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download backup');
    } finally {
      setDownloadingBackup(false);
    }
  };

  const handleBackupFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '')) as {
          format?: string;
          version?: number;
          exportedAt?: string;
          collections?: Record<string, unknown[]>;
        };
        if (
          parsed?.format !== 'bulukeeti-pro-backup' ||
          parsed?.version !== 1 ||
          !parsed.collections ||
          !Array.isArray(parsed.collections.users) ||
          !Array.isArray(parsed.collections.products)
        ) {
          setPendingBackupPayload(null);
          setPendingBackupName('');
          setError(t('settings.invalidBackupFile'));
          return;
        }
        setPendingBackupPayload({
          format: parsed.format,
          version: parsed.version,
          exportedAt: parsed.exportedAt,
          collections: parsed.collections,
        });
        setPendingBackupName(file.name);
      } catch {
        setPendingBackupPayload(null);
        setPendingBackupName('');
        setError(t('settings.invalidBackupFile'));
      }
    };
    reader.readAsText(file);
  };

  const handleRestoreBackup = async () => {
    if (!pendingBackupPayload) return;
    if (!window.confirm(t('settings.restoreConfirm'))) return;

    setRestoringBackup(true);
    setError('');
    setMessage('');
    try {
      await apiFetch('/api/settings/restore', {
        method: 'POST',
        body: JSON.stringify(pendingBackupPayload),
      });
      setPendingBackupPayload(null);
      setPendingBackupName('');
      if (restoreInputRef.current) restoreInputRef.current.value = '';
      await refreshSettings();
      await cacheReferenceData();
      await loadAll();
      setMessage(t('settings.restoreSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup');
    } finally {
      setRestoringBackup(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('settings.title')}</h1>

      {message && (
        <div className="rounded-lg border border-[#4D947C]/30 bg-[#4D947C]/10 px-4 py-2.5 text-xs font-medium text-[#4D947C]">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-4 py-2.5 text-xs font-medium text-[#C96D6D]">
          {error}
        </div>
      )}

      {/* Company Settings Form */}
      <form onSubmit={handleSaveSettings} className="rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-5">
        <h2 className="text-sm font-bold text-[#273746]">{t('settings.companyProfile')}</h2>

        <div className="flex items-center gap-4">
          {form.companyLogo ? (
            <img
              src={form.companyLogo}
              alt="Company logo"
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-lg border border-[#E8EDF1] object-cover"
            />
          ) : (
            <div className="h-14 w-14 rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] flex items-center justify-center text-xs text-[#7B8790]">
              Logo
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 rounded-lg border border-[#E8EDF1] bg-white px-3 py-2 text-xs font-semibold text-[#18334A] cursor-pointer hover:bg-[#F5F7F8]">
              <Upload className="h-3.5 w-3.5" />
              <span>{t('settings.uploadLogo')}</span>
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </label>
            {form.companyLogo && (
              <button
                type="button"
                onClick={() => setForm((p) => ({ ...p, companyLogo: '' }))}
                className="text-xs text-[#C96D6D] hover:underline"
              >
                {t('settings.removeLogo')}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.companyName')}</label>
            <input
              type="text"
              required
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.phoneNumber')}</label>
            <input
              type="text"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.companyAddress')}</label>
            <input
              type="text"
              value={form.companyAddress}
              onChange={(e) => setForm({ ...form, companyAddress: e.target.value })}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.currency')}</label>
            <input
              type="text"
              required
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.defaultLanguage')}</label>
            <select
              value={form.defaultLanguage}
              onChange={(e) => setForm({ ...form, defaultLanguage: e.target.value as LanguageCode })}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
            >
              <option value="en">English (EN)</option>
              <option value="so">Af-Soomaali (SO)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.lowStockAlertDefault')}</label>
            <input
              type="number"
              min={0}
              value={form.lowStockAlertDefault}
              onChange={(e) => setForm({ ...form, lowStockAlertDefault: Number(e.target.value) })}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm tabular-nums"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.invoiceFooterNote')}</label>
          <input
            type="text"
            value={form.invoiceFooterNote}
            onChange={(e) => setForm({ ...form, invoiceFooterNote: e.target.value })}
            className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#18334A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#112638]"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>

      {/* Block Sizes & Selling Prices */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E8EDF1] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#273746]">{t('settings.blockSizesTitle')}</h2>
          <button
            type="button"
            onClick={() => setShowAddBlock(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#18334A] px-3 py-1.5 text-xs font-semibold text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('settings.addBlockSize')}</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-[#7B8790]">
                <th className="px-4 py-2.5">{t('production.blockSize')}</th>
                <th className="px-4 py-2.5">{t('settings.dimensions')}</th>
                <th className="px-4 py-2.5">{t('settings.sellingPrice')} ({form.currency})</th>
                <th className="px-4 py-2.5">{t('settings.lowStockThreshold')}</th>
                <th className="px-4 py-2.5 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {products.map((p) => (
                <ProductPriceRow key={p.id} product={p} onSave={handleUpdateProduct} saveLabel={t('common.save')} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Database Backup & Restore */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-sm font-bold text-[#273746]">{t('settings.backupRestoreTitle')}</h2>
            <p className="mt-1 text-xs text-[#7B8790] leading-relaxed">{t('settings.backupDescription')}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleDownloadBackup()}
            disabled={downloadingBackup}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#18334A] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#112638] disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{downloadingBackup ? t('settings.downloadingBackup') : t('settings.downloadBackup')}</span>
          </button>
        </div>

        <div className="border-t border-[#E8EDF1] pt-4 space-y-3">
          <p className="text-xs font-medium text-[#D6A451]">{t('settings.restoreWarning')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3.5 py-2 text-xs font-semibold text-[#273746] cursor-pointer hover:bg-[#E8EDF1]/60">
              <Upload className="h-3.5 w-3.5" />
              <span>{t('settings.selectBackupFile')}</span>
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleBackupFileSelect}
                className="hidden"
              />
            </label>

            {pendingBackupPayload && (
              <button
                type="button"
                onClick={() => void handleRestoreBackup()}
                disabled={restoringBackup}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4D947C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3f7d68] disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{restoringBackup ? t('settings.restoringBackup') : t('settings.restoreBackup')}</span>
              </button>
            )}
          </div>

          {pendingBackupPayload && (
            <div className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3.5 py-2.5 text-xs text-[#273746] space-y-1">
              <div className="font-semibold">
                {pendingBackupName}
                {pendingBackupPayload.exportedAt
                  ? ` · ${t('settings.backupExportedAt')}: ${new Date(pendingBackupPayload.exportedAt).toLocaleString()}`
                  : ''}
              </div>
              <div className="text-[#7B8790] tabular-nums">
                {t('nav.employees')}: {pendingBackupPayload.collections.users?.length || 0} ·{' '}
                {t('production.blockSize')}: {pendingBackupPayload.collections.products?.length || 0} ·{' '}
                {t('nav.production')}: {pendingBackupPayload.collections.productions?.length || 0} ·{' '}
                {t('nav.sales')}: {pendingBackupPayload.collections.sales?.length || 0} ·{' '}
                {t('nav.customers')}: {pendingBackupPayload.collections.customers?.length || 0} ·{' '}
                {t('nav.expenses')}: {pendingBackupPayload.collections.expenses?.length || 0}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Security Audit Logs */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E8EDF1]">
          <h2 className="text-sm font-bold text-[#273746]">{t('settings.auditLogsTitle')}</h2>
        </div>
        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-[#7B8790]">
                <th className="px-4 py-2.5">{t('common.date')}</th>
                <th className="px-4 py-2.5">{t('employees.name')}</th>
                <th className="px-4 py-2.5">{t('employees.role')}</th>
                <th className="px-4 py-2.5">{t('common.actions')}</th>
                <th className="px-4 py-2.5">Entity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2 tabular-nums text-[#7B8790]">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2 font-medium text-[#273746]">{log.userName}</td>
                  <td className="px-4 py-2 text-[#7B8790]">{log.userRole}</td>
                  <td className="px-4 py-2 font-mono text-[#18334A]">{log.action}</td>
                  <td className="px-4 py-2 text-[#7B8790]">{log.entityType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Block Size Modal */}
      {showAddBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleAddBlockSize} className="w-full max-w-md rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-[#273746]">{t('settings.addBlockSize')}</h2>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.blockName')}</label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.blockCode')}</label>
              <input
                type="text"
                required
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.dimensions')}</label>
              <input
                type="text"
                value={newDims}
                onChange={(e) => setNewDims(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.sellingPrice')}</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  required
                  value={newPrice}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#273746] mb-1">{t('settings.lowStockThreshold')}</label>
                <input
                  type="number"
                  min={0}
                  required
                  value={newThreshold}
                  onChange={(e) => setNewThreshold(Number(e.target.value))}
                  className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm tabular-nums"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddBlock(false)}
                className="rounded-lg border border-[#E8EDF1] px-4 py-2 text-xs font-semibold text-[#273746]"
              >
                {t('common.cancel')}
              </button>
              <button type="submit" className="rounded-lg bg-[#18334A] px-4 py-2 text-xs font-semibold text-white">
                {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

const ProductPriceRow: React.FC<{
  product: ProductItem;
  onSave: (p: ProductItem, price: number, threshold: number) => Promise<void>;
  saveLabel: string;
}> = ({ product, onSave, saveLabel }) => {
  const [price, setPrice] = useState(product.unitPrice);
  const [threshold, setThreshold] = useState(product.lowStockThreshold);

  return (
    <tr>
      <td className="px-4 py-2.5 font-semibold text-[#273746]">
        {product.name} <span className="text-[#7B8790] font-normal">· {product.code}</span>
      </td>
      <td className="px-4 py-2.5 text-[#7B8790]">{product.dimensions || '—'}</td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          step="0.01"
          min={0}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="w-24 rounded-md border border-[#E8EDF1] bg-[#F5F7F8] px-2 py-1 text-xs tabular-nums"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          min={0}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-24 rounded-md border border-[#E8EDF1] bg-[#F5F7F8] px-2 py-1 text-xs tabular-nums"
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          type="button"
          onClick={() => void onSave(product, price, threshold)}
          className="text-xs font-semibold text-[#18334A] hover:underline"
        >
          {saveLabel}
        </button>
      </td>
    </tr>
  );
};
