/**
 * CommunicationDashboardPage.jsx
 * Platform — Dispatcher-era Communication Logs Dashboard
 *
 * Route:      /platform/communication/logs
 * Capability: VIEW_COMMUNICATION_METRICS
 *
 * Sources (all read-only, shared platform DB):
 *   GET /api/platform/communication/logs/summary   — counters + rates
 *   GET /api/platform/communication/logs/stats     — grouped by channel/type/mode
 *   GET /api/platform/communication/logs/recent    — tail of latest N rows
 *   GET /api/platform/communication/logs/failures  — failed + security-failed rows
 *
 * React Query rules (CLAUDE.md §11):
 *   • Registry keys only: COMMUNICATION_QUERY_KEYS — no inline string keys.
 *   • Shared queryClient via PlatformShell — no local instance.
 *   • 15s poll with refetchIntervalInBackground; keepPreviousData avoids flicker.
 *
 * Layout: sticky header + window selector → 4 KPI cards → alerts panel →
 *         charts row (bar by mode / pie by channel) → tabs (recent / failures).
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Zap,
    RefreshCw,
    Activity,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    ShieldAlert,
    TrendingUp,
    Inbox,
    Mail,
    MessageSquare,
    Phone,
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend,
} from "recharts";

import platformApi from "../auth/platformApi";
import {
    PageContainer,
    Card,
    CardHeader,
    StatusBadge,
    AlertBanner,
    LoadingState,
    ErrorState,
    EmptyState,
} from "../core/ui";
import { COMMUNICATION_QUERY_KEYS as CK } from "@/lib/query/communicationQueryKeys";

// ─── Constants ───────────────────────────────────────────────────────────────

const WINDOWS = [
    { label: "1h", hours: 1 },
    { label: "24h", hours: 24 },
    { label: "7d", hours: 24 * 7 },
    { label: "30d", hours: 24 * 30 },
];

const ROW_LIMIT = 50;
const POLL_MS = 15_000;

// Color anchors for status/mode pills — semantic only.
const STATUS_VARIANT = {
    sent: "success",
    queued: "info",
    fallback: "warning",
    failed: "danger",
};

const MODE_COLORS = {
    sync: "#10b981",              // emerald
    qstash: "#3b82f6",            // blue
    "qstash-received": "#1d4ed8", // blue-700
    "fallback-sync": "#f59e0b",   // amber
    "security-failed": "#dc2626", // red
};

const CHANNEL_COLORS = {
    email: "#3b82f6",     // blue
    sms: "#10b981",       // emerald
    whatsapp: "#8b5cf6",  // violet
};

const CHANNEL_ICONS = { email: Mail, sms: MessageSquare, whatsapp: Phone };

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtRelative(iso) {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return new Date(iso).toLocaleString();
}

function fmtDuration(ms) {
    if (ms == null || !Number.isFinite(ms)) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function fmtNumber(n) {
    if (n == null) return "—";
    return Number(n).toLocaleString();
}

function fmtPct(n) {
    if (n == null) return "—";
    return `${Number(n).toFixed(2)}%`;
}

function truncate(str, max = 60) {
    if (!str) return "";
    return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

// ─── Alerts derivation (centralized per Phase B audit) ───────────────────────
// Summary → alert list. Thresholds live here, NOT in JSX.
function deriveAlerts(summary) {
    if (!summary) return [];
    const alerts = [];

    if (summary.failureRatePct != null && summary.failureRatePct > 5) {
        alerts.push({
            variant: "error",
            message: `High failure rate — ${fmtPct(summary.failureRatePct)} (threshold 5%)`,
        });
    }

    if (summary.fallbackRatePct != null && summary.fallbackRatePct > 10) {
        alerts.push({
            variant: "warning",
            message: `Fallback spike — ${fmtPct(summary.fallbackRatePct)} of traffic took degraded path`,
        });
    }

    if (summary.securityFailed > 0) {
        alerts.push({
            variant: "error",
            message: `Security-failed webhook — ${summary.securityFailed} rejection${summary.securityFailed === 1 ? "" : "s"} (signature mismatch)`,
        });
    }

    // Orphan = status="queued" older than 5 min. Non-zero = stuck dispatch,
    // lost async worker, or a QStash delivery gap. Backend computes, we only surface.
    if (summary.orphanCount > 0) {
        alerts.push({
            variant: "warning",
            message: `Orphaned messages — ${summary.orphanCount} stuck in "queued" for >5 min (lost worker or QStash delivery gap)`,
        });
    }

    // Phase 5.1 — CaseLink synchronous-path failures. ANY non-zero count is
    // surfaced because the flow is sub-second and idempotent: a single failure
    // means an appointment was created without its orthodontic case link.
    if (summary.caseLinkFailures > 0) {
        const n = summary.caseLinkFailures;
        alerts.push({
            variant: "error",
            message: `Case linking failures — ${n} appointment${n === 1 ? "" : "s"} created without an orthodontic case link`,
        });
    }

    return alerts;
}

// ─── Data hooks (React Query, factory keys, 15s poll) ────────────────────────

// Base config shared across all four queries. Defaults inherited from the
// shared queryClient, but restated explicitly so this page's polling profile
// is obvious at the callsite (rule 11.6: explicit over implicit).
const BASE_QUERY_OPTS = {
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
    refetchOnReconnect: true,
    retry: 1,
    staleTime: 10_000,
};

function useSummaryQuery(hours) {
    return useQuery({
        ...BASE_QUERY_OPTS,
        queryKey: CK.summary(hours),
        queryFn: () => platformApi.get(`/communication/logs/summary`, { params: { hours } }).then((r) => r.data),
    });
}

function useStatsQuery(hours) {
    return useQuery({
        ...BASE_QUERY_OPTS,
        queryKey: CK.stats(hours),
        queryFn: () => platformApi.get(`/communication/logs/stats`, { params: { hours } }).then((r) => r.data),
    });
}

function useRecentQuery(hours, limit, enabled) {
    return useQuery({
        ...BASE_QUERY_OPTS,
        queryKey: CK.recent(hours, limit),
        queryFn: () => platformApi.get(`/communication/logs/recent`, { params: { hours, limit } }).then((r) => r.data),
        enabled,
        placeholderData: (prev) => prev, // v5 replacement for keepPreviousData
    });
}

function useFailuresQuery(hours, limit, enabled) {
    return useQuery({
        ...BASE_QUERY_OPTS,
        queryKey: CK.failures(hours, limit),
        queryFn: () => platformApi.get(`/communication/logs/failures`, { params: { hours, limit } }).then((r) => r.data),
        enabled,
        placeholderData: (prev) => prev,
    });
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function WindowSelector({ value, onChange }) {
    return (
        <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {WINDOWS.map((w) => {
                const active = w.hours === value;
                return (
                    <button
                        key={w.label}
                        onClick={() => onChange(w.hours)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            active
                                ? "bg-white text-slate-900 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"
                        }`}
                    >
                        {w.label}
                    </button>
                );
            })}
        </div>
    );
}

function AutoRefreshPill({ onManualRefresh, isFetching }) {
    return (
        <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold uppercase tracking-wide border border-emerald-200">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Auto · 15s
            </span>
            <button
                onClick={onManualRefresh}
                className="p-2 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                title="Refresh now"
            >
                <RefreshCw className={`w-4 h-4 text-slate-500 ${isFetching ? "animate-spin" : ""}`} />
            </button>
        </div>
    );
}

function KpiCard({ label, value, context, accent, icon: Icon }) {
    const ACCENTS = {
        default: { border: "border-slate-200", iconBg: "bg-slate-100", iconColor: "text-slate-500" },
        success: { border: "border-emerald-200", iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
        danger: { border: "border-red-200", iconBg: "bg-red-50", iconColor: "text-red-600" },
        warning: { border: "border-amber-200", iconBg: "bg-amber-50", iconColor: "text-amber-600" },
    };
    const a = ACCENTS[accent] || ACCENTS.default;
    return (
        <div className={`bg-white rounded-2xl border ${a.border} p-5 shadow-sm hover:shadow-md transition-shadow`}>
            <div className="flex items-start justify-between mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
                {Icon && (
                    <div className={`p-1.5 rounded-lg ${a.iconBg}`}>
                        <Icon className={`w-4 h-4 ${a.iconColor}`} />
                    </div>
                )}
            </div>
            <p className="text-3xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</p>
            {context && <p className="text-xs text-slate-500 mt-1.5">{context}</p>}
        </div>
    );
}

function AlertsPanel({ alerts, isLoading }) {
    if (isLoading) {
        return (
            <Card>
                <CardHeader title="Active alerts" icon={AlertTriangle} />
                <LoadingState message="Evaluating thresholds…" />
            </Card>
        );
    }
    if (!alerts.length) {
        return (
            <Card>
                <CardHeader
                    title="Active alerts"
                    icon={AlertTriangle}
                    action={<StatusBadge variant="success" label="All clear" dot />}
                />
                <p className="text-sm text-slate-500">
                    No thresholds breached in the current window. Alerts fire at <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">failureRatePct &gt; 5</code>,{" "}
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">fallbackRatePct &gt; 10</code>,{" "}
                    <code className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">securityFailed &gt; 0</code>.
                </p>
            </Card>
        );
    }
    return (
        <Card>
            <CardHeader
                title="Active alerts"
                icon={AlertTriangle}
                action={<StatusBadge variant="danger" label={`${alerts.length} open`} dot />}
            />
            <div className="space-y-2">
                {alerts.map((a, i) => (
                    <AlertBanner key={i} variant={a.variant} message={a.message} />
                ))}
            </div>
        </Card>
    );
}

function ModeBarChart({ byMode }) {
    if (!byMode?.length) {
        return <EmptyState icon={Activity} title="No mode data" description="Nothing delivered in this window yet." />;
    }
    // Sort descending; keep known modes styled with their canonical color.
    const data = [...byMode].sort((a, b) => b.count - a.count);
    return (
        <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis
                    type="category"
                    dataKey="key"
                    stroke="#475569"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={120}
                />
                <RechartsTooltip
                    cursor={{ fill: "#f8fafc" }}
                    contentStyle={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        fontSize: 12,
                        boxShadow: "0 2px 6px rgba(15,23,42,0.08)",
                    }}
                    formatter={(v) => [fmtNumber(v), "Events"]}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {data.map((row) => (
                        <Cell key={row.key} fill={MODE_COLORS[row.key] || "#64748b"} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

function ChannelPieChart({ byChannel }) {
    if (!byChannel?.length) {
        return <EmptyState icon={Inbox} title="No channel data" description="No events in this window." />;
    }
    const data = byChannel.map((r) => ({ name: r.key || "unknown", value: r.count }));
    return (
        <ResponsiveContainer width="100%" height={240}>
            <PieChart>
                <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="#fff"
                >
                    {data.map((entry) => (
                        <Cell key={entry.name} fill={CHANNEL_COLORS[entry.name] || "#94a3b8"} />
                    ))}
                </Pie>
                <RechartsTooltip
                    contentStyle={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        fontSize: 12,
                    }}
                    formatter={(v, n) => [fmtNumber(v), n]}
                />
                <Legend verticalAlign="bottom" height={28} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
        </ResponsiveContainer>
    );
}

function ChannelPill({ channel }) {
    const Icon = CHANNEL_ICONS[channel];
    const COLORS = {
        email: "bg-blue-50 text-blue-700 border-blue-200",
        sms: "bg-emerald-50 text-emerald-700 border-emerald-200",
        whatsapp: "bg-violet-50 text-violet-700 border-violet-200",
    };
    const cls = COLORS[channel] || "bg-slate-100 text-slate-700 border-slate-200";
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wide border ${cls}`}>
            {Icon && <Icon className="w-3 h-3" />}
            {channel || "—"}
        </span>
    );
}

function ModeChip({ mode }) {
    const color = MODE_COLORS[mode];
    return (
        <span
            className="inline-block px-1.5 py-0.5 rounded font-mono text-[10px] border bg-slate-50 text-slate-700 border-slate-200"
            style={color ? { color, borderColor: `${color}40` } : undefined}
        >
            {mode || "—"}
        </span>
    );
}

function LogsTable({ logs, emptyMessage }) {
    if (!logs?.length) {
        return <EmptyState icon={Inbox} title="Nothing to show" description={emptyMessage} />;
    }
    return (
        <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200 text-left sticky top-0 bg-white z-10">
                        <th className="py-2.5 pr-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500">Time</th>
                        <th className="py-2.5 pr-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500">Type</th>
                        <th className="py-2.5 pr-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500">Channel</th>
                        <th className="py-2.5 pr-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500">Status</th>
                        <th className="py-2.5 pr-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500">Mode</th>
                        <th className="py-2.5 pr-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 text-right">Attempts</th>
                        <th className="py-2.5 pr-4 font-semibold text-[11px] uppercase tracking-wider text-slate-500 text-right">Duration</th>
                        <th className="py-2.5 font-semibold text-[11px] uppercase tracking-wider text-slate-500">Error</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map((log) => {
                        const isFailed = log.status === "failed" || log.mode === "security-failed";
                        const isFallback = log.status === "fallback";
                        const rowCls = isFailed
                            ? "bg-red-50/40 hover:bg-red-50/60"
                            : isFallback
                                ? "bg-amber-50/40 hover:bg-amber-50/60"
                                : "hover:bg-slate-50";
                        return (
                            <tr key={log._id} className={`border-b border-slate-100 ${rowCls} transition-colors`}>
                                <td className="py-2.5 pr-4 text-slate-600 tabular-nums whitespace-nowrap">{fmtRelative(log.createdAt)}</td>
                                <td className="py-2.5 pr-4 font-mono text-[12px] text-slate-800 whitespace-nowrap">{log.type || "—"}</td>
                                <td className="py-2.5 pr-4"><ChannelPill channel={log.channel} /></td>
                                <td className="py-2.5 pr-4">
                                    <StatusBadge variant={STATUS_VARIANT[log.status] || "neutral"} label={log.status || "—"} dot />
                                </td>
                                <td className="py-2.5 pr-4"><ModeChip mode={log.mode} /></td>
                                <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{log.attempts ?? "—"}</td>
                                <td className="py-2.5 pr-4 text-right tabular-nums text-slate-700">{fmtDuration(log.durationMs)}</td>
                                <td className="py-2.5 text-[12px] text-red-700 max-w-[320px]">
                                    {log.error ? (
                                        <span title={log.error} className="cursor-help border-b border-dashed border-red-300">
                                            {truncate(log.error, 60)}
                                        </span>
                                    ) : (
                                        <span className="text-slate-400">—</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function CommunicationDashboardPage() {
    const [hours, setHours] = useState(24);
    const [tab, setTab] = useState("recent"); // "recent" | "failures"

    const summaryQ = useSummaryQuery(hours);
    const statsQ = useStatsQuery(hours);
    const recentQ = useRecentQuery(hours, ROW_LIMIT, tab === "recent");
    const failuresQ = useFailuresQuery(hours, ROW_LIMIT, tab === "failures");

    const summary = summaryQ.data;
    const stats = statsQ.data;

    const alerts = useMemo(() => deriveAlerts(summary), [summary]);

    const topError =
        summaryQ.error || statsQ.error || (tab === "recent" ? recentQ.error : failuresQ.error);

    const anyFetching =
        summaryQ.isFetching || statsQ.isFetching || recentQ.isFetching || failuresQ.isFetching;

    const refreshAll = () => {
        summaryQ.refetch();
        statsQ.refetch();
        recentQ.refetch();
        failuresQ.refetch();
    };

    return (
        <PageContainer
            title="Communication Logs"
            subtitle="Dispatcher-era delivery telemetry across sync, QStash async, and fallback paths."
            icon={Zap}
            actions={
                <div className="flex items-center gap-3">
                    <WindowSelector value={hours} onChange={setHours} />
                    <AutoRefreshPill onManualRefresh={refreshAll} isFetching={anyFetching} />
                </div>
            }
        >
            {topError && (
                <ErrorState
                    message={topError?.response?.data?.error || topError?.message || "Failed to load dashboard"}
                    onRetry={refreshAll}
                />
            )}

            {/* ── KPI cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard
                    label="Total events"
                    value={summaryQ.isLoading ? "…" : fmtNumber(summary?.total)}
                    context={`in last ${summary?.windowHours ?? hours}h`}
                    icon={Activity}
                />
                <KpiCard
                    label="Success rate"
                    value={summaryQ.isLoading ? "…" : fmtPct(summary?.successRatePct)}
                    context={`${fmtNumber(summary?.sent)} sent · ${fmtNumber(summary?.fallback)} fallback`}
                    accent="success"
                    icon={CheckCircle2}
                />
                <KpiCard
                    label="Failures"
                    value={
                        summaryQ.isLoading
                            ? "…"
                            : summary?.orphanCount > 0
                                ? `${fmtNumber(summary?.failed)} (Orphan: ${fmtNumber(summary?.orphanCount)})`
                                : fmtNumber(summary?.failed)
                    }
                    context={`${fmtPct(summary?.failureRatePct)} failure rate`}
                    accent={summary?.failed > 0 || summary?.orphanCount > 0 ? "danger" : "default"}
                    icon={XCircle}
                />
                <KpiCard
                    label="Fallbacks"
                    value={summaryQ.isLoading ? "…" : fmtNumber(summary?.fallback)}
                    context={`${fmtPct(summary?.fallbackRatePct)} of traffic · avg ${summary?.avgAttempts ?? "—"} attempts`}
                    accent={summary?.fallback > 0 ? "warning" : "default"}
                    icon={TrendingUp}
                />
                <KpiCard
                    label="Latency (p95)"
                    value={summaryQ.isLoading ? "…" : fmtDuration(summary?.p95DurationMs)}
                    context={`avg ${fmtDuration(summary?.avgDurationMs)} · max ${fmtDuration(summary?.maxDurationMs)}`}
                    icon={Activity}
                />
            </div>

            {/* ── Alerts panel ──────────────────────────────────────────────── */}
            <AlertsPanel alerts={alerts} isLoading={summaryQ.isLoading} />

            {/* ── Charts row ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader
                            title="Messages by mode"
                            subtitle="Transport taxonomy — sync vs QStash vs fallback"
                            icon={Activity}
                        />
                        {statsQ.isLoading ? (
                            <LoadingState message="Loading mode breakdown…" />
                        ) : (
                            <ModeBarChart byMode={stats?.byMode} />
                        )}
                    </Card>
                </div>
                <div>
                    <Card>
                        <CardHeader
                            title="Channel breakdown"
                            subtitle="Email · SMS · WhatsApp"
                            icon={Inbox}
                        />
                        {statsQ.isLoading ? (
                            <LoadingState message="Loading channels…" />
                        ) : (
                            <ChannelPieChart byChannel={stats?.byChannel} />
                        )}
                    </Card>
                </div>
            </div>

            {/* ── Tabs + table ──────────────────────────────────────────────── */}
            <Card padding="none">
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-1">
                        <TabButton
                            active={tab === "recent"}
                            onClick={() => setTab("recent")}
                            icon={Activity}
                            label="Recent activity"
                            count={recentQ.data?.count}
                        />
                        <TabButton
                            active={tab === "failures"}
                            onClick={() => setTab("failures")}
                            icon={ShieldAlert}
                            label="Failures only"
                            count={failuresQ.data?.count}
                        />
                    </div>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                        Showing up to {ROW_LIMIT} rows
                    </span>
                </div>

                <div className="px-6 py-4">
                    {tab === "recent" ? (
                        recentQ.isLoading && !recentQ.data ? (
                            <LoadingState message="Loading recent activity…" />
                        ) : (
                            <LogsTable
                                logs={recentQ.data?.logs}
                                emptyMessage="No events recorded in the current window."
                            />
                        )
                    ) : failuresQ.isLoading && !failuresQ.data ? (
                        <LoadingState message="Loading failures…" />
                    ) : (
                        <LogsTable
                            logs={failuresQ.data?.logs}
                            emptyMessage="No failures in the current window — clean run."
                        />
                    )}
                </div>
            </Card>
        </PageContainer>
    );
}

function TabButton({ active, onClick, icon: Icon, label, count }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                active
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
            }`}
        >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
            {Number.isFinite(count) && (
                <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                        active ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                    }`}
                >
                    {count}
                </span>
            )}
        </button>
    );
}
