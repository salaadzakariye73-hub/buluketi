import { KeyRound, Plus, UserCog } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../lib/api.ts';
import type { LanguageCode, UserRole } from '../types/index.ts';

interface EmployeeRow {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  preferredLanguage: LanguageCode;
  isActive: boolean;
  lastLoginAt?: string;
}

export const EmployeesPage: React.FC = () => {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add Employee modal
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('WORKER');
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>('so');
  const [saving, setSaving] = useState(false);

  // Reset Password modal
  const [resetTarget, setResetTarget] = useState<EmployeeRow | null>(null);
  const [resetPass, setResetPass] = useState('');

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await apiFetch<EmployeeRow[]>('/api/users');
      setEmployees(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, phone, password, role, preferredLanguage }),
      });
      setShowAdd(false);
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create employee');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (emp: EmployeeRow) => {
    setError('');
    try {
      await apiFetch(`/api/users/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !emp.isActive }),
      });
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update employee');
    }
  };

  const handleRoleChange = async (emp: EmployeeRow, nextRole: UserRole) => {
    setError('');
    try {
      await apiFetch(`/api/users/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      await loadEmployees();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setError('');
    try {
      await apiFetch('/api/auth/admin-reset-password', {
        method: 'POST',
        body: JSON.stringify({ userId: resetTarget.id, newPassword: resetPass }),
      });
      setResetTarget(null);
      setResetPass('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('employees.title')}</h1>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#18334A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112638]"
        >
          <Plus className="h-4 w-4" />
          <span>{t('employees.addEmployee')}</span>
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-4 py-2.5 text-xs font-medium text-[#C96D6D]">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-[#E8EDF1] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8EDF1] bg-[#F5F7F8] text-left text-xs text-[#7B8790]">
                <th className="px-4 py-3 font-medium">{t('employees.name')}</th>
                <th className="px-4 py-3 font-medium">{t('employees.email')}</th>
                <th className="px-4 py-3 font-medium">{t('employees.role')}</th>
                <th className="px-4 py-3 font-medium">{t('common.status')}</th>
                <th className="px-4 py-3 font-medium">{t('employees.lastLogin')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EDF1]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-xs text-[#7B8790]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-[#F5F7F8]">
                    <td className="px-4 py-3">
                      <div className="text-xs font-semibold text-[#273746]">{emp.name}</div>
                      <div className="text-[11px] text-[#7B8790]">{emp.phone || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#273746]">{emp.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={emp.role}
                        onChange={(e) => void handleRoleChange(emp, e.target.value as UserRole)}
                        className="rounded-md border border-[#E8EDF1] bg-[#F5F7F8] px-2 py-1 text-xs text-[#273746]"
                      >
                        <option value="ADMIN">{t('roles.ADMIN')}</option>
                        <option value="MANAGER">{t('roles.MANAGER')}</option>
                        <option value="WORKER">{t('roles.WORKER')}</option>
                        <option value="SALESPERSON">{t('roles.SALESPERSON')}</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">
                      {emp.isActive ? (
                        <span className="text-[#4D947C]">{t('employees.active')}</span>
                      ) : (
                        <span className="text-[#C96D6D]">{t('employees.inactive')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-[#7B8790]">
                      {emp.lastLoginAt ? new Date(emp.lastLoginAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setResetTarget(emp);
                            setResetPass('');
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#18334A] hover:underline"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>{t('employees.resetPassword')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(emp)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#7B8790] hover:text-[#273746]"
                        >
                          <UserCog className="h-3.5 w-3.5" />
                          <span>{emp.isActive ? t('employees.deactivate') : t('employees.activate')}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleCreate} className="w-full max-w-md rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-[#273746]">{t('employees.addEmployee')}</h2>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('employees.name')}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('employees.email')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('employees.phone')}</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#273746] mb-1">{t('employees.role')}</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
                >
                  <option value="WORKER">{t('roles.WORKER')}</option>
                  <option value="SALESPERSON">{t('roles.SALESPERSON')}</option>
                  <option value="MANAGER">{t('roles.MANAGER')}</option>
                  <option value="ADMIN">{t('roles.ADMIN')}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#273746] mb-1">{t('employees.language')}</label>
                <select
                  value={preferredLanguage}
                  onChange={(e) => setPreferredLanguage(e.target.value as LanguageCode)}
                  className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
                >
                  <option value="en">English</option>
                  <option value="so">Af-Soomaali</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('auth.password')}</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleResetPassword} className="w-full max-w-sm rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-4">
            <h2 className="text-base font-bold text-[#273746]">
              {t('employees.resetPassword')} · {resetTarget.name}
            </h2>
            <div>
              <label className="block text-xs font-semibold text-[#273746] mb-1">{t('auth.newPassword')}</label>
              <input
                type="password"
                required
                minLength={8}
                value={resetPass}
                onChange={(e) => setResetPass(e.target.value)}
                className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
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
