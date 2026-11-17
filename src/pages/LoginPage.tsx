import { Blocks, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PWAInstallButton } from '../components/PWAInstallButton.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login, settings, language, setLanguage } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset password modal state
  const [resetMode, setResetMode] = useState(false);
  const [resetStep, setResetStep] = useState<'request' | 'complete'>('request');
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.invalidCredentials'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/request-reset', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      setResetMessage(res.message);
      setResetStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset request failed');
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail.trim(), token: resetToken.trim(), newPassword }),
      });
      setResetMessage(res.message);
      setResetMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7F8] flex flex-col lg:flex-row">
      {/* Left Visual Column */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-[#18334A] overflow-hidden">
        <img
          src="/src/assets/images/login_masonry_yard_1794929772700.jpg"
          alt="Concrete block manufacturing yard"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover opacity-85"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#18334A] via-[#18334A]/50 to-transparent" />
        <div className="absolute bottom-10 left-10 right-10 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4D947C]">
              <Blocks className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">{settings.companyName || 'BULUKEETI PRO'}</span>
          </div>
          <p className="text-sm text-white/85 max-w-md leading-relaxed">{t('auth.loginSubtitle')}</p>
        </div>
      </div>

      {/* Right Form Column */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-[#F5F7F8]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#18334A] text-white">
              <Blocks className="h-4 w-4" />
            </div>
            <span className="text-base font-bold text-[#18334A]">{settings.companyName || 'BULUKEETI PRO'}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <PWAInstallButton compact />
            <div className="inline-flex items-center rounded-lg border border-[#E8EDF1] bg-white p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => void setLanguage('en')}
                className={`px-2.5 py-1 rounded-md ${language === 'en' ? 'bg-[#18334A] text-white' : 'text-[#7B8790]'}`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => void setLanguage('so')}
                className={`px-2.5 py-1 rounded-md ${language === 'so' ? 'bg-[#18334A] text-white' : 'text-[#7B8790]'}`}
              >
                SO
              </button>
            </div>
          </div>
        </div>

        <div className="w-full max-w-md mx-auto my-auto py-8">
          <div className="rounded-xl border border-[#E8EDF1] bg-white p-6 sm:p-8">
            <h1 className="text-2xl font-bold text-[#273746]">
              {resetMode ? t('auth.resetTitle') : t('auth.loginTitle')}
            </h1>
            <p className="mt-1.5 text-sm text-[#7B8790]">{t('auth.loginSubtitle')}</p>

            {error && (
              <div className="mt-4 rounded-lg border border-[#C96D6D]/30 bg-[#C96D6D]/10 px-3.5 py-2.5 text-xs font-medium text-[#C96D6D]">
                {error}
              </div>
            )}

            {resetMessage && (
              <div className="mt-4 rounded-lg border border-[#4D947C]/30 bg-[#4D947C]/10 px-3.5 py-2.5 text-xs font-medium text-[#4D947C]">
                {resetMessage}
              </div>
            )}

            {!resetMode ? (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('auth.email')}</label>
                  <div className="relative">
                    <Mail className="h-4 w-4 text-[#7B8790] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@bulukeeti.com"
                      className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] pl-9 pr-3 py-2.5 text-sm text-[#273746] focus:border-[#18334A] focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('auth.password')}</label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-[#7B8790] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] pl-9 pr-10 py-2.5 text-sm text-[#273746] focus:border-[#18334A] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7B8790] hover:text-[#273746]"
                      aria-label="Toggle password visibility"
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setResetMode(true);
                      setError('');
                    }}
                    className="text-xs font-medium text-[#18334A] hover:underline"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-[#18334A] py-2.5 px-4 text-sm font-semibold text-white hover:bg-[#112638] disabled:opacity-60 transition-colors"
                >
                  {submitting ? t('auth.signingIn') : t('auth.signIn')}
                </button>
              </form>
            ) : resetStep === 'request' ? (
              <form onSubmit={handleRequestReset} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('auth.email')}</label>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746] focus:border-[#18334A] focus:bg-white focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setResetMode(false)}
                    className="flex-1 rounded-lg border border-[#E8EDF1] py-2.5 text-sm font-medium text-[#273746]"
                  >
                    {t('common.back')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-[#18334A] py-2.5 text-sm font-semibold text-white hover:bg-[#112638]"
                  >
                    {t('auth.requestReset')}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCompleteReset} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('auth.resetToken')}</label>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm font-mono text-[#273746]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#273746] mb-1.5">{t('auth.newPassword')}</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] px-3 py-2.5 text-sm text-[#273746]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setResetMode(false)}
                    className="flex-1 rounded-lg border border-[#E8EDF1] py-2.5 text-sm font-medium text-[#273746]"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-[#4D947C] py-2.5 text-sm font-semibold text-white"
                  >
                    {t('auth.completeReset')}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-6 pt-5 border-t border-[#E8EDF1] text-xs text-[#7B8790] space-y-1">
              <div className="font-semibold text-[#273746]">{t('auth.initialSetupTitle')}</div>
              <div className="font-mono">admin@bulukeeti.com · Admin@1234</div>
              <div>{t('auth.initialSetupHint')}</div>
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-[#7B8790]">
          BULUKEETI PRO · {settings.companyAddress || 'Concrete Operations'}
        </div>
      </div>
    </div>
  );
};
