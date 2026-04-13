/**
 * AuditTrailExplorer.jsx
 * Platform Audit Trail Explorer (v21.0)
 *
 * Route: /platform/audit/explorer
 * Capability: VIEW_AUDIT_LOGS
 *
 * Features:
 *  - Paginated, searchable audit log table
 *  - Columns: Time, Actor, Role, Action, Entity, Location, Device
 *  - Advanced filter panel: action, actorRole, entityType, actorName, date range, location
 *  - CSV and JSON export via /audit/export?token=<JWT>
 *  - Click row → detail slide-over panel
 *  - Chain integrity verifier built-in
 */

import React, { useEffect, useState, useCallback } from "react";
import {
    ShieldCheck, ShieldAlert, Search, Download, RefreshCw,
    Loader2, AlertTriangle, ChevronLeft, ChevronRight,
    Filter, X, Globe, Monitor, User, Clock, Hash, Eye,
    ChevronDown, ChevronUp
} from "lucide-react";
import platformApi from "../auth/platformApi";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";
import { getPlatformToken } from "../auth/PlatformAuthContext";

// ─── Action color map ─────────────────────────────────────────────────────────
const ACTION_COLORS = {
    LOGIN_SUCCESS: "bg-emerald-50 text-emerald-700 border-emerald-200",
    LOGIN_FAILED: "bg-red-50 text-red-700 border-red-200",
    LOGOUT: "bg-slate-50 text-slate-600 border-slate-200",
    TOKEN_REFRESH: "bg-sky-50 text-sky-600 border-sky-200",
    RECOVERY_CODE_USED: "bg-orange-50 text-orange-700 border-orange-200",
    NEW_IP_LOGIN: "bg-amber-50 text-amber-700 border-amber-200",
    TWO_FA_LOCKED: "bg-red-50 text-red-800 border-red-300",
    CREATE: "bg-blue-50 text-blue-700 border-blue-200",
    UPDATE: "bg-violet-50 text-violet-700 border-violet-200",
    DELETE: "bg-red-50 text-red-700 border-red-200",
    INVOICE_VOIDED: "bg-slate-100 text-slate-600 border-slate-300",
};

function ActionBadge({ action }) {
    const cls = ACTION_COLORS[action] || "bg-slate-50 text-slate-600 border-slate-200";
    return (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide border ${cls} whitespace-nowrap`}>
            {action?.replace(/_/g, " ")}
        </span>
    );
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtTs(d) {
    if (!d) return "—";
    const dt = new Date(d);
    return dt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function fmtActor(log) {
    const first = log.actorFirstName || "";
    const last = log.actorLastName || "";
    const name = [first, last].filter(Boolean).join(" ");
    if (name) return name;
    // fallback to actorId tail
    return log.actorId ? `…${String(log.actorId).slice(-6)}` : "System";
}

// ─── Log detail slide-over ────────────────────────────────────────────────────
function LogDetail({ log, onClose }) {
    if (!log) return null;

    const rows = [
        ["Timestamp", new Date(log.createdAt).toISOString(), Clock],
        ["Action", log.action, Hash],
        ["Actor", fmtActor(log), User],
        ["Role", log.actorRole || "—", User],
        ["Actor Type", log.actorType || "—", User],
        ["Entity Type", log.entityType || log.entity || "—", Hash],
        ["Entity ID", log.entityId ? String(log.entityId) : "—", Hash],
        ["IP Address", log.ipAddress || "—", Globe],
        ["Geo Location", log.geoLocation || "—", Globe],
        ["Browser", log.browser || "—", Monitor],
        ["OS", log.os || "—", Monitor],
        ["Device", log.device || "—", Monitor],
        ["Request ID", log.requestId || log.correlationId || "—", Hash],
        ["Success", String(log.success ?? "—"), Hash],
    ];

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl border-l border-slate-200 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <div>
                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-0.5">Audit Event Detail</p>
                        <div className="flex items-center gap-2">
                            <ActionBadge action={log.action} />
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-200 text-slate-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Fields */}
                <div className="flex-1 p-6 space-y-3">
                    {rows.map(([label, value, Icon]) => (
                        <div key={label} className="flex items-start gap-3">
                            <div className="pt-0.5 shrink-0">
                                <Icon className="w-3.5 h-3.5 text-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
                                <p className="text-sm font-medium text-slate-700 break-all">{value || "—"}</p>
                            </div>
                        </div>
                    ))}

                    {/* Hash chain */}
                    {(log.previousHash || log.currentHash) && (
                        <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2">Hash Chain</p>
                            <div className="space-y-1.5">
                                <div>
                                    <p className="text-[9px] text-slate-400 font-mono uppercase mb-0.5">Previous</p>
                                    <p className="text-xs font-mono text-slate-600 break-all">{log.previousHash || "0"}</p>
                                </div>
                                <div>
                                    <p className="text-[9px] text-slate-400 font-mono uppercase mb-0.5">Current</p>
                                    <p className="text-xs font-mono text-emerald-600 break-all">{log.currentHash || "—"}</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Raw details */}
                    {log.details && (
                        <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400 mb-2">Details</p>
                            <pre className="text-xs font-mono text-slate-600 whitespace-pre-wrap break-all">
                                {JSON.stringify(log.details, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Filter panel ─────────────────────────────────────────────────────────────
const EMPTY_FILTERS = { action: "", actorRole: "", actorName: "", entityType: "", geoLocation: "", from: "", to: "" };

function FilterPanel({ filters, onChange, onClear }) {
    return (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
                ["Action", "action", "e.g. LOGIN_SUCCESS"],
                ["Actor Name", "actorName", "e.g. Shady"],
                ["Role", "actorRole", "e.g. SUPER_ADMIN"],
                ["Entity Type", "entityType", "e.g. PlatformUser"],
                ["Location", "geoLocation", "e.g. Cairo"],
                ["From Date", "from", "YYYY-MM-DD"],
                ["To Date", "to", "YYYY-MM-DD"],
            ].map(([label, key, placeholder]) => (
                <div key={key}>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{label}</label>
                    <input
                        type={key === "from" || key === "to" ? "date" : "text"}
                        id={`audit-filter-${key}`}
                        value={filters[key] || ""}
                        onChange={e => onChange(key, e.target.value)}
                        placeholder={placeholder}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                </div>
            ))}
            <div className="flex items-end">
                <button
                    onClick={onClear}
                    className="w-full px-3 py-2 text-xs font-bold text-slate-500 border border-slate-200 rounded-xl hover:bg-white transition-colors"
                >
                    Clear All
                </button>
            </div>
        </div>
    );
}

// ─── Chain integrity banner ───────────────────────────────────────────────────
function ChainIntegrityBanner({ onVerify, result, loading }) {
    if (!result) {
        return (
            <button
                onClick={onVerify}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
                {loading
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                }
                Verify Chain
            </button>
        );
    }

    if (result.valid) {
        return (
            <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
                <ShieldCheck className="w-3.5 h-3.5" />
                Chain intact · {result.scannedEntries} entries scanned
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl">
            <ShieldAlert className="w-3.5 h-3.5" />
            Chain compromised at entry {String(result.brokenAt?.entryId).slice(-8)}
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AuditTrailExplorer() {
    const { hasCapability, loading: capLoading } = usePlatformCapabilities();
    const [logs, setLogs] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [showFilters, setShowFilters] = useState(false);
    const [selected, setSelected] = useState(null);
    const [chainResult, setChainResult] = useState(null);
    const [chainLoading, setChainLoading] = useState(false);

    const load = useCallback(async (p = 1) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: p, limit: 50 });
            Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
            const res = await platformApi.get(`/audit/logs?${params}`);
            setLogs(res.data.data || []);
            setPagination(res.data.pagination || { page: p, limit: 50, total: 0, pages: 1 });
        } catch (e) {
            setError(e?.response?.data?.error || "Failed to load audit logs");
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { load(page); }, [load, page]);

    const handleFilterChange = (key, val) => {
        setFilters(f => ({ ...f, [key]: val }));
        setPage(1);
    };

    const handleExport = (format = "csv") => {
        const token = getPlatformToken();
        const params = new URLSearchParams({ format, token });
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
        window.open(`/api/platform/audit/export?${params}`, "_blank");
    };

    const handleVerifyChain = async () => {
        setChainLoading(true);
        try {
            const res = await platformApi.get("/audit/verify-chain");
            setChainResult(res.data);
        } catch (e) {
            setChainResult(null);
        } finally {
            setChainLoading(false);
        }
    };

    if (capLoading) return null;
    if (!hasCapability("VIEW_AUDIT_LOGS")) {
        return <PlatformUnauthorized capability="VIEW_AUDIT_LOGS" />;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-5 px-4 py-6" id="audit-trail-explorer">
            {selected && <LogDetail log={selected} onClose={() => setSelected(null)} />}

            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Audit Trail Explorer</h1>
                        <p className="text-sm text-slate-500 font-medium">
                            {pagination.total.toLocaleString()} entrées · Cryptographically chained
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <ChainIntegrityBanner
                        onVerify={handleVerifyChain}
                        result={chainResult}
                        loading={chainLoading}
                    />
                    <button
                        onClick={() => setShowFilters(f => !f)}
                        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-colors
                            ${showFilters ? "bg-blue-600 text-white border-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        Filters
                        {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <button
                        onClick={() => handleExport("csv")}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" /> CSV
                    </button>
                    <button
                        onClick={() => handleExport("json")}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        <Download className="w-3.5 h-3.5" /> JSON
                    </button>
                    <button
                        onClick={() => load(page)}
                        className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Filter panel */}
            {showFilters && (
                <FilterPanel
                    filters={filters}
                    onChange={handleFilterChange}
                    onClear={() => { setFilters(EMPTY_FILTERS); setPage(1); }}
                />
            )}

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
            )}

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm font-medium">Loading audit trail…</span>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="py-16 text-center">
                        <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-400 font-medium">No audit entries found</p>
                        <p className="text-xs text-slate-300 mt-1">Try adjusting your filters</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[900px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    {["Time", "Actor", "Role", "Action", "Entity", "Location", "Device", ""].map(h => (
                                        <th key={h} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {logs.map(log => (
                                    <tr
                                        key={log._id}
                                        className="hover:bg-slate-50/60 transition-colors cursor-pointer group"
                                        onClick={() => setSelected(log)}
                                    >
                                        {/* Time */}
                                        <td className="px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">
                                            {fmtTs(log.createdAt)}
                                        </td>
                                        {/* Actor */}
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-bold text-slate-800">{fmtActor(log)}</p>
                                        </td>
                                        {/* Role */}
                                        <td className="px-4 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">
                                            {log.actorRole || "—"}
                                        </td>
                                        {/* Action */}
                                        <td className="px-4 py-3">
                                            <ActionBadge action={log.action} />
                                        </td>
                                        {/* Entity */}
                                        <td className="px-4 py-3">
                                            <p className="text-xs font-medium text-slate-600">{log.entityType || log.entity || "—"}</p>
                                            {log.entityId && (
                                                <p className="text-[10px] font-mono text-slate-400 mt-0.5">…{String(log.entityId).slice(-8)}</p>
                                            )}
                                        </td>
                                        {/* Location */}
                                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <Globe className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                                {log.geoLocation || log.ipAddress || "—"}
                                            </div>
                                        </td>
                                        {/* Device */}
                                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5">
                                                <Monitor className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                                {[log.browser, log.os].filter(Boolean).join(" / ") || "—"}
                                            </div>
                                        </td>
                                        {/* Detail */}
                                        <td className="px-4 py-3">
                                            <Eye className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 transition-colors" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-medium">
                        Page {pagination.page} of {pagination.pages} · {pagination.total.toLocaleString()} records
                    </p>
                    <div className="flex items-center gap-1">
                        <button
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            disabled={page >= pagination.pages}
                            onClick={() => setPage(p => p + 1)}
                            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
