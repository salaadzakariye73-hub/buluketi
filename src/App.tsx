import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { NetworkProvider } from './context/NetworkContext.tsx';
import './i18n/index.ts';
import { AddProductionPage } from './pages/AddProductionPage.tsx';
import { CustomerDetailsPage } from './pages/CustomerDetailsPage.tsx';
import { CustomersPage } from './pages/CustomersPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { EmployeesPage } from './pages/EmployeesPage.tsx';
import { ExpensesPage } from './pages/ExpensesPage.tsx';
import { InventoryPage } from './pages/InventoryPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NewSalePage } from './pages/NewSalePage.tsx';
import { ProductionPage } from './pages/ProductionPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { SalesPage } from './pages/SalesPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import type { UserRole } from './types/index.ts';

const ProtectedRoute: React.FC<{ roles?: UserRole[]; children: React.ReactNode }> = ({ roles, children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F7F8] flex items-center justify-center text-sm text-[#7B8790]">
        Loading BULUKEETI PRO...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <NetworkProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <PublicOnlyRoute>
                  <LoginPage />
                </PublicOnlyRoute>
              }
            />

            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<DashboardPage />} />

              <Route
                path="/production"
                element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER', 'WORKER']}>
                    <ProductionPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/production/new"
                element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER', 'WORKER']}>
                    <AddProductionPage />
                  </ProtectedRoute>
                }
              />

              <Route path="/inventory" element={<InventoryPage />} />

              <Route
                path="/sales"
                element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER', 'SALESPERSON']}>
                    <SalesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/sales/new"
                element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER', 'SALESPERSON']}>
                    <NewSalePage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/customers"
                element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER', 'SALESPERSON']}>
                    <CustomersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/customers/:id"
                element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER', 'SALESPERSON']}>
                    <CustomerDetailsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/expenses"
                element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <ExpensesPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/reports"
                element={
                  <ProtectedRoute roles={['ADMIN', 'MANAGER']}>
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/employees"
                element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <EmployeesPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/settings"
                element={
                  <ProtectedRoute roles={['ADMIN']}>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />

              <Route path="/profile" element={<ProfilePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NetworkProvider>
    </AuthProvider>
  );
}
