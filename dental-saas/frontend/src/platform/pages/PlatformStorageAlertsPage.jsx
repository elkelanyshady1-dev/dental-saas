/**
 * PlatformStorageAlertsPage.jsx
 * Platform — Storage Quota Monitoring Dashboard
 *
 * Shows all organizations' storage usage with alertLevel filtering.
 *
 * Route: /platform/storage (register in platform router)
 * Capability gate: VIEW_ORGANIZATIONS
 * Plane: Platform
 */

import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardDrive, AlertTriangle, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";
import platformApi from "../auth/platformApi";
import { QK } from "@/lib/query/queryKeys";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMB(mb) {
    if (mb < 0) return "Unlimited";
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
}

function AlertPill({ level }) {
    if (level === "critical") {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                <AlertCircle className="w-3 h-3" /> Critical
            </span>
        );
    }
    if (level === "warning") {
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-3 h-3" /> Warning
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> OK
        </span>
    );
}

function UsageBar({ percent, isUnlimited }) {
    if (isUnlimited) {
        return <span className="text-xs text-slate-400">Unlimited</span>;
    }
    const color = percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-emerald-500";
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden" style={{ minWidth: "80px" }}>
                <div
                    className={`h-full ${color} rounded-full transition-all`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                />
            </div>
            <span className="text-xs text-slate-600 tabular-nums w-10 text-right">
                {Math.round(percent)}%
            </span>
        </div>
    );
}

// ─── useStorageOverview ────────────────────────────────────────────────────────

function useStorageOverview(filters) {
    return useQuery({
        queryKey: QK.platform.storage.overview(filters),
        queryFn:  async () => {
            const params = {};
            if (filters.level !== "all") params.level = filters.level;
            if (filters.limit) params.limit = filters.limit;
            if (filters.cursor) params.cursor = filters.cursor;
            const res = await platformApi.get("/storage/overview", { params });
            return res.data?.data || { organizations: [], nextCursor: null };
        },
        staleTime: 30_000,
        refetchOnWindowFocus: true,
    });
}

// ─── Filter Chips ─────────────────────────────────────────────────────────────

const FILTER_CHIPS = [
    { value: "all",      label: "All" },
    { value: "warning",  label: "Warning ≥80%" },
    { value: "critical", label: "Critical ≥100%" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlatformStorageAlertsPage() {
    const { hasCapability, loading: capsLoading } = usePlatformCapabilities();
    const [level, setLevel] = useState("all");

    const queryClient = useQueryClient();
    const { data, isLoading, isError } = useStorageOverview({ level, limit: 100 });

    if (capsLoading) return null;
    if (!hasCapability("VIEW_ORGANIZATIONS")) {
        return <PlatformUnauthorized capability="VIEW_ORGANIZATIONS" />;
    }

    const orgs = data?.organizations || [];

    return (
        <div className="max-w-7xl mx-auto space-y-6 px-4 py-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-100 border border-indigo-200 text-indigo-700">
                        <HardDrive className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Storage Monitoring</h1>
                        <p className="text-sm text-slate-500 font-medium">Organization storage usage and quota alerts</p>
                    </div>
                </div>
                <button
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["storage-overview"] })}
                    className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                >
                    Refresh
                </button>
            </div>

            {/* Filter chips */}
            <div className="flex items-center gap-2">
                {FILTER_CHIPS.map((chip) => (
                    <button
                        key={chip.value}
                        onClick={() => setLevel(chip.value)}
                        className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all ${
                            level === chip.value
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200"
                                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
                        }`}
                    >
                        {chip.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : isError ? (
                    <div className="flex items-center justify-center py-16 text-rose-500 gap-2">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Failed to load storage overview</span>
                    </div>
                ) : orgs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                        <p className="text-sm font-medium">
                            {level === "all" ? "No organizations found" : `No ${level} alerts`}
                        </p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/60">
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Organization</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Used</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-48">Usage</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Limit</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Last Alert</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {orgs.map((org) => (
                                <tr key={org.organizationId} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-5 py-3">
                                        <span className="font-semibold text-slate-800 font-mono text-xs">
                                            {org.organizationId}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 tabular-nums text-slate-700 text-xs">
                                        {formatMB(org.usedMB)}
                                    </td>
                                    <td className="px-5 py-3">
                                        <UsageBar percent={org.percentUsed} isUnlimited={org.isUnlimited} />
                                    </td>
                                    <td className="px-5 py-3 tabular-nums text-slate-500 text-xs">
                                        {formatMB(org.maxStorageMB)}
                                    </td>
                                    <td className="px-5 py-3">
                                        <AlertPill level={org.alertLevel} />
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-400">
                                        {org.lastAlertAt
                                            ? new Date(org.lastAlertAt).toLocaleString()
                                            : "—"
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {data?.nextCursor && (
                <p className="text-xs text-slate-400 text-center">
                    Showing first 100 results. Cursor pagination available via API.
                </p>
            )}
        </div>
    );
}
