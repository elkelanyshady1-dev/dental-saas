/**
 * AdminDashboard.tsx — U-CAP Observability Dashboard (Part 3).
 *
 * Org-wide view of the asset-processing pipeline for admins. Pulls the
 * metrics snapshot every 5 s and renders:
 *   - KPI cards (active, success, failed, avg time, exports)
 *   - Recent activity feed (last 50 events from this node)
 *   - Failed-jobs table (reuses the RetryDashboard's hook)
 *
 * Scope
 *   Process-wide metrics from THIS backend node. Multi-node aggregation
 *   belongs in a real metrics sink; the dashboard is intentionally honest
 *   about what it shows.
 */

import React, { useMemo } from "react";
import {
    Activity,
    AlertTriangle,
    CheckCircle,
    Clock,
    Download,
    Gauge,
    Loader2,
    RefreshCw,
    RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
    useAssetMetrics,
    useFailedAssets,
    useRetryAllFailed,
    useRetrySingleAsset,
    type AssetMetricsActivity,
    type FailedAssetRow,
} from "@/org/modules/patients/components/orthodontic-chart/hooks/usePhotos";

// ─── Page ───────────────────────────────────────────────────────────────────

const AdminDashboard: React.FC = () => {
    const { data: metrics, isLoading: metricsLoading, isFetching: metricsFetching, refetch } = useAssetMetrics();
    const { data: failedRows = [], isLoading: failedLoading }                                = useFailedAssets(["failed"]);
    const retryAll    = useRetryAllFailed();
    const retrySingle = useRetrySingleAsset();

    const counters = metrics?.counters ?? {};
    const computed = metrics?.computed ?? { active_jobs: 0, avg_processing_time: null };

    const failedCount = counters.asset_job_failed ?? 0;
    const successCount = counters.asset_job_success ?? 0;
    const totalJobs    = successCount + failedCount;
    const failureRate  = totalJobs > 0 ? Math.round((failedCount / totalJobs) * 100) : 0;
    const alert = failureRate >= 20 && totalJobs >= 5;

    const handleRetryAll = async () => {
        if (failedRows.length === 0 || retryAll.isPending) return;
        // eslint-disable-next-line no-alert
        if (!window.confirm(`Retry ${failedRows.length} failed asset${failedRows.length === 1 ? "" : "s"}?`)) return;
        try {
            const result = await retryAll.mutateAsync();
            if (result.requeued > 0 && result.failed === 0) {
                toast.success(`Requeued ${result.requeued} asset${result.requeued === 1 ? "" : "s"}`);
            } else if (result.requeued > 0 && result.failed > 0) {
                toast.warning(`Requeued ${result.requeued} · ${result.failed} failed`);
            } else {
                toast.error("Could not requeue any assets");
            }
        } catch (err: any) {
            toast.error(err?.response?.data?.error?.message ?? "Retry-all failed");
        }
    };

    return (
        <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">
            <header className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Asset Pipeline</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Real-time observability for thumbnail processing, DICOM parsing, and case exports.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => refetch()}
                    disabled={metricsFetching}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60 transition-colors"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${metricsFetching ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </header>

            {alert && (
                <div className="flex items-center gap-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-semibold">Elevated failure rate</p>
                        <p className="text-xs text-rose-700">
                            {failureRate}% of the last {totalJobs} jobs failed. Review the activity feed below
                            and retry failed assets from the dashboard.
                        </p>
                    </div>
                </div>
            )}

            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <KPI
                    label="Active jobs"
                    value={metricsLoading ? "…" : String(computed.active_jobs)}
                    Icon={Activity}
                    tone="bg-blue-50 text-blue-700"
                />
                <KPI
                    label="Succeeded"
                    value={metricsLoading ? "…" : String(successCount)}
                    Icon={CheckCircle}
                    tone="bg-emerald-50 text-emerald-700"
                />
                <KPI
                    label="Failed"
                    value={metricsLoading ? "…" : String(failedCount)}
                    Icon={AlertTriangle}
                    tone={failedCount > 0 ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-500"}
                />
                <KPI
                    label="Avg processing"
                    value={computed.avg_processing_time != null ? `${computed.avg_processing_time} ms` : "—"}
                    Icon={Gauge}
                    tone="bg-violet-50 text-violet-700"
                />
                <KPI
                    label="Exports"
                    value={metricsLoading ? "…" : String(
                        (counters.export_success ?? 0) + (counters.export_failed ?? 0),
                    )}
                    Icon={Download}
                    tone="bg-amber-50 text-amber-800"
                    footnote={`${counters.export_success ?? 0} ok · ${counters.export_failed ?? 0} fail`}
                />
            </div>

            {/* Two-column: activity feed + failed table */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ActivityPanel activity={metrics?.activity ?? []} loading={metricsLoading} />
                <FailedPanel
                    rows={failedRows}
                    loading={failedLoading}
                    retryAllPending={retryAll.isPending}
                    retryRowPending={retrySingle.isPending}
                    onRetryAll={handleRetryAll}
                    onRetryRow={(row) => {
                        if (!row.caseId) {
                            toast.error("Asset is not linked to a case — cannot retry");
                            return;
                        }
                        retrySingle.mutate(
                            { caseId: row.caseId, photoId: row.id },
                            {
                                onSuccess: () => toast.success("Retry queued"),
                                onError:   (err: any) => toast.error(err?.response?.data?.error?.message ?? "Retry failed"),
                            },
                        );
                    }}
                />
            </div>
        </div>
    );
};

// ─── Sub-components ─────────────────────────────────────────────────────────

const KPI: React.FC<{
    label:     string;
    value:     string;
    Icon:      React.ComponentType<{ className?: string }>;
    tone:      string;
    footnote?: string;
}> = ({ label, value, Icon, tone, footnote }) => (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
            <span className={`inline-flex w-7 h-7 rounded-lg items-center justify-center ${tone}`}>
                <Icon className="w-3.5 h-3.5" />
            </span>
        </div>
        <p className="mt-1 text-xl font-bold text-slate-900 tabular-nums">{value}</p>
        {footnote && (
            <p className="mt-0.5 text-[11px] text-slate-400">{footnote}</p>
        )}
    </div>
);

const ActivityPanel: React.FC<{
    activity: AssetMetricsActivity[];
    loading:  boolean;
}> = ({ activity, loading }) => (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-900">Recent activity</h2>
            <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
                {activity.length} event{activity.length === 1 ? "" : "s"}
            </span>
        </header>
        <div className="max-h-96 overflow-y-auto">
            {loading ? (
                <div className="py-10 flex items-center justify-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                </div>
            ) : activity.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-400">No activity yet on this node.</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {activity.map((row, i) => (
                        <ActivityRow key={`${row.at}-${i}`} row={row} />
                    ))}
                </ul>
            )}
        </div>
    </section>
);

const ActivityRow: React.FC<{ row: AssetMetricsActivity }> = ({ row }) => {
    const time = useMemo(() => {
        try { return new Date(row.at).toLocaleTimeString(); } catch { return row.at; }
    }, [row.at]);
    const tone =
        row.type.includes("FAILED")   ? "text-rose-700"   :
        row.type.includes("DONE")     ? "text-emerald-700" :
        row.type.includes("SUCCESS")  ? "text-emerald-700" :
        row.type.includes("ABORTED")  ? "text-amber-700"  :
                                        "text-slate-700";
    return (
        <li className="px-4 py-2 flex items-start gap-3 text-xs">
            <span className="w-20 shrink-0 tabular-nums text-slate-400">{time}</span>
            <div className="min-w-0 flex-1">
                <p className={`font-semibold ${tone}`}>{row.type}</p>
                <p className="text-[11px] text-slate-500 truncate">
                    {row.jobType ? `${row.jobType} · ` : ""}
                    {row.caseId ? `case …${row.caseId.slice(-6)}` : ""}
                    {row.photoId ? ` · photo …${row.photoId.slice(-6)}` : ""}
                    {typeof row.durationMs === "number" ? ` · ${row.durationMs} ms` : ""}
                    {typeof row.bytes === "number" ? ` · ${Math.round(row.bytes / 1024 / 1024)} MB` : ""}
                    {typeof row.count === "number" ? ` · ${row.count} asset${row.count === 1 ? "" : "s"}` : ""}
                    {row.error ? ` · ${row.error}` : ""}
                </p>
            </div>
        </li>
    );
};

const FailedPanel: React.FC<{
    rows:             FailedAssetRow[];
    loading:          boolean;
    retryAllPending:  boolean;
    retryRowPending:  boolean;
    onRetryAll:       () => void;
    onRetryRow:       (row: FailedAssetRow) => void;
}> = ({ rows, loading, retryAllPending, retryRowPending, onRetryAll, onRetryRow }) => (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <h2 className="text-sm font-bold text-slate-900">Failed jobs</h2>
            <button
                type="button"
                onClick={onRetryAll}
                disabled={retryAllPending || rows.length === 0}
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
                {retryAllPending
                    ? <Loader2  className="w-3 h-3 animate-spin" />
                    : <RotateCcw className="w-3 h-3" />}
                Retry all ({rows.length})
            </button>
        </header>
        <div className="max-h-96 overflow-y-auto">
            {loading ? (
                <div className="py-10 flex items-center justify-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                </div>
            ) : rows.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-400">No failed jobs right now. 🎉</p>
            ) : (
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        <tr>
                            <th className="px-3 py-2 text-left">Asset</th>
                            <th className="px-3 py-2 text-left">Error</th>
                            <th className="px-3 py-2 text-right">Retries</th>
                            <th className="px-3 py-2 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map((row) => (
                            <tr key={row.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 min-w-0">
                                    <p className="truncate font-medium text-slate-800">
                                        {row.fileName ?? `asset-${row.id.slice(-6)}`}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                        {row.fileType ?? "—"}
                                        {row.caseId ? ` · case …${row.caseId.slice(-6)}` : ""}
                                    </p>
                                </td>
                                <td className="px-3 py-2 max-w-[14rem]">
                                    <span className="text-rose-700 truncate block" title={row.processingError ?? ""}>
                                        {row.processingError ?? "—"}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                                    {row.retryCount}
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <button
                                        type="button"
                                        onClick={() => onRetryRow(row)}
                                        disabled={retryRowPending}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                                    >
                                        {retryRowPending
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : <RotateCcw className="w-3 h-3" />}
                                        Retry
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    </section>
);

export default AdminDashboard;
