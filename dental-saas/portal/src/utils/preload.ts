/**
 * preload.ts
 * Route prefetching map — triggers lazy chunk loading on hover/touch
 *
 * ─── USAGE ────────────────────────────────────────────────────────
 *   onMouseEnter={() => preloadMap[path]?.()}
 *   onTouchStart={() => preloadMap[path]?.()}
 */

export const preloadMap: Record<string, () => void> = {
  '/': () => { import('@/pages/DashboardPage'); },
  '/appointments': () => { import('@/pages/AppointmentsPage'); },
  '/financial': () => { import('@/pages/FinancialPage'); },
  '/medical': () => { import('@/pages/MedicalHistoryPage'); },
  '/ortho': () => { import('@/pages/OrthoPage'); },
  '/reminders': () => { import('@/pages/RemindersPage'); },
};
