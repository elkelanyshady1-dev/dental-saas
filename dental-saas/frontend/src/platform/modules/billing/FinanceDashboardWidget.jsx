/**
 * FinanceDashboardWidget.jsx
 * Sprint 7.2 — Finance KPI Dashboard (Enterprise Polish)
 *
 * Enhancements over v1:
 *  - SVG sparkline trend chart per KPI card
 *  - Expiring contracts table (contracts expiring ≤ 30 days)
 *  - Dunning queue list (contracts with active retries)
 *  - FX base currency indicator badge in header
 *  - Structured ErrorBanner with retry
 *  - Consistent Intl.NumberFormat — no hardcoded currency
 *  - No console.log
 *  - Revenue recognition progress bar (recognized / total)
 *
 * Data via: GET /api/platform/billing/dashboard
 */

import React, { useEffect, useState, useCallback } from "react";
import {
    TrendingUp, TrendingDown, DollarSign, RefreshCw,
    Clock, BarChart3, Loader2, AlertTriangle,
    Globe, ArrowUpRight, ArrowDownRight, Users,
} from "lucide-react";
import { financeService } from "../../services/billingService";
import { CONTRACT_STATUS_MAP } from "../../utils/statusStyles";
import ErrorBanner from "./ErrorBanner";
import { usePlatformCapabilities } from "../../hooks/usePlatformCapabilities";

// ─── Currency formatter ───────────────────────────────────────────────────────
function fmtCurrency(val, cur, compact = true) {
    if (val == null) return "—";
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: cur || "USD",
            notation: compact ? "compact" : "standard",
            maximumFractionDigits: compact ? 1 : 2,
        }).format(val);
    } catch {
        return `${cur} ${Number(val).toFixed(2)}`;
    }
}

function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" });
}

function diffDays(to) {
    return Math.ceil((new Date(to) - new Date()) / 86400000);
}

// ─── Sparkline (pure SVG, no library) ────────────────────────────────────────
function Sparkline({ points = [], color = "#10b981", width = 80, height = 28 }) {
    if (!points.length || points.every((p) => p === 0)) {
        return <div style={{ width, height }} className="opacity-20 bg-slate-200 rounded" />;
    }

    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const stepX = width / (points.length - 1 || 1);

    const coords = points.map((p, i) => ({
        x: i * stepX,
        y: height - ((p - min) / range) * (height - 4) - 2,
    }));

    const polyline = coords.map((c) => `${c.x},${c.y}`).join(" ");
    const area = [
        `0,${height}`,
        ...coords.map((c) => `${c.x},${c.y}`),
        `${width},${height}`,
    ].join(" ");

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <defs>
                <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={area} fill={`url(#grad-${color.replace("#", "")})`} />
            <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = "slate", trend, trendPoints = [] }) {
    const cfg = {
        slate: { bg: "bg-white border-slate-200", text: "text-slate-700", iconBg: "bg-slate-50 text-slate-500", spark: "#94a3b8" },
        emerald: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", iconBg: "bg-white text-emerald-600", spark: "#10b981" },
        blue: { bg: "bg-blue-50 border-blue-200", text: "text-blue-800", iconBg: "bg-white text-blue-600", spark: "#3b82f6" },
        violet: { bg: "bg-violet-50 border-violet-200", text: "text-violet-800", iconBg: "bg-white text-violet-600", spark: "#8b5cf6" },
        amber: { bg: "bg-amber-50 border-amber-200", text: "text-amber-800", iconBg: "bg-white text-amber-600", spark: "#f59e0b" },
    }[color] || { bg: "bg-white border-slate-200", text: "text-slate-700", iconBg: "bg-slate-50 text-slate-500", spark: "#94a3b8" };

    const trendPositive = (trend ?? 0) >= 0;

    return (
        <div className={`rounded-2xl border p-5 ${cfg.bg} flex flex-col gap-3`}>
            <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-xl ${cfg.iconBg} border border-white/60 shadow-sm`}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="text-right">
                    {trend != null && (
                        <div className={`flex items-center gap-0.5 text-[10px] font-black ${trendPositive ? "text-emerald-600" : "text-red-500"}`}>
                            {trendPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {Math.abs(trend)}%
                        </div>
                    )}
                    <Sparkline points={trendPoints} color={cfg.spark} width={64} height={24} />
                </div>
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">{label}</p>
                <h3 className={`text-2xl font-black tracking-tight ${cfg.text}`}>{value}</h3>
                {sub && <p className="text-[11px] opacity-50 font-medium mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

// ─── Alert counter badge ──────────────────────────────────────────────────────
function AlertBadge({ count, label, color = "amber", onClick }) {
    const cfg = {
        amber: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
        red: "bg-red-50 border-red-200 text-red-700 hover:bg-red-100",
        blue: "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100",
        slate: "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
    }[color] || "bg-slate-50 border-slate-200 text-slate-600";

    return (
        <button
            className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors text-left w-full ${cfg} ${onClick ? "cursor-pointer" : "cursor-default"}`}
            onClick={onClick}
        >
            <span className="text-xs font-bold">{label}</span>
            <span className="text-xl font-black">{count ?? "—"}</span>
        </button>
    );
}

// ─── Revenue recognition bar ──────────────────────────────────────────────────
function RevenueBar({ recognized, deferred, currency }) {
    const total = (recognized ?? 0) + (deferred ?? 0);
    if (!total) return null;
    const pct = Math.round((recognized / total) * 100);

    return (
        <div className="bg-bg-card border border-brand-border rounded-card shadow-card p-6">
            <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-slate-700 uppercase tracking-widest">Revenue Recognition</p>
                <span className="text-[10px] font-black text-slate-400">{pct}% recognized</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                <div
                    className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="flex justify-between text-[11px] font-bold">
                <span className="text-violet-600">Recognized: {fmtCurrency(recognized, currency, false)}</span>
                <span className="text-slate-400">Deferred: {fmtCurrency(deferred, currency, false)}</span>
            </div>
        </div>
    );
}

// ─── Expiring contracts table ─────────────────────────────────────────────────
function ExpiringContractsList({ contracts = [], currency }) {
    if (!contracts.length) return (
        <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl">
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest">No contracts expiring in 30 days</p>
        </div>
    );

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-100">
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                        {["Organization", "Status", "Expires In", "Locked Price", "Auto-Renew"].map((h) => (
                            <th key={h} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                    {contracts.map((c, i) => {
                        const days = diffDays(c.effectiveTo);
                        const urgent = days <= 7;
                        return (
                            <tr key={c._id || i} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-5 py-3.5 text-sm font-bold text-slate-800 truncate max-w-[160px]">
                                    {c.organizationName || "—"}
                                </td>
                                <td className="px-5 py-3.5">
                                    <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${CONTRACT_STATUS_MAP[c.contractStatus] || ""}`}>
                                        {c.contractStatus}
                                    </span>
                                </td>
                                <td className="px-5 py-3.5">
                                    <span className={`text-xs font-black ${urgent ? "text-red-600" : days <= 14 ? "text-amber-600" : "text-slate-600"}`}>
                                        {days}d
                                    </span>
                                </td>
                                <td className="px-5 py-3.5 text-sm font-bold text-slate-700">
                                    {fmtCurrency(c.lockedPrice, c.currency || currency, false)}
                                </td>
                                <td className="px-5 py-3.5">
                                    <span className={`text-xs font-black ${c.autoRenew ? "text-emerald-600" : "text-red-500"}`}>
                                        {c.autoRenew ? "On" : "Off"}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ─── Dunning queue ────────────────────────────────────────────────────────────
function DunningQueue({ contracts = [], currency }) {
    if (!contracts.length) return (
        <div className="py-8 text-center border-2 border-dashed border-slate-100 rounded-2xl">
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest">Dunning queue empty</p>
        </div>
    );

    return (
        <div className="overflow-hidden rounded-2xl border border-amber-100">
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-amber-50 border-b border-amber-100">
                        {["Organization", "Retry #", "Next Retry", "Amount", "Grace Remaining"].map((h) => (
                            <th key={h} className="px-5 py-3 text-[10px] font-black text-amber-700 uppercase tracking-widest">{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-amber-50/50">
                    {contracts.map((c, i) => {
                        const graceDays = c.gracePeriodDays
                            ? Math.max(0, Math.ceil((new Date(c.graceExpiresAt) - new Date()) / 86400000))
                            : null;
                        return (
                            <tr key={c._id || i} className="hover:bg-amber-50/30 transition-colors">
                                <td className="px-5 py-3.5 text-sm font-bold text-slate-800">{c.organizationName || "—"}</td>
                                <td className="px-5 py-3.5">
                                    <span className="text-xs font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">
                                        #{c.dunning?.retryCount ?? 0}
                                    </span>
                                </td>
                                <td className="px-5 py-3.5 text-xs font-bold text-slate-600">
                                    {fmtDate(c.dunning?.nextRetryAt)}
                                </td>
                                <td className="px-5 py-3.5 text-sm font-bold text-slate-700">
                                    {fmtCurrency(c.lockedPrice, c.currency || currency, false)}
                                </td>
                                <td className="px-5 py-3.5">
                                    {graceDays != null ? (
                                        <span className={`text-xs font-black ${graceDays <= 2 ? "text-red-600" : "text-orange-600"}`}>
                                            {graceDays}d
                                        </span>
                                    ) : "—"}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function FinanceDashboardWidget() {
    const { hasCapability } = usePlatformCapabilities();
    const [metrics, setMetrics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setTab] = useState("overview");  // overview | expiring | dunning

    // Capability gate — render nothing if caller lacks analytics
    if (!hasCapability("VIEW_PLATFORM_ANALYTICS")) return null;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await financeService.getRenewalMetrics();
            setMetrics(data?.data || data);
        } catch (e) {
            setError(e?.response?.data?.error?.message || e.message || "Unable to load financial metrics.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (loading) return (
        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Loading financial metrics…</span>
        </div>
    );

    if (error) return (
        <ErrorBanner
            error={error}
            title="Finance Dashboard Unavailable"
            onRetry={load}
            severity="error"
        />
    );

    if (!metrics) return null;

    const cur = metrics.baseCurrency || "USD";
    const trendMRR = metrics.MRRTrend || [];
    const trendARR = metrics.ARRTrend || [];
    const trendRec = metrics.recognizedTrend || [];
    const trendDef = metrics.deferredTrend || [];
    const expiringList = metrics.expiringContracts || [];
    const dunningList = metrics.dunningQueue || [];

    const TABS = [
        { key: "overview", label: "Overview" },
        { key: "expiring", label: `Expiring (${metrics.expiringNext30Days ?? expiringList.length ?? "—"})` },
        { key: "dunning", label: `Dunning Queue (${metrics.contractsInDunning ?? dunningList.length ?? "—"})` },
    ];

    return (
        <div className="space-y-6" id="finance-dashboard-widget">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Revenue Intelligence</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-black rounded-full">
                            <Globe className="w-3 h-3" /> Base: {cur}
                        </span>
                        {metrics.generatedAt && (
                            <span className="text-[10px] text-slate-400 font-medium">
                                as of {new Date(metrics.generatedAt).toLocaleTimeString("en-US", { timeStyle: "short" })}
                            </span>
                        )}
                    </div>
                </div>
                <button
                    id="finance-dashboard-refresh"
                    onClick={load}
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                    aria-label="Refresh"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl">
                {TABS.map((t) => (
                    <button
                        key={t.key}
                        id={`finance-tab-${t.key}`}
                        onClick={() => setTab(t.key)}
                        className={`flex-1 py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === t.key
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── Overview tab ────────────────────────────────────────────── */}
            {activeTab === "overview" && (
                <>
                    {/* KPI grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <KpiCard
                            label="MRR"
                            value={fmtCurrency(metrics.MRRBaseCurrency, cur)}
                            sub={`Monthly · ${cur}`}
                            icon={TrendingUp}
                            color="emerald"
                            trend={metrics.MRRTrendPct}
                            trendPoints={trendMRR}
                        />
                        <KpiCard
                            label="ARR"
                            value={fmtCurrency(metrics.ARRBaseCurrency, cur)}
                            sub={`Annual · ${cur}`}
                            icon={BarChart3}
                            color="blue"
                            trend={metrics.ARRTrendPct}
                            trendPoints={trendARR}
                        />
                        <KpiCard
                            label="Recognized"
                            value={fmtCurrency(metrics.totalRecognizedRevenueBaseCurrency, cur)}
                            sub={`Earned to date · ${cur}`}
                            icon={DollarSign}
                            color="violet"
                            trend={metrics.recognizedTrendPct}
                            trendPoints={trendRec}
                        />
                        <KpiCard
                            label="Deferred"
                            value={fmtCurrency(metrics.totalDeferredRevenueBaseCurrency, cur)}
                            sub={`Not yet earned · ${cur}`}
                            icon={TrendingDown}
                            color="slate"
                            trendPoints={trendDef}
                        />
                    </div>

                    {/* Revenue recognition progress */}
                    <RevenueBar
                        recognized={metrics.totalRecognizedRevenueBaseCurrency}
                        deferred={metrics.totalDeferredRevenueBaseCurrency}
                        currency={cur}
                    />

                    {/* Renewal projection */}
                    {metrics.projectedRevenueNext30Days && (
                        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Projected — Next 30 Days
                                </span>
                                <span className="ml-auto text-[10px] font-black text-slate-400 bg-white/10 px-2 py-0.5 rounded-full">
                                    {cur}
                                </span>
                            </div>
                            <div className="flex items-end gap-6">
                                <div>
                                    <h2 className="text-3xl font-black tracking-tight">
                                        {fmtCurrency(metrics.projectedRevenueNext30Days.amount, cur, false)}
                                    </h2>
                                    <p className="text-slate-400 text-xs font-medium mt-1">
                                        {metrics.projectedRevenueNext30Days.contractCount ?? "—"} renewing contracts
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Operational alerts */}
                    <div>
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Operational Snapshot</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <AlertBadge label="Active Contracts" count={metrics.totalActiveContracts} color="blue" />
                            <AlertBadge label="Expiring ≤ 30 Days" count={metrics.expiringNext30Days} color="amber" onClick={() => setTab("expiring")} />
                            <AlertBadge label="In Grace Period" count={metrics.contractsInGrace} color="red" />
                            <AlertBadge label="Suspended (Non-Pay)" count={metrics.suspendedForNonPayment} color="red" />
                        </div>
                    </div>

                    {/* Contract health */}
                    <div>
                        <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Contract Health</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <AlertBadge label="Auto-Renew On" count={metrics.autoRenewEnabledCount} color="blue" />
                            <AlertBadge label="Sales Managed" count={metrics.salesManagedCount} color="amber" onClick={() => setTab("expiring")} />
                            <AlertBadge label="Failed (7 Days)" count={metrics.failedPaymentsLast7Days} color="red" onClick={() => setTab("dunning")} />
                        </div>
                    </div>
                </>
            )}

            {/* ── Expiring tab ─────────────────────────────────────────────── */}
            {activeTab === "expiring" && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <p className="text-xs font-bold text-amber-700">
                            Contracts expiring within 30 days. Review auto-renew settings and ensure renewal invoices are ready.
                        </p>
                    </div>
                    <ExpiringContractsList contracts={expiringList} currency={cur} />
                </div>
            )}

            {/* ── Dunning tab ──────────────────────────────────────────────── */}
            {activeTab === "dunning" && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <p className="text-xs font-bold text-amber-700">
                            Contracts with active payment retry schedules. Suspension occurs when grace expires.
                        </p>
                    </div>
                    <DunningQueue contracts={dunningList} currency={cur} />
                </div>
            )}
        </div>
    );
}
