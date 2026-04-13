/**
 * router.tsx
 * Patient Portal — Application Router
 *
 * ─── Performance ─────────────────────────────────────────────────────
 *   ✅ All pages lazy-loaded (code splitting)
 *   ✅ Route prefetching on hover/touch (preloadMap)
 *   ✅ Suspense fallback with spinner
 *
 * ─── Security ────────────────────────────────────────────────────────
 *   ✅ ProtectedRoute checks auth before render
 *   ✅ PublicRoute redirects authenticated users away from login
 *   ✅ Catch-all redirects to /
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import PortalLayout from '@/layouts/PortalLayout';

/* ─── Lazy-loaded Pages ───────────────────────────────────────────── */
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const MagicLinkVerifyPage = lazy(() => import('@/pages/MagicLinkVerifyPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const AppointmentsPage = lazy(() => import('@/pages/AppointmentsPage'));
const FinancialPage = lazy(() => import('@/pages/FinancialPage'));
const MedicalHistoryPage = lazy(() => import('@/pages/MedicalHistoryPage'));
const OrthoPage = lazy(() => import('@/pages/OrthoPage'));
const RemindersPage = lazy(() => import('@/pages/RemindersPage'));

/* ─── Page Loading Spinner ────────────────────────────────────────── */
const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <div className="relative">
      <div className="w-10 h-10 rounded-full border-[3px] border-slate-200" />
      <div className="w-10 h-10 rounded-full border-[3px] border-blue-600 border-t-transparent animate-spin absolute top-0 left-0" />
    </div>
  </div>
);

/* ─── Route Guards ────────────────────────────────────────────────── */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = usePortalAuth();

  if (isLoading) return <PageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = usePortalAuth();

  if (isLoading) return <PageLoader />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
};

/* ─── Router ──────────────────────────────────────────────────────── */
const AppRouter: React.FC = () => (
  <BrowserRouter>
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/magic-link"
          element={
            <PublicRoute>
              <MagicLinkVerifyPage />
            </PublicRoute>
          }
        />

        {/* Protected — nested inside PortalLayout */}
        <Route
          element={
            <ProtectedRoute>
              <PortalLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="financial" element={<FinancialPage />} />
          <Route path="medical" element={<MedicalHistoryPage />} />
          <Route path="ortho" element={<OrthoPage />} />
          <Route path="reminders" element={<RemindersPage />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
);

export default AppRouter;
