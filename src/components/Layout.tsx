import {
  BarChart3,
  Blocks,
  Boxes,
  Factory,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  RefreshCw,
  Settings,
  ShoppingCart,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { useNetwork } from '../context/NetworkContext.tsx';
import type { UserRole } from '../types/index.ts';
import { PWAInstallButton } from './PWAInstallButton.tsx';

interface NavItem {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'MANAGER', 'WORKER', 'SALESPERSON'] },
  { to: '/production', labelKey: 'nav.production', icon: Factory, roles: ['ADMIN', 'MANAGER', 'WORKER'] },
  { to: '/inventory', labelKey: 'nav.inventory', icon: Boxes, roles: ['ADMIN', 'MANAGER', 'WORKER', 'SALESPERSON'] },
  { to: '/sales', labelKey: 'nav.sales', icon: ShoppingCart, roles: ['ADMIN', 'MANAGER', 'SALESPERSON'] },
  { to: '/customers', labelKey: 'nav.customers', icon: Users, roles: ['ADMIN', 'MANAGER', 'SALESPERSON'] },
  { to: '/expenses', labelKey: 'nav.expenses', icon: Receipt, roles: ['ADMIN', 'MANAGER'] },
  { to: '/reports', labelKey: 'nav.reports', icon: BarChart3, roles: ['ADMIN', 'MANAGER'] },
  { to: '/employees', labelKey: 'nav.employees', icon: UserCheck, roles: ['ADMIN'] },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings, roles: ['ADMIN'] },
];

export const Layout: React.FC = () => {
  const { t } = useTranslation();
  const { user, settings, language, setLanguage, logout } = useAuth();
  const { isOnline, pendingCount, conflictItems, isSyncing, syncNow, dismissConflict } = useNetwork();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const visibleItems = NAV_ITEMS.filter((item) => (user ? item.roles.includes(user.role) : false));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#F5F7F8] text-[#273746] flex">
      {/* Desktop Sidebar (#18334A Deep Navy Blue) */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-[#18334A] text-white border-r border-[#122739]">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          {settings.companyLogo ? (
            <img
              src={settings.companyLogo}
              alt={settings.companyName}
              referrerPolicy="no-referrer"
              className="h-9 w-9 rounded-lg object-cover bg-white shrink-0"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4D947C] text-white shrink-0">
              <Blocks className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight truncate">{settings.companyName || 'BULUKEETI PRO'}</div>
            <div className="text-xs text-white/65 truncate">{t('appSubtitle')}</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3 space-y-1">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10'
              }`
            }
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-xs font-semibold shrink-0">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate">{user?.name}</div>
              <div className="text-[11px] text-white/65 truncate">{user ? t(`roles.${user.role}`) : ''}</div>
            </div>
          </NavLink>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>{t('nav.logout')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/45" onClick={() => setMobileMenuOpen(false)} />
          <aside className="relative flex w-72 max-w-[80vw] flex-col bg-[#18334A] text-white z-10">
            <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
              <span className="text-base font-bold tracking-tight">{settings.companyName || 'BULUKEETI PRO'}</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg text-white/80 hover:bg-white/10"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${
                        isActive ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{t(item.labelKey)}</span>
                  </NavLink>
                );
              })}
              <NavLink
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <Users className="h-4 w-4 shrink-0" />
                <span>{t('nav.profile')}</span>
              </NavLink>
            </nav>
            <div className="p-3 border-t border-white/10">
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>{t('nav.logout')}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 pb-20 lg:pb-0">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 h-14 bg-white border-b border-[#E8EDF1] px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-[#273746] hover:bg-[#F5F7F8]"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link to="/" className="lg:hidden text-sm font-bold text-[#18334A] truncate">
              {settings.companyName || 'BULUKEETI PRO'}
            </Link>
            {/* Real connectivity & pending sync status */}
            <div className="hidden sm:flex items-center gap-3 text-xs">
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5 text-[#4D947C] font-medium whitespace-nowrap">
                  <Wifi className="h-3.5 w-3.5" />
                  <span>{t('common.online')}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[#D6A451] font-medium whitespace-nowrap">
                  <WifiOff className="h-3.5 w-3.5" />
                  <span>{t('common.offline')}</span>
                </span>
              )}

              {pendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  disabled={!isOnline || isSyncing}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#D6A451]/40 bg-[#D6A451]/10 px-2.5 py-1 text-xs font-medium text-[#273746] hover:bg-[#D6A451]/20 disabled:opacity-60 whitespace-nowrap"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>
                    {isSyncing ? t('common.syncing') : `${t('common.syncPending')} (${pendingCount})`}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <PWAInstallButton compact />

            {/* Bilingual Language Selector EN | SO */}
            <div
              className="inline-flex items-center rounded-lg border border-[#E8EDF1] bg-[#F5F7F8] p-0.5 text-xs font-semibold"
              role="group"
              aria-label="Language selector"
            >
              <button
                type="button"
                onClick={() => void setLanguage('en')}
                className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                  language === 'en' ? 'bg-[#18334A] text-white' : 'text-[#7B8790] hover:text-[#273746]'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => void setLanguage('so')}
                className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap ${
                  language === 'so' ? 'bg-[#18334A] text-white' : 'text-[#7B8790] hover:text-[#273746]'
                }`}
              >
                SO
              </button>
            </div>
          </div>
        </header>

        {/* Offline / Sync Conflict Alerts */}
        {!isOnline && (
          <div className="no-print bg-[#D6A451]/15 border-b border-[#D6A451]/30 px-4 lg:px-6 py-2 text-xs font-medium text-[#273746] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-[#D6A451] shrink-0" />
              <span>{t('common.provisionalStockWarning')}</span>
            </div>
            {pendingCount > 0 && (
              <span className="tabular-nums font-semibold whitespace-nowrap">
                {t('common.syncPending')}: {pendingCount}
              </span>
            )}
          </div>
        )}

        {conflictItems.length > 0 && (
          <div className="no-print bg-[#C96D6D]/10 border-b border-[#C96D6D]/30 px-4 lg:px-6 py-2.5 text-xs text-[#273746] space-y-1">
            {conflictItems.map((c) => (
              <div key={c.clientTxId} className="flex items-center justify-between gap-3">
                <span className="font-medium text-[#C96D6D]">
                  Sync conflict ({c.entityType}): {c.errorMessage}
                </span>
                {c.id !== undefined && (
                  <button
                    type="button"
                    onClick={() => void dismissConflict(c.id!)}
                    className="text-xs underline text-[#7B8790] hover:text-[#273746]"
                  >
                    {t('common.close')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-30 h-16 bg-white border-t border-[#E8EDF1] flex items-center justify-around px-1">
        {visibleItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium min-w-[56px] ${
                  isActive ? 'text-[#18334A]' : 'text-[#7B8790]'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span className="truncate max-w-[64px]">{t(item.labelKey)}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
