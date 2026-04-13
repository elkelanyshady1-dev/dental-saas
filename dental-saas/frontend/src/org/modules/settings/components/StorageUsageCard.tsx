import { useState, useEffect } from "react";
import { storageApi } from "@/modules/org/settings/api/storage.api";

/* ═══════════════════════════════════════════════════════════════
   StorageUsageCard — Storage consumption dashboard widget.

   Features:
     - Animated progress bar with gradient (green → amber → red)
     - Used / Total display (auto-formats MB or GB)
     - Percentage badge with color coding
     - Category breakdown (Photos, 3D Models, Audio, Docs)
     - File count per category
     - Last upload timestamp
     - Graceful loading & error states

   API:
     GET /api/v1/org/storage-usage

   PLANE: Organization
   MODULE: settings (per frontend architecture)
   ═══════════════════════════════════════════════════════════════ */

interface StorageBreakdown {
    photos: number;
    stl: number;
    audio: number;
    documents: number;
    other: number;
}

interface StorageUsageData {
    totalBytes: number;
    totalMB: number;
    totalGB: number;
    totalFiles: number;
    maxStorageMB: number;
    percentUsed: number;
    breakdown: StorageBreakdown;
    fileCount: StorageBreakdown;
    lastUploadAt: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format bytes into a human-readable string */
function formatSize(mb: number): string {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${(mb * 1024).toFixed(0)} KB`;
}

function formatBytes(bytes: number): string {
    return formatSize(bytes / (1024 * 1024));
}

/** Get progress bar color based on usage percentage */
function getBarColor(percent: number): string {
    if (percent >= 90) return "from-red-500 to-rose-600";
    if (percent >= 75) return "from-amber-400 to-orange-500";
    if (percent >= 50) return "from-yellow-400 to-amber-500";
    return "from-emerald-400 to-teal-500";
}

function getBadgeColor(percent: number): string {
    if (percent >= 90) return "bg-red-500/15 text-red-400 border-red-500/20";
    if (percent >= 75) return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
}

function getStatusText(percent: number, maxMB: number): string {
    if (maxMB <= 0) return "Unlimited storage";
    if (percent >= 95) return "Storage almost full";
    if (percent >= 75) return "Storage filling up";
    return "Storage healthy";
}

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORIES: { key: keyof StorageBreakdown; label: string; color: string; icon: string }[] = [
    { key: "photos", label: "Photos", color: "bg-blue-500", icon: "📷" },
    { key: "stl", label: "3D Models", color: "bg-purple-500", icon: "🦷" },
    { key: "audio", label: "Audio", color: "bg-amber-500", icon: "🎙️" },
    { key: "documents", label: "Documents", color: "bg-emerald-500", icon: "📄" },
    { key: "other", label: "Other", color: "bg-slate-500", icon: "📦" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function StorageUsageCard() {
    const [data, setData] = useState<StorageUsageData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function fetchUsage() {
            try {
                setLoading(true);
                setError(null);
                const result = await storageApi.getStorageUsage();
                if (!cancelled) setData(result);
            } catch (err: any) {
                if (!cancelled) {
                    setError(err?.response?.data?.message || "Failed to load storage usage");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchUsage();
        return () => { cancelled = true; };
    }, []);

    // ── Loading State ─────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6">
                <div className="flex items-center gap-4 mb-5">
                    <div className="w-10 h-10 bg-slate-800/80 rounded-xl animate-pulse" />
                    <div className="space-y-2 flex-1">
                        <div className="h-4 bg-slate-800/80 rounded-lg w-32 animate-pulse" />
                        <div className="h-3 bg-slate-800/60 rounded-lg w-48 animate-pulse" />
                    </div>
                </div>
                <div className="h-3 bg-slate-800/60 rounded-full animate-pulse mb-3" />
                <div className="flex justify-between">
                    <div className="h-3 bg-slate-800/50 rounded w-20 animate-pulse" />
                    <div className="h-3 bg-slate-800/50 rounded w-16 animate-pulse" />
                </div>
            </div>
        );
    }

    // ── Error State ───────────────────────────────────────────────────────────
    if (error || !data) {
        return (
            <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-red-900/30 p-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center text-red-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-red-400">Storage Usage Unavailable</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{error || "Could not load data"}</p>
                    </div>
                </div>
            </div>
        );
    }

    const isUnlimited = data.maxStorageMB <= 0 || data.maxStorageMB === -1;
    const percent = isUnlimited ? 0 : Math.min(data.percentUsed, 100);
    const totalUsedDisplay = formatSize(data.totalMB);
    const totalLimitDisplay = isUnlimited ? "Unlimited" : formatSize(data.maxStorageMB);
    const hasBreakdown = Object.values(data.breakdown).some((v) => v > 0);

    return (
        <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-6 space-y-5">
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center text-violet-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-slate-100">Storage Usage</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {getStatusText(percent, data.maxStorageMB)}
                        </p>
                    </div>
                </div>

                {/* Percentage badge */}
                {!isUnlimited && (
                    <div className={`px-3 py-1.5 rounded-xl border text-xs font-bold tabular-nums ${getBadgeColor(percent)}`}>
                        {percent.toFixed(1)}%
                    </div>
                )}
            </div>

            {/* ── Progress Bar ─────────────────────────────────────────────── */}
            <div>
                <div className="relative h-3 bg-slate-800 rounded-full overflow-hidden">
                    {!isUnlimited && (
                        <div
                            className={`absolute inset-y-0 left-0 bg-gradient-to-r ${getBarColor(percent)} rounded-full transition-all duration-1000 ease-out`}
                            style={{ width: `${Math.max(percent, 1)}%` }}
                        >
                            {/* Shimmer effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50 animate-shimmer" />
                        </div>
                    )}
                    {isUnlimited && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Unlimited</span>
                        </div>
                    )}
                </div>

                {/* Used / Total labels */}
                <div className="flex justify-between mt-2">
                    <span className="text-xs font-semibold text-slate-300 tabular-nums">
                        {totalUsedDisplay} used
                    </span>
                    <span className="text-xs font-medium text-slate-500 tabular-nums">
                        {totalLimitDisplay}
                    </span>
                </div>
            </div>

            {/* ── File Count ───────────────────────────────────────────────── */}
            <div className="flex items-center gap-5 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-xs text-slate-400">
                        <span className="font-bold text-slate-200">{data.totalFiles.toLocaleString()}</span> total files
                    </span>
                </div>
                {data.lastUploadAt && (
                    <div className="flex items-center gap-2 ml-auto">
                        <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span className="text-[10px] text-slate-600">
                            Last upload: {new Date(data.lastUploadAt).toLocaleDateString()}
                        </span>
                    </div>
                )}
            </div>

            {/* ── Category Breakdown ───────────────────────────────────────── */}
            {hasBreakdown && (
                <div className="space-y-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        Breakdown
                    </span>
                    <div className="grid grid-cols-1 gap-1.5">
                        {CATEGORIES.map((cat) => {
                            const bytes = data.breakdown[cat.key] || 0;
                            const files = data.fileCount[cat.key] || 0;
                            if (bytes === 0 && files === 0) return null;

                            const catPercent = data.totalBytes > 0
                                ? Math.round((bytes / data.totalBytes) * 100)
                                : 0;

                            return (
                                <div
                                    key={cat.key}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] transition-colors"
                                >
                                    <span className="text-sm">{cat.icon}</span>
                                    <span className="text-xs font-semibold text-slate-300 w-20 shrink-0">{cat.label}</span>

                                    {/* Mini bar */}
                                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${cat.color} rounded-full transition-all duration-700`}
                                            style={{ width: `${Math.max(catPercent, 2)}%` }}
                                        />
                                    </div>

                                    <span className="text-[10px] font-medium text-slate-500 tabular-nums w-16 text-right">
                                        {formatBytes(bytes)}
                                    </span>
                                    <span className="text-[10px] text-slate-600 tabular-nums w-12 text-right">
                                        {files} {files === 1 ? "file" : "files"}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Quota Warning ────────────────────────────────────────────── */}
            {!isUnlimited && percent >= 85 && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                    percent >= 95
                        ? "bg-red-500/10 border-red-500/20"
                        : "bg-amber-500/10 border-amber-500/20"
                }`}>
                    <svg className={`w-4 h-4 shrink-0 ${percent >= 95 ? "text-red-400" : "text-amber-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className={`text-xs font-medium ${percent >= 95 ? "text-red-300" : "text-amber-300"}`}>
                        {percent >= 95
                            ? "You're almost out of storage. Upgrade your plan or remove unused files."
                            : "You're approaching your storage limit. Consider reviewing your files."
                        }
                    </p>
                </div>
            )}

            {/* ── Custom Shimmer Keyframe ──────────────────────────────────── */}
            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(200%); }
                }
                .animate-shimmer {
                    animation: shimmer 2s infinite;
                }
            `}</style>
        </div>
    );
}
