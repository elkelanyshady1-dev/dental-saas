/**
 * format.js — formatting helpers used by analytics cards.
 * All numbers come from backend DTOs pre-rounded; these helpers only add
 * thousands separators, unit suffixes, and sign.
 */

export function formatCurrency(value, currency = "AED") {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    const n = Math.round(value);
    const str = new Intl.NumberFormat("en-US").format(n);
    return `${currency} ${str}`;
}

export function formatNumber(value) {
    if (value === null || value === undefined) return "—";
    if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
    return new Intl.NumberFormat("en-US").format(Math.round(value));
}

export function formatPercent(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return `${Number(value).toFixed(digits)}%`;
}

export function formatMinutes(mins) {
    if (!mins) return "0m";
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

export function formatDelta(deltaPct) {
    if (deltaPct === null || deltaPct === undefined || Number.isNaN(deltaPct)) return "";
    const sign = deltaPct > 0 ? "+" : "";
    return `${sign}${deltaPct.toFixed(1)}%`;
}

export function formatBucketLabel(iso, granularity) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    if (granularity === "month") {
        return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    }
    if (granularity === "week") {
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const CHART_COLORS = Object.freeze({
    indigo: "#6366F1",
    sky: "#0EA5E9",
    emerald: "#10B981",
    amber: "#F59E0B",
    rose: "#F43F5E",
    fuchsia: "#D946EF",
    slate: "#64748B",
});

export const PALETTE = Object.freeze([
    CHART_COLORS.indigo,
    CHART_COLORS.sky,
    CHART_COLORS.emerald,
    CHART_COLORS.amber,
    CHART_COLORS.rose,
    CHART_COLORS.fuchsia,
]);
