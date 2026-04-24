/**
 * OptimizationDashboardPage.jsx — Cost Optimization Engine Admin
 *
 * Mounted at /platform/optimization via PLATFORM_FEATURES registry.
 * Required capability: MANAGE_ORGANIZATIONS.
 *
 * Backend contract: backend/src/routes/platform/optimization.routes.js
 *   GET  /api/platform/optimization/report       — latest rec per org
 *   GET  /api/platform/optimization/scheduler    — scheduler status
 *   POST /api/platform/optimization/run          — force a sweep
 *   POST /api/platform/optimization/execute/:id  — act on a recommendation
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
    DollarSign, RefreshCw, Play, AlertTriangle, Activity,
    ArrowRightLeft, Archive, ArrowDownToLine, CheckCircle2, MinusCircle,
} from "lucide-react";
import platformApi from "../../auth/platformApi";

const ACTION_BADGE = {
    MOVE:            "bg-amber-100 text-amber-700",
    DOWNGRADE:       "bg-sky-100 text-sky-700",
    ARCHIVE:         "bg-slate-200 text-slate-700",
    ARCHIVE_PARTIAL: "bg-slate-100 text-slate-600",
    KEEP:            "bg-emerald-100 text-emerald-700",
};

const STATUS_BADGE = {
    PENDING:   "bg-slate-100 text-slate-600",
    EXECUTING: "bg-blue-100 text-blue-700",
    EXECUTED:  "bg-emerald-100 text-emerald-700",
    FAILED:    "bg-rose-100 text-rose-700",
    SKIPPED:   "bg-slate-100 text-slate-500",
};

const RISK_BADGE = {
    LOW:    "text-emerald-600",
    MEDIUM: "text-amber-600",
    HIGH:   "text-rose-600",
};

const ACTION_ICON = {
    MOVE:            ArrowRightLeft,
    DOWNGRADE:       ArrowDownToLine,
    ARCHIVE:         Archive,
    ARCHIVE_PARTIAL: Archive,
    KEEP:            MinusCircle,
};

function ActionBadge({ action }) {
    const Icon = ACTION_ICON[action] || MinusCircle;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${ACTION_BADGE[action] || "bg-slate-100"}`}>
            <Icon className="w-3 h-3" />
            {action}
        </span>
    );
}

function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[status] || "bg-slate-100"}`}>
            {status}
        </span>
    );
}

function fmtMB(mb) {
    if (mb == null) return "—";
    if (mb < 1024) return `${mb} MB`;
    return `${(mb / 1024).toFixed(1)} GB`;
}

function fmtRelative(date) {
    if (!date) return "never";
    const ms = Date.now() - new Date(date).getTime();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    if (days <= 0) return "today";
    if (days === 1) return "1 day ago";
    if (days < 30) return `${days} days ago`;
    const months = Math.floor(days / 30);
    if (months === 1) return "1 month ago";
    return `${months} months ago`;
}

export default function OptimizationDashboardPage() {
    const [report, setReport] = useState([]);
    const [scheduler, setScheduler] = useState(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [busyOrg, setBusyOrg] = useState(null);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        try {
            const params = statusFilter !== "ALL" ? { status: statusFilter } : {};
            const { data } = await platformApi.get("/optimization/report", { params });
            setReport(data?.data || []);
            setScheduler(data?.scheduler || null);
            setError(null);
        } catch (e) {
            setError(e?.response?.data?.message || e.message);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { load(); }, [load]);

    const runSweep = async () => {
        setRunning(true);
        setError(null);
        try {
            await platformApi.post("/optimization/run");
            await load();
        } catch (e) {
            setError(e?.response?.data?.message || e.message);
        } finally {
            setRunning(false);
        }
    };

    const execute = async (orgId, recommendationId) => {
        setBusyOrg(orgId);
        try {
            await platformApi.post(`/optimization/execute/${orgId}`, { recommendationId });
            await load();
        } catch (e) {
            window.alert(e?.response?.data?.message || e.message);
        } finally {
            setBusyOrg(null);
        }
    };

    const totals = useMemo(() => {
        return report.reduce((acc, r) => {
            acc.byAction[r.recommendedAction] = (acc.byAction[r.recommendedAction] || 0) + 1;
            acc.savingUsd += r.costSavingEstimateUsd || 0;
            return acc;
        }, { byAction: {}, savingUsd: 0 });
    }, [report]);

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        <DollarSign className="w-6 h-6 text-emerald-600" />
                        Cost Optimization
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Per-org recommendations from the cost engine. MOVE/DOWNGRADE actions hand off to the Phase 8
                        migration pipeline. ARCHIVE soft-archives the org and locks writes (data is retained).
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={runSweep}
                        disabled={running}
                        className="text-sm px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded flex items-center gap-1.5"
                    >
                        <Play className={`w-4 h-4 ${running ? "animate-pulse" : ""}`} />
                        {running ? "Sweeping…" : "Run sweep"}
                    </button>
                    <button
                        onClick={load}
                        className="text-sm px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 rounded flex items-center gap-1.5"
                        disabled={loading}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Summary tiles */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white border border-slate-200 rounded p-3">
                    <div className="text-xs text-slate-500">Total recommendations</div>
                    <div className="text-2xl font-semibold">{report.length}</div>
                </div>
                <div className="bg-white border border-slate-200 rounded p-3">
                    <div className="text-xs text-slate-500">Estimated savings / mo</div>
                    <div className="text-2xl font-semibold text-emerald-600">
                        ${totals.savingUsd.toFixed(2)}
                    </div>
                </div>
                {["MOVE", "ARCHIVE", "DOWNGRADE", "KEEP"].map(a => (
                    <div key={a} className="bg-white border border-slate-200 rounded p-3">
                        <div className="text-xs text-slate-500">{a}</div>
                        <div className="text-2xl font-semibold">{totals.byAction[a] || 0}</div>
                    </div>
                ))}
            </div>

            {/* Scheduler banner */}
            {scheduler && (
                <div className="flex items-center justify-between text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded">
                    <div className="flex items-center gap-2 text-slate-600">
                        <Activity className={`w-4 h-4 ${scheduler.running ? "text-emerald-500" : "text-slate-400"}`} />
                        Scheduler: {scheduler.running ? "running" : "stopped"} ·
                        Auto-execute: <span className={scheduler.autoExecute ? "text-rose-600 font-medium" : "text-slate-500"}>{String(scheduler.autoExecute)}</span> ·
                        Interval: {Math.round((scheduler.intervalMs || 0) / 1000 / 60)} min
                    </div>
                    {scheduler.lastCycleStats && (
                        <div className="text-slate-500">
                            Last cycle: analyzed {scheduler.lastCycleStats.analyzed},
                            recs {scheduler.lastCycleStats.recommendations},
                            errors {scheduler.lastCycleStats.errors}
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 text-rose-700 rounded text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {/* Status filter */}
            <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Filter:</span>
                {["ALL", "PENDING", "EXECUTING", "EXECUTED", "FAILED", "SKIPPED"].map(s => (
                    <button
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`px-2 py-1 rounded ${statusFilter === s ? "bg-indigo-600 text-white" : "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                    >
                        {s}
                    </button>
                ))}
            </div>

            {/* Recommendations table */}
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                        <tr>
                            <th className="text-left px-4 py-2">Org</th>
                            <th className="text-left px-4 py-2">Cluster</th>
                            <th className="text-left px-4 py-2">Action</th>
                            <th className="text-left px-4 py-2">Target</th>
                            <th className="text-left px-4 py-2">Reason</th>
                            <th className="text-right px-4 py-2">Size</th>
                            <th className="text-right px-4 py-2">Last active</th>
                            <th className="text-right px-4 py-2">Saving</th>
                            <th className="text-left px-4 py-2">Risk</th>
                            <th className="text-left px-4 py-2">Status</th>
                            <th className="text-right px-4 py-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && report.length === 0 && (
                            <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
                        )}
                        {!loading && report.length === 0 && (
                            <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">
                                No recommendations yet. Click <em>Run sweep</em> above.
                            </td></tr>
                        )}
                        {report.map(r => (
                            <tr key={r._id} className="border-t border-slate-100 hover:bg-slate-50/60">
                                <td className="px-4 py-3">
                                    <div className="font-mono text-xs text-slate-500">{String(r.organizationId).slice(0, 8)}…</div>
                                </td>
                                <td className="px-4 py-3 font-mono text-xs">{r.currentCluster}</td>
                                <td className="px-4 py-3"><ActionBadge action={r.recommendedAction} /></td>
                                <td className="px-4 py-3 font-mono text-xs text-indigo-700">{r.targetCluster || "—"}</td>
                                <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                                <td className="px-4 py-3 text-right text-xs text-slate-700">{fmtMB(r.metrics?.dbSizeMB)}</td>
                                <td className="px-4 py-3 text-right text-xs text-slate-500">{fmtRelative(r.metrics?.lastActiveAt)}</td>
                                <td className="px-4 py-3 text-right text-xs font-medium text-emerald-700">
                                    {r.costSavingEstimateUsd > 0 ? `$${r.costSavingEstimateUsd.toFixed(2)}` : "—"}
                                </td>
                                <td className={`px-4 py-3 text-xs font-medium ${RISK_BADGE[r.riskLevel] || ""}`}>{r.riskLevel}</td>
                                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                                <td className="px-4 py-3 text-right">
                                    {r.status === "PENDING" && r.recommendedAction !== "KEEP" && (
                                        <button
                                            disabled={busyOrg === String(r.organizationId)}
                                            onClick={() => execute(String(r.organizationId), String(r._id))}
                                            className="text-xs px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded disabled:opacity-50"
                                        >
                                            {busyOrg === String(r.organizationId) ? "…" : "Execute"}
                                        </button>
                                    )}
                                    {r.status === "EXECUTED" && (
                                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> done
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
