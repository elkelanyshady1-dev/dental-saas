/**
 * PortalLayout.tsx
 * Patient Portal — Shell Layout (Header + Sidebar + Content)
 *
 * ─── Performance ─────────────────────────────────────────────────────
 *   ✅ Route prefetching on hover/touch (preloadMap)
 *   ✅ AnimatePresence page transitions
 *   ✅ Memoized nav items
 *
 * ─── Security ────────────────────────────────────────────────────────
 *   ✅ Logout clears sessionStorage + queryClient + context
 */

import React, { useState, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutGrid,
  Calendar,
  DollarSign,
  Stethoscope,
  Smile,
  Bell,
  LogOut,
  Menu,
  X,
  User,
  Phone,
} from 'lucide-react';
import { usePortalAuth } from '@/contexts/PortalAuthContext';
import { preloadMap } from '@/utils/preload';

/* ─── Nav Items ───────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', labelAr: 'لوحة التحكم', icon: LayoutGrid, end: true },
  { path: '/appointments', label: 'Appointments', labelAr: 'المواعيد', icon: Calendar },
  { path: '/financial', label: 'Financial', labelAr: 'المالية', icon: DollarSign },
  { path: '/medical', label: 'Medical', labelAr: 'التاريخ الطبي', icon: Stethoscope },
  { path: '/ortho', label: 'Orthodontics', labelAr: 'تقويم الأسنان', icon: Smile },
  { path: '/reminders', label: 'Reminders', labelAr: 'التذكيرات', icon: Bell },
] as const;

const PortalLayout: React.FC = () => {
  const { logout } = usePortalAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isRtl = language === 'ar';

  /* ─── Prefetch on hover/touch ───────────────────────────────────── */
  const handlePrefetch = useCallback((path: string) => {
    preloadMap[path]?.();
  }, []);

  /* ─── Hard-reset logout ─────────────────────────────────────────── */
  const handleLogout = useCallback(async () => {
    try {
      await logout();
    } finally {
      // Hard reset: clear ALL client state
      sessionStorage.clear();
      queryClient.clear();
      navigate('/login', { replace: true });
    }
  }, [logout, queryClient, navigate]);

  const getLabel = (item: (typeof NAV_ITEMS)[number]) =>
    language === 'ar' ? item.labelAr : item.label;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-[Inter,system-ui,sans-serif] text-slate-900" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="h-16 md:h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 -ml-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
            <Smile className="w-5 h-5 md:w-6 md:h-6" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg md:text-xl font-black text-slate-800 leading-none mb-0.5">Patient Portal</h1>
            <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
              {language === 'ar' ? 'مرحباً بك' : 'Welcome back'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
          {/* Language Toggle */}
          <div className="flex items-center bg-slate-100 p-0.5 md:p-1 rounded-xl">
            <button
              onClick={() => setLanguage('en')}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${
                language === 'en' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('ar')}
              className={`px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all ${
                language === 'ar' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'
              }`}
            >
              AR
            </button>
          </div>

          {/* User avatar */}
          <div className="hidden md:flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 border-2 border-white shadow-sm">
              <User className="w-5 h-5" />
            </div>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
            title={language === 'ar' ? 'خروج' : 'Logout'}
            aria-label="Logout"
          >
            <LogOut className={`w-5 h-5 ${isRtl ? 'scale-x-[-1]' : ''}`} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* ─── Desktop Sidebar ──────────────────────────────────── */}
        <aside className={`hidden md:flex w-64 bg-white border-slate-200 flex-col p-6 gap-2 ${isRtl ? 'border-l' : 'border-r'}`}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={'end' in item ? item.end : undefined}
                onMouseEnter={() => handlePrefetch(item.path)}
                onTouchStart={() => handlePrefetch(item.path)}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                      : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {getLabel(item)}
              </NavLink>
            );
          })}

          {/* Help card */}
          <div className="mt-auto pt-6 border-t border-slate-100">
            <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">
                {language === 'ar' ? 'هل تحتاج مساعدة؟' : 'Need Help?'}
              </p>
              <p className="text-[10px] font-medium text-blue-500 leading-relaxed mb-3">
                {language === 'ar'
                  ? 'اتصل بعيادتنا مباشرة إذا كان لديك أي أسئلة.'
                  : 'Contact our clinic directly if you have any questions.'}
              </p>
              <button className="w-full py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-blue-100 flex items-center justify-center gap-2">
                <Phone className="w-3 h-3" />
                {language === 'ar' ? 'اتصل بالعيادة' : 'Call Clinic'}
              </button>
            </div>
          </div>
        </aside>

        {/* ─── Mobile Sidebar Overlay ───────────────────────────── */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="md:hidden fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm"
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.aside
                initial={{ x: isRtl ? 280 : -280 }}
                animate={{ x: 0 }}
                exit={{ x: isRtl ? 280 : -280 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className={`md:hidden fixed top-16 ${isRtl ? 'right-0' : 'left-0'} bottom-0 w-[280px] bg-white z-40 p-6 flex flex-col gap-2 shadow-2xl`}
              >
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={'end' in item ? item.end : undefined}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                            : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                        }`
                      }
                    >
                      <Icon className="w-4 h-4" />
                      {getLabel(item)}
                    </NavLink>
                  );
                })}
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* ─── Main Content ─────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 custom-scrollbar">
          <div className="max-w-5xl mx-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* ─── Mobile Bottom Nav ──────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-2 py-1.5 z-30 flex items-center justify-around safe-area-pb">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={'end' in item ? item.end : undefined}
              onTouchStart={() => handlePrefetch(item.path)}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[48px] ${
                  isActive ? 'text-blue-600' : 'text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <motion.div
                    animate={isActive ? { scale: [1, 1.15, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    <Icon className="w-5 h-5" />
                  </motion.div>
                  <span className="text-[8px] font-bold uppercase tracking-wider leading-none">
                    {getLabel(item).split(' ')[0]}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

export default PortalLayout;
