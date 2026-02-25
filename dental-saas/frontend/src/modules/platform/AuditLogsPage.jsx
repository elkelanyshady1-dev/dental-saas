import { useState, useEffect, useCallback } from "react";
import api from "../../services/api";

const ALL_ACTIONS = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT"];

export default function AuditLogsPage() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    const [filters, setFilters] = useState({
        action: "",
        success: "",
        search: "",
    });
    const [applied, setApplied] = useState(filters);

    const LIMIT = 50;

    const fetchLogs = useCallback(async (activeFilters, currentPage) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            params.set("limit", LIMIT);
            params.set("page", currentPage);
            if (activeFilters.action) params.set("action", activeFilters.action);
            if (activeFilters.success !== "") params.set("success", activeFilters.success);
            if (activeFilters.search) params.set("search", activeFilters.search);

            const res = await api.get(`/platform/audit-logs?${params.toString()}`);
            const data = Array.isArray(res.data) ? res.data : (res.data?.logs || []);
            setLogs(data);
            setHasMore(data.length === LIMIT);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load audit logs.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLogs(applied, page);
    }, [fetchLogs, applied, page]);

    const handleApply = () => {
        setPage(1);
        setApplied({ ...filters });
    };

    const handleReset = () => {
        const empty = { action: "", success: "", search: "" };
        setFilters(empty);
        setApplied(empty);
        setPage(1);
    };

    return (
        <div className="bg-slate-50 min-h-screen p-10 space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Audit Logs</h1>
                <p className="text-slate-500 mt-1">
                    Full traceability of all platform-level actions and events.
                </p>
            </div>

            {/* Filter Bar */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
                <div className="flex flex-wrap items-end gap-4">
                    {/* Action Filter */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</label>
                        <select
                            value={filters.action}
                            onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
                            className="border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Actions</option>
                            {ALL_ACTIONS.map((a) => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                    </div>

                    {/* Success Filter */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Result</label>
                        <select
                            value={filters.success}
                            onChange={(e) => setFilters((f) => ({ ...f, success: e.target.value }))}
                            className="border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Results</option>
                            <option value="true">Success</option>
                            <option value="false">Failed</option>
                        </select>
                    </div>

                    {/* Search */}
                    <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Search Endpoint / Entity</label>
                        <input
                            type="text"
                            value={filters.search}
                            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && handleApply()}
                            placeholder="e.g. /organizations or DELETE"
                            className="border border-slate-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-2 pb-px">
                        <button
                            onClick={handleApply}
                            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            Apply
                        </button>
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 border border-slate-300 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            Reset
                        </button>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {loading && (
                    <div className="flex items-center justify-center py-24 gap-3">
                        <div className="w-6 h-6 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-medium">Loading audit logs...</p>
                    </div>
                )}

                {!loading && error && (
                    <div className="py-16 text-center">
                        <p className="text-red-500 font-medium">{error}</p>
                        <p className="text-slate-400 text-sm mt-2">The audit logs endpoint may not be available yet.</p>
                    </div>
                )}

                {!loading && !error && logs.length === 0 && (
                    <div className="py-16 text-center">
                        <p className="text-slate-400 text-sm">No audit log entries found for the selected filters.</p>
                    </div>
                )}

                {!loading && !error && logs.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/50">
                                    <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Timestamp</th>
                                    <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">User</th>
                                    <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Action</th>
                                    <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Entity</th>
                                    <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Status</th>
                                    <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">IP</th>
                                    <th className="py-4 px-5 text-xs uppercase tracking-wider text-slate-500 font-semibold">Endpoint</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {logs.map((log, i) => (
                                    <LogRow key={log._id || i} log={log} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {!loading && !error && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100">
                        <span className="text-sm text-slate-500">Page {page}</span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                ← Previous
                            </button>
                            <button
                                onClick={() => setPage((p) => p + 1)}
                                disabled={!hasMore}
                                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOG ROW
// ─────────────────────────────────────────────────────────────────────────────

function LogRow({ log }) {
    const timestamp = log.createdAt || log.timestamp;
    const formattedTime = timestamp
        ? new Date(timestamp).toLocaleString("en-US", {
            month: "short", day: "numeric", year: "numeric",
            hour: "2-digit", minute: "2-digit", second: "2-digit"
        })
        : "—";

    // Action badge
    let actionBadge = "bg-slate-100 text-slate-600";
    const action = (log.action || "").toUpperCase();
    if (action === "CREATE") actionBadge = "bg-emerald-100 text-emerald-700";
    else if (action === "UPDATE") actionBadge = "bg-blue-100 text-blue-700";
    else if (action === "DELETE") actionBadge = "bg-red-100 text-red-700";
    else if (action === "LOGIN") actionBadge = "bg-indigo-100 text-indigo-700";

    const successBadge = log.success
        ? "bg-emerald-100 text-emerald-700"
        : "bg-red-100 text-red-700";

    const userName = log.userId?.name || log.user?.name || log.performedBy?.name || "System";
    const userEmail = log.userId?.email || log.user?.email || log.performedBy?.email || "";

    return (
        <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors duration-150">
            <td className="py-3.5 px-5 text-xs text-slate-500 font-medium whitespace-nowrap">{formattedTime}</td>
            <td className="py-3.5 px-5">
                <p className="font-semibold text-slate-800">{userName}</p>
                {userEmail && <p className="text-xs text-slate-400">{userEmail}</p>}
            </td>
            <td className="py-3.5 px-5">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${actionBadge}`}>
                    {log.action || "—"}
                </span>
            </td>
            <td className="py-3.5 px-5 text-slate-600 font-medium">
                {log.entity || log.resource || "—"}
            </td>
            <td className="py-3.5 px-5">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${successBadge}`}>
                    {log.success ? "Success" : "Failed"}
                </span>
            </td>
            <td className="py-3.5 px-5">
                <span className="font-mono text-xs text-slate-400">
                    {log.ipAddress || log.ip || "—"}
                </span>
            </td>
            <td className="py-3.5 px-5">
                <span className="font-mono text-xs text-slate-500 truncate max-w-[200px] block">
                    {log.endpoint || log.route || "—"}
                </span>
            </td>
        </tr>
    );
}
