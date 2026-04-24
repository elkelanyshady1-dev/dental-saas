/**
 * sla.js — Lab-case SLA helpers.
 *
 * Zero-dep (uses native Date). Used by Kanban cards, case detail, dashboard.
 */

/**
 * Compute the SLA status of a case based on its `expectedDelivery` date.
 * @param {string|Date|null|undefined} expectedDelivery
 * @returns {"overdue"|"urgent"|"upcoming"|"normal"|"none"}
 */
export function getSLAStatus(expectedDelivery) {
    if (!expectedDelivery) return "none";
    const target = new Date(expectedDelivery).getTime();
    if (Number.isNaN(target)) return "none";
    const diffDays = Math.ceil((target - Date.now()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0)  return "overdue";
    if (diffDays <= 2) return "urgent";
    if (diffDays <= 5) return "upcoming";
    return "normal";
}

/**
 * Days remaining until expectedDelivery. Negative = past due.
 */
export function daysUntil(date) {
    if (!date) return null;
    const t = new Date(date).getTime();
    if (Number.isNaN(t)) return null;
    return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

/**
 * Tailwind class tokens for the SLA pill/badge.
 */
export const SLA_TOKENS = {
    overdue:  "bg-red-200 text-red-900 border border-red-300",
    urgent:   "bg-red-100 text-red-700 border border-red-200",
    upcoming: "bg-amber-100 text-amber-700 border border-amber-200",
    normal:   "bg-emerald-100 text-emerald-700 border border-emerald-200",
    none:     "bg-slate-100 text-slate-500 border border-slate-200",
};

/**
 * Short human label for a case's SLA bucket.
 */
export function slaLabel(status, days) {
    if (status === "none") return "No due date";
    if (days === null) return "No due date";
    if (days < 0)  return `${-days}d overdue`;
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return `${days}d remaining`;
}
