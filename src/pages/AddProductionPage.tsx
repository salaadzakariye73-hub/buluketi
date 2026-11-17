import { ArrowLeft } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useNetwork } from '../context/NetworkContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { offlineDB } from '../offline/db.ts';
import { generateClientTxId, queueOfflineProduction } from '../offline/syncService.ts';
import type { BlockType, ProductItem, ProductionStatus } from '../types/index.ts';

export const AddProductionPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isOnline, refreshQueueState } = useNetwork();
  const navigate = useNavigate();

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productionDate, setProductionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [productId, setProductId] = useState('');
  const [blockType, setBlockType] = useState<BlockType>('hollow');
  const [quantityProduced, setQuantityProduced] = useState<number>(500);
  const [damagedQuantity, setDamagedQuantity] = useState<number>(0);
  const [productionTeam, setProductionTeam] = useState('Team A');
  const [workerName, setWorkerName] = useState(user?.name || '');
  const [batchNumber, setBatchNumber] = useState(() => {
    const d = new Date();
    return `B-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;
  });
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ProductionStatus>('curing');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [offlineMsg, setOfflineMsg] = useState('');

  useEffect(() => {
    const loadProducts = async () => {
      try {
        if (isOnline) {
          const list = await apiFetch<ProductItem[]>('/api/products');
          const active = list.filter((p) => p.isActive);
          setProducts(active);
          if (active.length > 0) setProductId(active[0].id);
        } else {
          const cached = await offlineDB.cachedProducts.toArray();
          const active = cached.filter((p) => p.isActive);
          setProducts(active);
          if (active.length > 0) setProductId(active[0].id);
        }
      } catch {
        const cached = await offlineDB.cachedProducts.toArray();
        setProducts(cached);
        if (cached.length > 0) setProductId(cached[0].id);
      }
    };
    void loadProducts();
  }, [isOnline]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setOfflineMsg('');

    if (!productId) {
      setError(t('common.requiredField'));
      return;
    }
    if (damagedQuantity > quantityProduced) {
      setError('Damaged quantity cannot exceed produced quantity.');
      return;
    }

    setSubmitting(true);
    const selectedProduct = products.find((p) => p.id === productId);

    try {
      if (isOnline) {
        await apiFetch('/api/production', {
          method: 'POST',
          body: JSON.stringify({
            clientTxId: generateClientTxId(),
            productionDate,
            productId,
            blockType,
            quantityProduced,
            damagedQuantity,
            productionTeam,
            workerName,
            batchNumber,
            notes,
            status,
          }),
        });
        navigate('/production');
      } else if (user) {
        await queueOfflineProduction(
          {
            productionDate,
            productId,
            blockSizeLabel: selectedProduct?.name || '',
            blockType,
            quantityProduced,
            damagedQuantity,
            productionTeam,
            workerName,
            batchNumber,
            notes,
            status,
          },
          user
        );
        await refreshQueueState();
        setOfflineMsg(t('common.offlineQueuedSuccess'));
        setTimeout(() => navigate('/production'), 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save production batch');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link
          to="/production"
          className="inline-flex items-center gap-1 rounded-lg border border-[#E8EDF1] bg-white px-3 py-1.5 text-xs font-medium text-[#273746] hover:bg-[#F5F7F8]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('common.back')}</span>
        </Link>
        <h1 className="text-xl font-bold text-[#273746]">{t('production.addTitle')}</h1>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('production.productionDate')}</label>
            <input
              type="date"
              required
              value={productionDate}
              onChange={(e) => setProductionDate(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('production.batchNumber')}</label>
            <input
              type="text"
              required
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm font-mono text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('production.blockSize')}</label>
            <select
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.dimensions})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('production.blockType')}</label>
            <select
              value={blockType}
              onChange={(e) => setBlockType(e.target.value as BlockType)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            >
              <option value="hollow">{t('production.types.hollow')}</option>
              <option value="solid">{t('production.types.solid')}</option>
              <option value="paving">{t('production.types.paving')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('production.quantityProduced')}</label>
            <input
              type="number"
              min={1}
              required
              value={quantityProduced}
              onChange={(e) => setQuantityProduced(Math.max(1, Number(e.target.value)))}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm tabular-nums text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('production.damagedQuantity')}</label>
            <input
              type="number"
              min={0}
              max={quantityProduced}
              value={damagedQuantity}
              onChange={(e) => setDamagedQuantity(Math.max(0, Number(e.target.value)))}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm tabular-nums text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('production.productionTeam')}</label>
            <input
              type="text"
              required
              value={productionTeam}
              onChange={(e) => setProductionTeam(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('production.workerName')}</label>
            <input
              type="text"
              required
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('production.status')}</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setStatus('curing')}
              className={`rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors ${
                status === 'curing'
                  ? 'border-[#D6A451] bg-[#D6A451]/15 text-[#273746]'
                  : 'border-[#E8EDF1] bg-[#F5F7F8] text-[#7B8790]'
              }`}
            >
              {t('production.statuses.curing')}
            </button>
            <button
              type="button"
              onClick={() => setStatus('ready')}
              className={`rounded-lg border px-4 py-2.5 text-xs font-semibold transition-colors ${
                status === 'ready'
                  ? 'border-[#4D947C] bg-[#4D947C]/15 text-[#273746]'
                  : 'border-[#E8EDF1] bg-[#F5F7F8] text-[#7B8790]'
              }`}
            >
              {t('production.statuses.ready')}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-[#7B8790]">
            {status === 'curing' ? t('production.curingHint') : t('production.readyHint')}
          </p>
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
            to="/production"
            className="rounded-lg border border-[#E8EDF1] px-4 py-2.5 text-xs font-semibold text-[#273746]"
          >
            {t('common.cancel')}
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#4D947C] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#3f7d68] disabled:opacity-60"
          >
            {submitting ? t('common.saving') : t('production.recordBatch')}
          </button>
        </div>
      </form>
    </div>
  );
};
