/**
 * ExportJobsTable.tsx — Data export jobs table for the Storage Settings page.
 *
 * Features:
 *   - List of export jobs (status, modules, size, created date)
 *   - Auto-refresh while jobs are pending/processing (via useExportJobs)
 *   - Download button for completed jobs (fetches signed URL on demand)
 *   - Trigger new export with module selection
 *   - Graceful loading, error, and empty states
 *
 * PLANE: Organization
 */

import { useState } from "react";
import {
    useExportJobs,
    useRequestExport,
    useExportDownloadUrl,
    type ExportJob,
} from "@/modules/org/settings/hooks/useStorage";

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ExportJob["status"], { label: string; classes: string }> = {
    pending:    { label: "Queued",     classes: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
    processing: { label: "Building",   classes: "bg-blue-500/20 text-blue-400 border-blue-500/30 animate-pulse" },
    completed:  { label: "Ready",      classes: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    failed:     { label: "Failed",     classes: "bg-red-500/20 text-red-400 border-red-500/30" },
    expired:    { label: "Expired",    classes: "bg-slate-600/20 text-slate-500 border-slate-600/30" },
};

function StatusBadge({ status }: { status: ExportJob["status"] }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${cfg.classes}`}>
            {status === "processing" && (
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full inline-block" />
            )}
            {cfg.label}
        </span>
    );
}

// ─── Download Button ──────────────────────────────────────────────────────────

function DownloadButton({ job }: { job: ExportJob }) {
    const [enabled, setEnabled] = useState(false);
    const { data, isLoading, isError } = useExportDownloadUrl(job._id, enabled);

    // When URL is ready, trigger download
    if (data?.url && enabled) {
        window.open(data.url, "_blank", "noopener,noreferrer");
        setEnabled(false); // reset so user can click again
    }

    if (job.status !== "completed") return null;
    if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
        return <span className="text-[10px] text-slate-600">Expired</span>;
    }

    return (
        <button
            onClick={() => setEnabled(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {isLoading ? (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            )}
            {isError ? "Retry" : "Download"}
        </button>
    );
}

// ─── Request Export Dialog ────────────────────────────────────────────────────

const ALL_MODULES = ["patients", "appointments", "orthodontics", "billing", "inventory"];

function RequestExportButton() {
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);

    const { mutate, isPending, isError } = useRequestExport();

    function handleSubmit() {
        mutate(
            { modules: selected, format: "json" },
            { onSuccess: () => { setOpen(false); setSelected([]); } }
        );
    }

    function toggleModule(mod: string) {
        setSelected((prev) =>
            prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
        );
    }

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm font-semibold hover:bg-violet-500/20 transition-colors"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Export Data
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md mx-4 rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-bold text-slate-100">Export Organization Data</h3>
                            <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <p className="text-sm text-slate-400">
                            Select the data modules to include. Leave all unselected to export everything.
                        </p>

                        <div className="space-y-2">
                            {ALL_MODULES.map((mod) => (
                                <label
                                    key={mod}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-white/[0.03] transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-600 bg-slate-800 text-violet-500"
                                        checked={selected.includes(mod)}
                                        onChange={() => toggleModule(mod)}
                                    />
                                    <span className="text-sm font-medium text-slate-300 capitalize">{mod}</span>
                                </label>
                            ))}
                        </div>

                        {isError && (
                            <p className="text-xs text-red-400">Failed to start export. Please try again.</p>
                        )}

                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={() => setOpen(false)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold hover:bg-slate-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={isPending}
                                className="flex-1 py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 text-sm font-semibold hover:bg-violet-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isPending ? "Starting…" : "Start Export"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
    if (!bytes) return "—";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
}

function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExportJobsTable() {
    const { data, isLoading, isError } = useExportJobs();

    return (
        <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-base font-bold text-slate-100">Data Exports</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Export your organization data as JSON. Archives expire after 72 hours.
                    </p>
                </div>
                <RequestExportButton />
            </div>

            {/* Table */}
            {isLoading && (
                <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-slate-800/40 rounded-xl animate-pulse" />
                    ))}
                </div>
            )}

            {isError && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-xs text-red-300">Failed to load export jobs.</p>
                </div>
            )}

            {!isLoading && !isError && (!data?.jobs || data.jobs.length === 0) && (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center mb-3 text-slate-500">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-400">No exports yet</p>
                    <p className="text-xs text-slate-600 mt-1">Click "Export Data" to create your first export.</p>
                </div>
            )}

            {!isLoading && !isError && data?.jobs && data.jobs.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-slate-800">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-800 bg-slate-800/40">
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Modules</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Records</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Size</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Created</th>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                            {data.jobs.map((job) => (
                                <tr key={job._id} className="hover:bg-white/[0.015] transition-colors">
                                    <td className="px-4 py-3">
                                        <StatusBadge status={job.status} />
                                    </td>
                                    <td className="px-4 py-3 text-slate-400">
                                        {job.modules.length === 0
                                            ? <span className="text-slate-500">All modules</span>
                                            : job.modules.map((m) => (
                                                <span key={m} className="capitalize">{m}</span>
                                            )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ", ", el], [] as React.ReactNode[])
                                        }
                                    </td>
                                    <td className="px-4 py-3 tabular-nums text-slate-400">
                                        {job.summary?.totalRecords != null
                                            ? job.summary.totalRecords.toLocaleString()
                                            : "—"
                                        }
                                    </td>
                                    <td className="px-4 py-3 tabular-nums text-slate-400">
                                        {formatBytes(job.archiveSizeBytes)}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500">
                                        {formatDate(job.createdAt)}
                                    </td>
                                    <td className="px-4 py-3">
                                        {job.status === "failed" && job.errorMessage && (
                                            <span className="text-[10px] text-red-400 truncate max-w-[150px] block" title={job.errorMessage}>
                                                {job.errorMessage}
                                            </span>
                                        )}
                                        <DownloadButton job={job} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
