/**
 * ObservabilityDashboard.jsx
 * Platform Billing Observability — Admin Dashboard
 *
 * Displays:
 *   - Rolling-window metric cards (Checkouts / Failures / FX Usage / Quota Alerts)
 *   - Recent events feed (sanitized payloads)
 *
 * Architecture (per CLAUDE.md v1.0):
 *   - ALL server state via `useQuery` (no useState + axios + useEffect)
 *   - Query keys from centralized `QK.platform.observability.*`
 *   - No manual refetch() — window toggle drives new keys → auto refetch
 *   - Shared queryClient (no local new QueryClient())
 *   - Capability guard `VIEW_BILLING_OBSERVABILITY` enforced at route level
 *
 * PLANE: Platform
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CreditCard, DollarSign, HardDrive, Loader2 } from "lucide-react";
import { QK } from "@/lib/query/queryKeys";
import { observabilityService } from "../services/observabilityService";

// ─── Constants ────────────────────────────────────────────────────────────────

const WINDOW_OPTIONS = [
    { label: "24h", value: 24 },
    { label: "7d",  value: 24 * 7 },
    { label: "30d", value: 24 * 30 },
];

const SEVERITY_STYLES = {
    INFO:  "bg-blue-500/10 text-blue-300 border border-blue-500/30",
    WARN:  "bg-amber-500/10 text-amber-300 border border-amber-500/30",
    ERROR: "bg-red-500/10 text-red-300 border border-red-500/30",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function MetricCard({ title, value, icon: Icon, tone = "neutral" }) {
    const toneClass = {
        neutral: "text-slate-200",
        danger:  "text-red-300",
        warn:    "text-amber-300",
        success: "text-emerald-300",
    }[tone];

    return (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                    {title}
                </span>
                <Icon className="w-4 h-4 text-slate-500" />
            </div>
            <div className={`mt-3 text-3xl font-black tabular-nums ${toneClass}`}>{value}</div>
        </div>
    );
}

function WindowToggle({ value, onChange }) {
    return (
        <div className="inline-flex rounded-lg bg-slate-900/80 border border-slate-800 p-1">
            {WINDOW_OPTIONS.map((opt) => {
                const active = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${
                            active
                                ? "bg-blue-600 text-white shadow"
                                : "text-slate-400 hover:text-white"
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}

function EventRow({ event }) {
    const tone = SEVERITY_STYLES[event.severity] || SEVERITY_STYLES.INFO;
    return (
        <li className="flex items-start gap-3 border border-slate-800 rounded-lg p-3 bg-slate-900/40">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${tone}`}>
                {event.severity}
            </span>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-slate-200 truncate">{event.eventName}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">{formatTime(event.createdAt)}</span>
                </div>
                {event.payload && Object.keys(event.payload).length > 0 && (
                    <pre className="mt-1 text-[11px] text-slate-400 font-mono overflow-x-auto">
                        {JSON.stringify(event.payload)}
                    </pre>
                )}
            </div>
        </li>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ObservabilityDashboard() {
    const [windowHours, setWindowHours] = useState(24);

    const dashboardQuery = useQuery({
        queryKey: QK.platform.observability.dashboard(windowHours),
        queryFn: () => observabilityService.getDashboard(windowHours),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
    });

    const feedQuery = useQuery({
        queryKey: QK.platform.observability.feed(50),
        queryFn: () => observabilityService.getFeed(50),
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
    });

    const metrics = dashboardQuery.data?.data;
    const events  = feedQuery.data?.data ?? [];

    return (
        <div className="p-6 space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Billing Observability</h1>
                    <p className="text-xs text-slate-400 mt-1">
                        Rolling-window telemetry for pricing, FX, checkout, and storage-quota events.
                    </p>
                </div>
                <WindowToggle value={windowHours} onChange={setWindowHours} />
            </header>

            {/* Metrics */}
            {dashboardQuery.isLoading && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading metrics…
                </div>
            )}
            {dashboardQuery.isError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4 text-red-300 text-sm">
                    Failed to load metrics: {dashboardQuery.error?.message || "unknown error"}
                </div>
            )}
            {metrics && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard title="Checkouts"    value={metrics.checkouts}   icon={CreditCard} />
                    <MetricCard title="Failures"     value={metrics.failures}    icon={AlertTriangle} tone="danger" />
                    <MetricCard title="FX Usage"     value={metrics.fxUsage}     icon={DollarSign} />
                    <MetricCard title="Quota Alerts" value={metrics.quotaEvents} icon={HardDrive}  tone="warn" />
                </div>
            )}

            {/* Feed */}
            <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-400" />
                        Recent Events
                    </h2>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        latest {events.length}
                    </span>
                </div>

                {feedQuery.isLoading && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading feed…
                    </div>
                )}
                {feedQuery.isError && (
                    <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-red-300 text-sm">
                        Failed to load feed: {feedQuery.error?.message || "unknown error"}
                    </div>
                )}
                {!feedQuery.isLoading && !feedQuery.isError && events.length === 0 && (
                    <p className="text-sm text-slate-500">No events recorded yet.</p>
                )}
                {events.length > 0 && (
                    <ul className="space-y-2">
                        {events.map((e) => (
                            <EventRow key={e._id} event={e} />
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
