/**
 * EventQueueDashboard.jsx
 * Platform Monitoring — EventOutbox Queue Dashboard
 *
 * Displays:
 *   - BullMQ delivery layer counts: Waiting, Active, Completed, Failed, Delayed
 *   - MongoDB outbox durability counts: Pending, Processing, Processed, Failed
 *   - Failed jobs table (Event ID, Org, Error, Attempts, Time)
 *
 * Auto-refreshes queue health every 5 seconds and failed jobs every 10 seconds.
 * Capability guard: VIEW_COMMUNICATION_METRICS (enforced at route level).
 *
 * PLANE: Platform
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Clock,
    Zap,
    CheckCircle2,
    XCircle,
    Timer,
    Database,
    Loader2,
    RefreshCw,
    AlertTriangle,
    Activity
} from "lucide-react";
import platformApi from "@/platform/auth/platformApi";
import { MetricCard } from "../guardian/components/MetricCard";

// ─── Query Keys ───────────────────────────────────────────────────────────────

const QUEUE_HEALTH_QK = ["platform", "monitoring", "queue-health"];
const OUTBOX_FAILED_QK = ["platform", "monitoring", "outbox-failed"];

// ─── API ──────────────────────────────────────────────────────────────────────

const fetchQueueHealth = () =>
    platformApi.get("/monitoring/queue-health").then((r) => r.data);

const fetchOutboxFailed = (limit) =>
    platformApi.get("/monitoring/outbox-failed", { params: { limit } }).then((r) => r.data);

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

function truncate(str, n = 24) {
    if (!str) return "—";
    return str.length > n ? str.slice(0, n) + "…" : str;
}

function StatusBadge({ mode }) {
    const isPolling = mode === "polling";
    return (
        <span className={`
            inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider
            ${isPolling
                ? "bg-amber-900/40 text-amber-400 border border-amber-700/40"
                : "bg-emerald-900/40 text-emerald-400 border border-emerald-700/40"
            }
        `}>
            <span className={`w-1.5 h-1.5 rounded-full ${isPolling ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} />
            {mode ?? "unknown"}
        </span>
    );
}

function SectionHeader({ title, icon: Icon }) {
    return (
        <div className="flex items-center gap-2 mb-3">
            <Icon className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</span>
        </div>
    );
}

// ─── BullMQ Cards ─────────────────────────────────────────────────────────────

function BullMQPanel({ counts, isPaused, isLoading }) {
    const c = counts ?? {};
    return (
        <div>
            <SectionHeader title="BullMQ Delivery Layer" icon={Zap} />
            {isLoading ? (
                <div className="grid grid-cols-5 gap-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5 h-24 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <MetricCard
                        title="Waiting"
                        value={c.waiting ?? 0}
                        icon={<Clock className="w-4 h-4" />}
                        danger={(c.waiting ?? 0) > 500}
                    />
                    <MetricCard
                        title="Active"
                        value={c.active ?? 0}
                        icon={<Loader2 className="w-4 h-4" />}
                    />
                    <MetricCard
                        title="Completed"
                        value={c.completed ?? 0}
                        icon={<CheckCircle2 className="w-4 h-4" />}
                    />
                    <MetricCard
                        title="Failed"
                        value={c.failed ?? 0}
                        icon={<XCircle className="w-4 h-4" />}
                        danger={(c.failed ?? 0) > 0}
                    />
                    <MetricCard
                        title="Delayed"
                        value={c.delayed ?? 0}
                        icon={<Timer className="w-4 h-4" />}
                    />
                </div>
            )}
            {isPaused && (
                <div className="mt-3 flex items-center gap-2 text-amber-400 text-xs font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    Queue is currently paused
                </div>
            )}
        </div>
    );
}

// ─── MongoDB Outbox Cards ─────────────────────────────────────────────────────

function MongoPanel({ mongo, isLoading }) {
    const m = mongo ?? {};
    return (
        <div>
            <SectionHeader title="MongoDB Outbox (Source of Truth)" icon={Database} />
            {isLoading ? (
                <div className="grid grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-slate-700/50 bg-slate-800/60 p-5 h-24 animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MetricCard
                        title="Pending"
                        value={m.pending ?? 0}
                        icon={<Clock className="w-4 h-4" />}
                        danger={(m.pending ?? 0) > 1000}
                    />
                    <MetricCard
                        title="Processing"
                        value={m.processing ?? 0}
                        icon={<Loader2 className="w-4 h-4" />}
                        danger={(m.processing ?? 0) > 200}
                    />
                    <MetricCard
                        title="Processed"
                        value={m.processed ?? 0}
                        icon={<CheckCircle2 className="w-4 h-4" />}
                    />
                    <MetricCard
                        title="Failed (DLQ)"
                        value={m.failed ?? 0}
                        icon={<XCircle className="w-4 h-4" />}
                        danger={(m.failed ?? 0) > 0}
                    />
                </div>
            )}
            {m.dbCount != null && (
                <p className="mt-2 text-[10px] text-slate-500">
                    Aggregated across <span className="font-semibold text-slate-400">{m.dbCount}</span> database(s)
                </p>
            )}
        </div>
    );
}

// ─── Failed Jobs Table ────────────────────────────────────────────────────────

function FailedJobsTable({ jobs, isLoading }) {
    if (isLoading) {
        return (
            <div className="py-8 text-center text-slate-500 text-sm animate-pulse">
                Loading failed jobs…
            </div>
        );
    }

    if (!jobs || jobs.length === 0) {
        return (
            <div className="rounded-xl border border-slate-700/50 py-10 text-center text-slate-500 text-sm">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500/60" />
                No failed jobs — queue is healthy
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider">
                    <tr>
                        <th className="px-4 py-3">Event ID</th>
                        <th className="px-4 py-3">Org</th>
                        <th className="px-4 py-3">Error</th>
                        <th className="px-4 py-3 text-right">Attempts</th>
                        <th className="px-4 py-3 text-right">Time</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                    {jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-3 font-mono text-[11px] text-slate-300">
                                {truncate(job.id, 20)}
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-[11px]">
                                {job.orgId ? truncate(job.orgId, 16) : (
                                    <span className="text-slate-600 italic">platform</span>
                                )}
                            </td>
                            <td className="px-4 py-3 text-red-400 text-[11px] max-w-xs truncate">
                                {job.failedReason || "unknown"}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                                {job.attemptsMade ?? "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500 text-[11px] whitespace-nowrap">
                                {formatTime(job.timestamp)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function EventQueueDashboard() {
    const [failedLimit, setFailedLimit] = useState(50);

    const {
        data: healthData,
        isLoading: healthLoading,
        isFetching: healthFetching,
        dataUpdatedAt: healthUpdatedAt,
        error: healthError,
    } = useQuery({
        queryKey: QUEUE_HEALTH_QK,
        queryFn: fetchQueueHealth,
        refetchInterval: 5_000,
        staleTime: 4_000,
        gcTime: 60_000,
        refetchOnWindowFocus: false,
    });

    const {
        data: failedData,
        isLoading: failedLoading,
    } = useQuery({
        queryKey: [...OUTBOX_FAILED_QK, failedLimit],
        queryFn: () => fetchOutboxFailed(failedLimit),
        refetchInterval: 10_000,
        staleTime: 9_000,
        gcTime: 60_000,
        refetchOnWindowFocus: false,
    });

    const outboxQueue = healthData?.data?.queues?.eventOutbox ?? null;
    const outboxMongo = healthData?.data?.outboxMongo ?? null;
    const mode = outboxQueue?.mode ?? null;
    const counts = outboxQueue?.counts ?? null;
    const isPaused = outboxQueue?.isPaused ?? false;
    const jobs = failedData?.jobs ?? [];

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <Activity className="w-5 h-5 text-slate-400" />
                        <h1 className="text-xl font-bold text-white tracking-tight">
                            Event Queue
                        </h1>
                        {mode && <StatusBadge mode={mode} />}
                    </div>
                    <p className="text-sm text-slate-500 ml-8">
                        Real-time EventOutbox delivery layer health
                    </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    {healthFetching && !healthLoading && (
                        <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                    )}
                    {healthUpdatedAt > 0 && (
                        <span className="text-[10px] text-slate-500 font-mono">
                            Updated: {new Date(healthUpdatedAt).toLocaleTimeString()}
                        </span>
                    )}
                </div>
            </div>

            {/* Error */}
            {healthError && (
                <div className="rounded-xl border border-red-700/40 bg-red-950/30 px-4 py-3 flex items-center gap-2 text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Failed to load queue health: {healthError.message}
                </div>
            )}

            {/* BullMQ Panel */}
            <BullMQPanel
                counts={counts}
                isPaused={isPaused}
                isLoading={healthLoading}
            />

            {/* MongoDB Panel */}
            <MongoPanel mongo={outboxMongo} isLoading={healthLoading} />

            {/* Failed Jobs Table */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <SectionHeader title="Failed BullMQ Jobs" icon={XCircle} />
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] text-slate-500 uppercase tracking-wider">Limit</label>
                        <select
                            value={failedLimit}
                            onChange={(e) => setFailedLimit(Number(e.target.value))}
                            className="bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        >
                            {[25, 50, 100, 200].map((n) => (
                                <option key={n} value={n}>{n}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <FailedJobsTable jobs={jobs} isLoading={failedLoading} />
            </div>
        </div>
    );
}
