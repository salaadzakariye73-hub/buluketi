import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../lib/api.ts';
import { cacheReferenceData } from '../offline/syncService.ts';
import type { AuthUser, CompanySettingsData, LanguageCode, UserRole } from '../types/index.ts';

interface AuthContextValue {
  user: AuthUser | null;
  settings: CompanySettingsData;
  loading: boolean;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
}

const DEFAULT_SETTINGS: CompanySettingsData = {
  companyName: 'BULUKEETI PRO',
  companyLogo: '',
  companyAddress: '',
  phoneNumber: '',
  currency: 'USD',
  defaultLanguage: 'en',
  lowStockAlertDefault: 500,
  invoiceFooterNote: 'Thank you for your business.',
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { i18n } = useTranslation();
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem('bulukeeti_user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  });
  const [settings, setSettings] = useState<CompanySettingsData>(() => {
    const raw = localStorage.getItem('bulukeeti_settings');
    if (!raw) return DEFAULT_SETTINGS;
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<CompanySettingsData>) };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [language, setLangState] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem('bulukeeti_lang');
    return saved === 'so' || saved === 'en' ? saved : 'en';
  });

  const applyLanguage = useCallback(
    (lang: LanguageCode) => {
      setLangState(lang);
      localStorage.setItem('bulukeeti_lang', lang);
      void i18n.changeLanguage(lang);
      document.documentElement.lang = lang;
    },
    [i18n]
  );

  const refreshSettings = useCallback(async () => {
    try {
      const token = localStorage.getItem('bulukeeti_token');
      const data = token
        ? await apiFetch<CompanySettingsData>('/api/settings')
        : await apiFetch<CompanySettingsData>('/api/settings/public');
      const merged = { ...DEFAULT_SETTINGS, ...data };
      setSettings(merged);
      localStorage.setItem('bulukeeti_settings', JSON.stringify(merged));

      // Apply system default language if user has not set a preference yet
      if (!localStorage.getItem('bulukeeti_lang') && (merged.defaultLanguage === 'en' || merged.defaultLanguage === 'so')) {
        applyLanguage(merged.defaultLanguage);
      }
    } catch {
      // keep cached settings when offline
    }
  }, [applyLanguage]);

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem('bulukeeti_token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const me = await apiFetch<AuthUser>('/api/auth/me');
      setUser(me);
      localStorage.setItem('bulukeeti_user', JSON.stringify(me));
      if (me.preferredLanguage === 'en' || me.preferredLanguage === 'so') {
        applyLanguage(me.preferredLanguage);
      }
      void cacheReferenceData();
    } catch (err) {
      // If offline, preserve cached user session; if 401 unauthorized, clear session
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        localStorage.removeItem('bulukeeti_token');
        localStorage.removeItem('bulukeeti_user');
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [applyLanguage]);

  useEffect(() => {
    void refreshSettings();
    void refreshProfile();
  }, [refreshProfile, refreshSettings]);

  const setLanguage = useCallback(
    async (lang: LanguageCode) => {
      applyLanguage(lang);
      if (user && navigator.onLine) {
        try {
          const updated = await apiFetch<AuthUser>('/api/auth/profile', {
            method: 'PATCH',
            body: JSON.stringify({ preferredLanguage: lang }),
          });
          setUser(updated);
          localStorage.setItem('bulukeeti_user', JSON.stringify(updated));
        } catch {
          // persisted locally even if offline
        }
      }
    },
    [applyLanguage, user]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('bulukeeti_token', data.token);
      localStorage.setItem('bulukeeti_user', JSON.stringify(data.user));
      setUser(data.user);

      // Remember user's saved language preference from server across logout/login
      const lang = data.user.preferredLanguage || settings.defaultLanguage || 'en';
      applyLanguage(lang);

      await refreshSettings();
      await cacheReferenceData();
    },
    [applyLanguage, refreshSettings, settings.defaultLanguage]
  );

  const logout = useCallback(() => {
    localStorage.removeItem('bulukeeti_token');
    localStorage.removeItem('bulukeeti_user');
    setUser(null);
    // Note: intentionally keep bulukeeti_lang in localStorage so language preference persists visually on login screen too
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        settings,
        loading,
        language,
        setLanguage,
        login,
        logout,
        refreshProfile,
        refreshSettings,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
