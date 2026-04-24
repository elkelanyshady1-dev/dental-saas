/**
 * queryKeys.ts — Centralized Query Key Registry (Patient Portal)
 *
 * Single source of truth for every React Query key in the portal app.
 * Prevents drift, enables prefix-based invalidation, and keeps the cache
 * coherent across tabs and pages.
 *
 * Invalidation patterns:
 *   qc.invalidateQueries({ queryKey: QK.all })         → every portal query
 *   qc.invalidateQueries({ queryKey: QK.dashboard() }) → dashboard only
 *   qc.invalidateQueries({ queryKey: QK.progress() }) → ortho progress only
 */

const all = ["portal"] as const;

export const QK = Object.freeze({
    all,
    dashboard:       () => [...all, "dashboard"] as const,
    appointments:    () => [...all, "appointments"] as const,
    invoices:        () => [...all, "invoices"] as const,
    medicalHistory:  () => [...all, "medical-history"] as const,
    reminders:       () => [...all, "reminders"] as const,
    progress:        () => [...all, "progress"] as const,
});

export default QK;
