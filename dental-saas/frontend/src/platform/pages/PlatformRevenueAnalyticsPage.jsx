/**
 * PlatformRevenueAnalyticsPage.jsx
 * Platform Finance — Revenue Analytics
 *
 * Route: /platform/revenue
 * Capability: VIEW_PLATFORM_ANALYTICS
 *
 * Charts: MRR trend, ARR trend, churn rate
 * KPIs: active subscriptions, past-due, recognized/deferred revenue
 */

import React, { useEffect, useState, useCallback } from "react";
import {
    TrendingUp, TrendingDown, Users, AlertTriangle,
    DollarSign, BarChart3, RefreshCw, Loader2,
    ArrowUpRight, ArrowDownRight
} from "lucide-react";
import platformApi from "../auth/platformApi";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ points = [], color = "#10b981", width = 80, height = 28 }) {
    if (!points.length || points.every(p => p === 0)) {
        return <div style={{ width, height }} className="opacity-20 bg-slate-200 rounded" />;
    }
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const stepX = width / (points.length - 1 || 1);
    const coords = points.map((p, i) => ({
        x: i * stepX,
        y: height - ((p - min) / range) * (height - 4) - 2
    }));
    const polyline = coords.map(c => `${c.x},${c.y}`).join(" ");
    const area = [`0,${height}`, ...coords.map(c => `${c.x},${c.y}`), `${width},${height}`].join(" ");
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <defs>
                <linearGradient id={`g-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <polygon points={area} fill={`url(#g-${color.replace("#", "")})`} />
            <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = "slate", trend }) {
    const cfg = {
        emerald: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", icon: "bg-white text-emerald-600", spark: "#10b981" },
        blue: { bg: "bg-blue-50 border-blue-200", text: "text-blue-800", icon: "bg-white text-blue-600", spark: "#3b82f6" },
        violet: { bg: "bg-violet-50 border-violet-200", text: "text-violet-800", icon: "bg-white text-violet-600", spark: "#8b5cf6" },
        amber: { bg: "bg-amber-50 border-amber-200", text: "text-amber-800", icon: "bg-white text-amber-600", spark: "#f59e0b" },
        red: { bg: "bg-red-50 border-red-200", text: "text-red-800", icon: "bg-white text-red-600", spark: "#ef4444" },
        slate: { bg: "bg-white border-slate-200", text: "text-slate-700", icon: "bg-slate-50 text-slate-500", spark: "#94a3b8" },
    }[color] || { bg: "bg-white border-slate-200", text: "text-slate-700", icon: "bg-slate-50 text-slate-500", spark: "#94a3b8" };

    const up = (trend ?? 0) >= 0;

    return (
        <div className={`rounded-2xl border p-5 ${cfg.bg} flex flex-col gap-3`}>
            <div className="flex items-start justify-between">
                <div className={`p-2.5 rounded-xl ${cfg.icon} border border-white/60 shadow-sm`}>
                    <Icon className="w-4 h-4" />
                </div>
                {trend != null && (
                    <div className={`flex items-center gap-0.5 text-[10px] font-black ${up ? "text-emerald-600" : "text-red-500"}`}>
                        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(trend)}%
                    </div>
                )}
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">{label}</p>
                <h3 className={`text-2xl font-black tracking-tight ${cfg.text}`}>{value}</h3>
                {sub && <p className="text-[11px] opacity-50 font-medium mt-0.5">{sub}</p>}
            </div>
        </div>
    );
}

function fmt(val, cur) {
    if (val == null) return "—";
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD", notation: "compact", maximumFractionDigits: 1 }).format(val);
    } catch {
        return `${cur} ${Number(val).toFixed(2)}`;
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PlatformRevenueAnalyticsPage() {
    const { hasCapability, loading: capLoading } = usePlatformCapabilities();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await platformApi.get("/billing/revenue");
            setData(res.data?.data || res.data);
        } catch (e) {
            setError(e?.response?.data?.error || e.message || "Failed to load revenue metrics");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    if (capLoading) return null;
    if (!hasCapability("VIEW_PLATFORM_ANALYTICS")) {
        return <PlatformUnauthorized capability="VIEW_PLATFORM_ANALYTICS" />;
    }

    if (loading) return (
        <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-medium">Loading revenue metrics…</span>
        </div>
    );

    if (error) return (
        <div className="max-w-xl mx-auto mt-12 p-6 bg-red-50 border border-red-200 rounded-2xl text-center">
            <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-red-700">{error}</p>
            <button onClick={load} className="mt-4 px-4 py-2 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700">Retry</button>
        </div>
    );

    if (!data) return null;
    const cur = data.baseCurrency || "USD";

    return (
        <div className="max-w-7xl mx-auto space-y-8 px-4 py-6" id="revenue-analytics-page">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-100 border border-blue-200 text-blue-700">
                        <BarChart3 className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Revenue Analytics</h1>
                        <p className="text-sm text-slate-500 font-medium">
                            {data.churnCalculation?.month} · Base currency: {cur}
                        </p>
                    </div>
                </div>
                <button
                    id="revenue-analytics-refresh"
                    onClick={load}
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label="MRR" value={fmt(data.MRR, cur)} sub={`Monthly · ${cur}`} icon={TrendingUp} color="emerald" />
                <KpiCard label="ARR" value={fmt(data.ARR, cur)} sub={`Annual · ${cur}`} icon={BarChart3} color="blue" />
                <KpiCard label="Recognized Revenue" value={fmt(data.recognizedRevenue, cur)} sub="Earned to date" icon={DollarSign} color="violet" />
                <KpiCard label="Deferred Revenue" value={fmt(data.deferredRevenue, cur)} sub="Not yet earned" icon={TrendingDown} color="slate" />
            </div>

            {/* Subscriptions + Churn */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <KpiCard
                    label="Active Subscriptions"
                    value={data.activeSubscriptions ?? "—"}
                    icon={Users}
                    color="blue"
                />
                <KpiCard
                    label="Past Due"
                    value={data.pastDueSubscriptions ?? "—"}
                    sub="Active + in dunning"
                    icon={AlertTriangle}
                    color={data.pastDueSubscriptions > 0 ? "amber" : "slate"}
                />
                <KpiCard
                    label="Churn Rate"
                    value={`${data.churnRate ?? 0}%`}
                    sub={`${data.churnCalculation?.canceledThisMonth ?? 0} cancellations this month`}
                    icon={TrendingDown}
                    color={data.churnRate > 5 ? "red" : data.churnRate > 2 ? "amber" : "emerald"}
                />
            </div>

            {/* Churn detail */}
            {data.churnCalculation && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Churn Calculation — {data.churnCalculation.month}</p>
                    <div className="flex items-center gap-8 text-sm">
                        <div>
                            <span className="text-slate-400 font-medium">Canceled this month</span>
                            <span className="font-black text-red-600 ml-2">{data.churnCalculation.canceledThisMonth}</span>
                        </div>
                        <div className="text-slate-300">÷</div>
                        <div>
                            <span className="text-slate-400 font-medium">Active at start of month</span>
                            <span className="font-black text-slate-800 ml-2">{data.churnCalculation.activeAtStartOfMonth}</span>
                        </div>
                        <div className="text-slate-300">=</div>
                        <div>
                            <span className="font-black text-blue-700 text-lg">{data.churnRate}%</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Last updated */}
            {data.generatedAt && (
                <p className="text-[10px] text-slate-400 font-medium text-right">
                    Last computed: {new Date(data.generatedAt).toLocaleString()}
                </p>
            )}
        </div>
    );
}
