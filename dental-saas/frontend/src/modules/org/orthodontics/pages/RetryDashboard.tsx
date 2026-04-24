/**
 * RetryDashboard.tsx — U-CAP Part 3.
 *
 * Org-wide table of assets whose background processing is stuck
 * (pending / processing / failed). Admins can retry individually or
 * hit "Retry all failed" to kick every one back into the queue.
 *
 * Data layer
 *   - `useFailedAssets(statuses)`     — paginated (server-capped at 500)
 *   - `useRetryAllFailed()`           — org-scoped batch
 *   - `useRetrySingleAsset()`         — row-scoped, calls the case-scoped endpoint
 *
 * Auth
 *   Both backend endpoints require "orthodontics.full". The page itself
 *   is mounted inside the org plane so orgProtect + requireEntitlement
 *   cover the guard chain.
 */

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
    RotateCcw,
    RefreshCw,
    AlertTriangle,
    Hourglass,
    Loader2,
    Image as ImageIcon,
    FileText,
    Box,
    Activity,
} from "lucide-react";

import {
    useFailedAssets,
    useRetryAllFailed,
    useRetrySingleAsset,
    type FailedAssetRow,
    type RetryDashboardFilter,
    type FileType,
    type ProcessingStatus,
} from "@/org/modules/patients/components/orthodontic-chart/hooks/usePhotos";

// ─── Filter chips ───────────────────────────────────────────────────────────

const FILTER_CHIPS: Array<{
    key:    "all" | "failed" | "processing" | "pending";
    label:  string;
    match:  RetryDashboardFilter | undefined;
    tone:   string;
    Icon:   React.ComponentType<{ className?: string }>;
}> = [
    { key: "all",        label: "All stuck",   match: undefined,               tone: "bg-slate-100 text-slate-700 hover:bg-slate-200",   Icon: Hourglass       },
    { key: "failed",     label: "Failed",      match: ["failed"],              tone: "bg-rose-50 text-rose-700 hover:bg-rose-100",        Icon: AlertTriangle   },
    { key: "processing", label: "Processing",  match: ["processing"],          tone: "bg-blue-50 text-blue-700 hover:bg-blue-100",        Icon: Loader2         },
    { key: "pending",    label: "Pending",     match: ["pending"],             tone: "bg-amber-50 text-amber-700 hover:bg-amber-100",     Icon: Hourglass       },
];

const FILE_TYPE_ICON: Record<FileType, React.ComponentType<{ className?: string }>> = {
    image: ImageIcon,
    pdf:   FileText,
    "3d":  Box,
    dicom: Activity,
};

const STATUS_STYLE: Record<Exclude<ProcessingStatus, null>, { label: string; className: string }> = {
    pending:    { label: "Pending",    className: "bg-amber-100 text-amber-800"    },
    processing: { label: "Processing", className: "bg-blue-100 text-blue-800"      },
    done:       { label: "Done",       className: "bg-emerald-100 text-emerald-800"},
    failed:     { label: "Failed",     className: "bg-rose-100 text-rose-800"      },
    skipped:    { label: "Skipped",    className: "bg-slate-100 text-slate-700"    },
};

// ─── Page ──────────────────────────────────────────────────────────────────

const RetryDashboard: React.FC = () => {
    const [activeFilter, setActiveFilter] = useState<typeof FILTER_CHIPS[number]["key"]>("all");
    const chip = FILTER_CHIPS.find((c) => c.key === activeFilter) ?? FILTER_CHIPS[0];

    const { data: rows = [], isLoading, isFetching, refetch } = useFailedAssets(chip.match);
    const retryAll    = useRetryAllFailed();
    const retrySingle = useRetrySingleAsset();

    const failedCount = useMemo(() => rows.filter((r) => r.processingStatus === "failed").length, [rows]);

    const handleRetryAll = async () => {
        if (failedCount === 0 || retryAll.isPending) return;
        // eslint-disable-next-line no-alert
        if (!window.confirm(`Retry ${failedCount} failed asset${failedCount === 1 ? "" : "s"}?`)) return;
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

    const handleRetryRow = (row: FailedAssetRow) => {
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
    };

    return (
        <div className="px-6 py-6 max-w-6xl mx-auto">
            {/* Header */}
            <header className="flex items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Asset Recovery</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Retry stuck thumbnails and DICOM parses across the organization.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60 transition-colors"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={handleRetryAll}
                        disabled={retryAll.isPending || failedCount === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50 transition-colors"
                        title={failedCount === 0
                            ? "No failed assets to retry"
                            : `Retry all ${failedCount} failed asset${failedCount === 1 ? "" : "s"}`}
                    >
                        {retryAll.isPending
                            ? <Loader2  className="w-3.5 h-3.5 animate-spin" />
                            : <RotateCcw className="w-3.5 h-3.5" />}
                        Retry all failed ({failedCount})
                    </button>
                </div>
            </header>

            {/* Filter chips */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
                {FILTER_CHIPS.map(({ key, label, tone, Icon }) => {
                    const active = activeFilter === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveFilter(key)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                active
                                    ? "bg-slate-900 text-white shadow-sm"
                                    : tone
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {label}
                        </button>
                    );
                })}
                <span className="text-xs text-slate-400 ml-auto tabular-nums">
                    {rows.length} {rows.length === 1 ? "row" : "rows"}
                </span>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {isLoading ? (
                    <div className="py-16 flex items-center justify-center text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : rows.length === 0 ? (
                    <EmptyState chipLabel={chip.label} />
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            <tr>
                                <th className="px-4 py-2 text-left">Asset</th>
                                <th className="px-4 py-2 text-left">Type</th>
                                <th className="px-4 py-2 text-left">Status</th>
                                <th className="px-4 py-2 text-left">Error</th>
                                <th className="px-4 py-2 text-right">Retries</th>
                                <th className="px-4 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map((row) => (
                                <Row
                                    key={row.id}
                                    row={row}
                                    onRetry={handleRetryRow}
                                    retrying={retrySingle.isPending}
                                />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

// ─── Table row ─────────────────────────────────────────────────────────────

const Row: React.FC<{
    row:        FailedAssetRow;
    onRetry:    (row: FailedAssetRow) => void;
    retrying:   boolean;
}> = ({ row, onRetry, retrying }) => {
    const Icon = row.fileType ? FILE_TYPE_ICON[row.fileType] : FileText;
    const status = row.processingStatus ? STATUS_STYLE[row.processingStatus] : null;
    const canRetry = row.processingStatus === "failed" || row.processingStatus === "pending";

    return (
        <tr className="hover:bg-slate-50 transition-colors">
            <td className="px-4 py-3 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate font-medium text-slate-800">
                        {row.fileName ?? `asset-${row.id.slice(-6)}`}
                    </span>
                </div>
                {row.caseId && (
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                        Case …{row.caseId.slice(-6)}
                    </span>
                )}
            </td>
            <td className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {row.fileType ?? "—"}
            </td>
            <td className="px-4 py-3">
                {status ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.className}`}>
                        {row.processingStatus === "processing" && <Loader2 className="w-3 h-3 animate-spin" />}
                        {status.label}
                        {row.processingStatus === "processing" && row.processingProgress > 0 && (
                            <span className="tabular-nums"> · {row.processingProgress}%</span>
                        )}
                    </span>
                ) : (
                    <span className="text-slate-400 text-xs">—</span>
                )}
            </td>
            <td className="px-4 py-3 max-w-[22rem]">
                {row.processingError ? (
                    <span
                        className="text-[11px] text-rose-700 truncate block"
                        title={row.processingError}
                    >
                        {row.processingError}
                    </span>
                ) : (
                    <span className="text-slate-300 text-xs">—</span>
                )}
            </td>
            <td className="px-4 py-3 text-right tabular-nums text-xs text-slate-500">
                {row.retryCount}
            </td>
            <td className="px-4 py-3 text-right">
                <button
                    type="button"
                    onClick={() => onRetry(row)}
                    disabled={!canRetry || retrying}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={canRetry ? "Retry this asset" : "Only failed or pending rows can be retried"}
                >
                    {retrying
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <RotateCcw className="w-3 h-3" />}
                    Retry
                </button>
            </td>
        </tr>
    );
};

// ─── Empty state ───────────────────────────────────────────────────────────

const EmptyState: React.FC<{ chipLabel: string }> = ({ chipLabel }) => (
    <div className="py-16 flex flex-col items-center justify-center text-slate-400">
        <Hourglass className="w-8 h-8 mb-3 opacity-50" />
        <p className="text-sm font-medium">Nothing stuck right now</p>
        <p className="text-xs mt-1 opacity-80">
            {`No assets match the "${chipLabel}" filter.`}
        </p>
    </div>
);

export default RetryDashboard;
