import { Plus, Trash2 } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import type { ExpenseCategory, ExpenseRecord } from '../types/index.ts';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'cement',
  'sand',
  'aggregate',
  'salaries',
  'transportation',
  'electricity',
  'water',
  'maintenance',
  'other',
];

export const ExpensesPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, settings, hasRole } = useAuth();

  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Expense Modal
  const [showAdd, setShowAdd] = useState(false);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ExpenseCategory>('cement');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [responsibleEmployee, setResponsibleEmployee] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const list = await apiFetch<ExpenseRecord[]>(`/api/expenses?${params.toString()}`);
      setExpenses(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, fromDate, toDate]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          expenseDate,
          category,
          description,
          amount,
          responsibleEmployee,
        }),
      });
      setShowAdd(false);
      setDescription('');
      setAmount(0);
      await loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('common.confirmAction'))) return;
    try {
      await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' });
      await loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete expense');
    }
  };

  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const fmtMoney = (n: number) =>
    `${settings.currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('expenses.title')}</h1>
          <p className="text-xs text-[#7B8790] mt-0.5">
            {t('expenses.totalExpenses')}: <span className="font-semibold text-[#C96D6D] tabular-nums">{fmtMoney(totalAmount)}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#18334A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112638]"
        >
          <Plus className="h-4 w-4" />
          <span>{t('expenses.addExpense')}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-xs text-[#273746]"
        >
          <option value="">{t('common.all')} · {t('expenses.category')}</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`expenses.categories.${c}`)}
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

      {/* Expenses Table */}
      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-xs text-[#7B8790]">
                <th className="px-4 py-3 font-medium">{t('expenses.date')}</th>
                <th className="px-4 py-3 font-medium">{t('expenses.category')}</th>
                <th className="px-4 py-3 font-medium">{t('expenses.description')}</th>
                <th className="px-4 py-3 font-medium">{t('expenses.responsibleEmployee')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('expenses.amount')}</th>
                {hasRole('ADMIN') && <th className="px-4 py-3 font-medium text-right">{t('common.actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-[#F5F7F8]">
                    <td className="px-4 py-3 text-xs tabular-nums text-[#7B8790]">
                      {new Date(exp.expenseDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#18334A]">
                      {t(`expenses.categories.${exp.category}`)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#273746]">{exp.description}</td>
                    <td className="px-4 py-3 text-xs text-[#7B8790]">{exp.responsibleEmployee}</td>
                    <td className="px-4 py-3 text-xs text-right font-semibold tabular-nums text-[#C96D6D]">
                      {fmtMoney(exp.amount)}
                    </td>
                    {hasRole('ADMIN') && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDelete(exp.id)}
                          className="text-xs text-[#C96D6D] hover:underline inline-flex items-center gap-1"
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* Add Expense Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleAdd} className="w-full max-w-md rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-[#273746]">{t('expenses.addExpense')}</h2>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('expenses.date')}</label>
              <input
                type="date"
                required
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('expenses.category')}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`expenses.categories.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('expenses.description')}</label>
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">
                {t('expenses.amount')} ({settings.currency})
              </label>
              <input
                type="number"
                step="0.01"
                min={0.01}
                required
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('expenses.responsibleEmployee')}</label>
              <input
                type="text"
                required
                value={responsibleEmployee}
                onChange={(e) => setResponsibleEmployee(e.target.value)}
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
