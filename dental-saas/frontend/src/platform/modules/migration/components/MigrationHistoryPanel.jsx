import React from "react";
import { Clock, CheckCircle2, XCircle, ArrowRightLeft } from "lucide-react";
import { fmtRelative } from "./MigrationBadges";

function fmtDuration(ms) {
    if (ms == null) return "—";
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s - m * 60;
    return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

function statusIcon(status) {
    if (status === "DOWNTIME_COMPLETE" || status === "COMPLETE" || status === "SUCCESS") {
        return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    }
    if (status === "DOWNTIME_FAILED" || status === "FAILED") {
        return <XCircle className="w-4 h-4 text-rose-600" />;
    }
    return <ArrowRightLeft className="w-4 h-4 text-indigo-600" />;
}

function statusLabelClass(status) {
    if (status === "DOWNTIME_COMPLETE" || status === "COMPLETE" || status === "SUCCESS") {
        return "text-emerald-700";
    }
    if (status === "DOWNTIME_FAILED" || status === "FAILED") {
        return "text-rose-700";
    }
    return "text-gray-700";
}

export function MigrationHistoryPanel({ history, loading, error }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-800">Migration history</h2>
                <span className="text-xs text-gray-400">
                    ({history.length} {history.length === 1 ? "entry" : "entries"})
                </span>
            </div>
            <div className="max-h-96 overflow-y-auto">
                {loading && history.length === 0 && (
                    <div className="px-6 py-8 text-center text-sm text-gray-400">
                        Loading history…
                    </div>
                )}
                {!loading && !error && history.length === 0 && (
                    <div className="px-6 py-10 text-center text-sm text-gray-400">
                        No migration history yet. Completed runs will appear here.
                    </div>
                )}
                {error && (
                    <div className="px-6 py-6 text-sm text-rose-600">
                        Failed to load history: {error}
                    </div>
                )}
                {history.length > 0 && (
                    <ul className="divide-y divide-gray-100">
                        {history.map((entry) => (
                            <li key={entry._id || entry.migrationId + entry.createdAt} className="px-6 py-3">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5">{statusIcon(entry.to || entry.status)}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-3 text-sm">
                                            <div className="font-medium text-gray-800 truncate">
                                                {entry.orgName || entry.organizationId}
                                            </div>
                                            <div className="text-xs text-gray-400 shrink-0">
                                                {fmtRelative(entry.createdAt || entry.timestamp)}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                                            <span className={`font-medium ${statusLabelClass(entry.to || entry.status)}`}>
                                                {entry.to || entry.status}
                                            </span>
                                            <span className="font-mono">
                                                {entry.sourceCluster || "?"}
                                                <span className="text-gray-300"> → </span>
                                                {entry.targetCluster || "?"}
                                            </span>
                                            {entry.durationMs != null && (
                                                <span>duration: {fmtDuration(entry.durationMs)}</span>
                                            )}
                                            {entry.actor && (
                                                <span className="font-mono text-gray-400">{entry.actor}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default MigrationHistoryPanel;
