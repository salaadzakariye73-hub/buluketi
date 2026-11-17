import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import type { LanguageCode } from '../types/index.ts';

export const ProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { user, language, setLanguage, refreshProfile } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [prefLang, setPrefLang] = useState<LanguageCode>(language);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload: Record<string, string> = {
        name,
        phone,
        preferredLanguage: prefLang,
      };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await setLanguage(prefLang);
      await refreshProfile();
      setCurrentPassword('');
      setNewPassword('');
      setMessage(t('profile.updatedSuccess'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-xl lg:text-2xl font-bold text-[#273746]">{t('profile.title')}</h1>

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

      <form onSubmit={handleSubmit} className="rounded-xl border border-[#E8EDF1] bg-white p-6 space-y-5">
        <div className="border-b border-[#E8EDF1] pb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[#273746]">{user?.email}</div>
            <div className="text-xs text-[#7B8790] mt-0.5">{user ? t(`roles.${user.role}`) : ''}</div>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#7B8790]">{t('profile.accountInfo')}</h2>
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
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('employees.phone')}</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('profile.preferredLanguage')}</label>
            <select
              value={prefLang}
              onChange={(e) => setPrefLang(e.target.value as LanguageCode)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
            >
              <option value="en">English (EN)</option>
              <option value="so">Af-Soomaali (SO)</option>
            </select>
          </div>
        </div>

        <div className="border-t border-[#E8EDF1] pt-4 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-[#7B8790]">{t('profile.changePassword')}</h2>
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('auth.currentPassword')}</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#273746] mb-1">{t('auth.newPassword')}</label>
            <input
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[#18334A] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#112638]"
          >
            {saving ? t('common.saving') : t('profile.updateProfile')}
          </button>
        </div>
      </form>
    </div>
  );
};
