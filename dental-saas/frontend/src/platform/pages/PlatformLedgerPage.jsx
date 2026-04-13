/**
 * PlatformLedgerPage.jsx
 * Platform Finance — Immutable Billing Ledger
 *
 * Route: /platform/billing/ledger
 * Capability: VIEW_AUDIT_LOGS
 *
 * Read-only view. No mutations permitted.
 *
 * Upgraded: double-entry linking
 *  - If an entry has ledgerTransactionId, the Reference cell is clickable
 *    and links to /platform/billing/ledger/transaction/:id
 *  - The Reference column shows the referenceType + referenceLabel
 *  - Backward compatible: entries without double-entry data show existing fields
 */

import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    ShieldCheck, Download, RefreshCw, Loader2,
    AlertTriangle, ChevronLeft, ChevronRight, Filter, ExternalLink, Building2
} from "lucide-react";
import platformApi from "../auth/platformApi";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";

// ── Event badge color map ─────────────────────────────────────────────────────

const EVENT_TYPE_COLORS = {
    "payment.succeeded": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "payment.failed": "bg-red-50 text-red-700 border-red-200",
    "invoice.created": "bg-blue-50 text-blue-700 border-blue-200",
    "invoice.refunded": "bg-amber-50 text-amber-700 border-amber-200",
    "invoice.voided": "bg-slate-50 text-slate-600 border-slate-200",
    "subscription.created": "bg-violet-50 text-violet-700 border-violet-200",
    "subscription.canceled": "bg-red-50 text-red-600 border-red-200",
    "credit.applied": "bg-emerald-50 text-emerald-600 border-emerald-200",
    "contract.activated": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "renewal.completed": "bg-teal-50 text-teal-700 border-teal-200",
};

const REFERENCE_TYPE_STYLE = {
    invoice: "bg-blue-50 text-blue-700",
    contract: "bg-indigo-50 text-indigo-700",
    payment: "bg-emerald-50 text-emerald-700",
    refund: "bg-amber-50 text-amber-700",
};

const EVENT_TYPES = [
    "payment.succeeded", "payment.failed", "invoice.created", "invoice.refunded",
    "invoice.voided", "subscription.created", "subscription.canceled",
    "credit.applied", "contract.activated", "renewal.completed"
];

// ── Small components ──────────────────────────────────────────────────────────

function EventBadge({ type }) {
    const cls = EVENT_TYPE_COLORS[type] || "bg-slate-50 text-slate-600 border-slate-200";
    return (
        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${cls}`}>
            {(type || "").replace(/\./g, " · ")}
        </span>
    );
}

function fmt(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

function fmtMoney(amount, cur) {
    if (amount == null) return "—";
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(amount);
    } catch { return `${cur} ${amount}`; }
}

/**
 * ReferenceCell
 *
 * If the ledger entry has been enriched with a LedgerTransaction link,
 * renders a clickable link to the transaction drilldown page.
 *
 * Fallback (backward compatible): shows the raw invoiceId tail if no
 * double-entry data exists.
 */
function ReferenceCell({ entry }) {
    const navigate = useNavigate();

    // ── Enriched double-entry entry ───────────────────────────────────────────
    if (entry.ledgerTransactionId && entry.referenceType) {
        const badgeStyle = REFERENCE_TYPE_STYLE[entry.referenceType] || "bg-slate-50 text-slate-600";
        const label = entry.referenceLabel || String(entry.referenceId || "").slice(-10);

        return (
            <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${badgeStyle}`}>
                    {entry.referenceType}
                </span>
                <Link
                    to={`/platform/billing/ledger/transaction/${entry.ledgerTransactionId}`}
                    className="inline-flex items-center gap-1 text-xs font-mono text-violet-600 hover:text-violet-900 underline underline-offset-2 transition-colors cursor-pointer"
                    title="View double-entry transaction"
                >
                    {label}
                    <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </Link>
            </div>
        );
    }

    // ── Legacy fallback: invoiceId → clickable link to invoice detail ─────────
    if (entry.invoiceId) {
        return (
            <span
                className="text-xs font-mono text-blue-600 hover:text-blue-800 cursor-pointer underline underline-offset-1 transition-colors"
                onClick={() => navigate(`/platform/billing/invoices?open=${entry.invoiceId}`)}
                title="View invoice"
            >
                {String(entry.invoiceId).slice(-8)}
            </span>
        );
    }

    return <span className="text-slate-300">—</span>;
}


// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PlatformLedgerPage() {
    const { hasCapability, loading: capLoading } = usePlatformCapabilities();
    const [entries, setEntries] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [eventType, setEventType] = useState("");
    const [page, setPage] = useState(1);

    const load = useCallback(async (p = page) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: p, limit: 50 });
            if (eventType) params.set("eventType", eventType);
            const res = await platformApi.get(`/billing/ledger?${params}`);
            const body = res.data;
            setEntries(body.data || []);
            setPagination(body.pagination || { page: p, limit: 50, total: 0, pages: 1 });
        } catch (e) {
            setError(e?.response?.data?.error || e.message || "Failed to load ledger");
        } finally {
            setLoading(false);
        }
    }, [page, eventType]);

    useEffect(() => { load(page); }, [load, page, eventType]);

    const handleExport = () => {
        const params = new URLSearchParams();
        if (eventType) params.set("eventType", eventType);
        window.open(`/api/platform/billing/ledger/export?${params}`, "_blank");
    };

    if (capLoading) return null;
    if (!hasCapability("VIEW_AUDIT_LOGS")) {
        return <PlatformUnauthorized capability="VIEW_AUDIT_LOGS" />;
    }

    // Count how many entries have double-entry transactions linked
    const enrichedCount = entries.filter(e => e.ledgerTransactionId).length;

    return (
        <div className="max-w-7xl mx-auto space-y-6 px-4 py-6" id="ledger-page">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-violet-100 border border-violet-200 text-violet-700">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Billing Ledger</h1>
                        <p className="text-sm text-slate-500 font-medium">
                            Immutable append-only financial event log
                            {pagination.total > 0 && ` · ${pagination.total} entries`}
                            {enrichedCount > 0 && (
                                <span className="ml-2 text-violet-500">
                                    · {enrichedCount} with double-entry records
                                </span>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full uppercase tracking-widest">
                        Read Only
                    </span>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        <Download className="w-3 h-3" /> CSV
                    </button>
                    <button
                        onClick={() => load(page)}
                        className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <select
                    id="ledger-event-filter"
                    value={eventType}
                    onChange={e => { setEventType(e.target.value); setPage(1); }}
                    className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                    <option value="">All event types</option>
                    {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
            </div>

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
                        <span className="text-sm font-medium">Loading ledger…</span>
                    </div>
                ) : entries.length === 0 ? (
                    <div className="py-16 text-center">
                        <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-400 font-medium">No ledger entries found</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                {["Timestamp", "Organization", "Event", "Amount", "Cur.", "Reference", "Provider", "Source"].map(h => (
                                    <th key={h} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {entries.map(entry => (
                                <tr
                                    key={entry._id}
                                    className={`transition-colors ${entry.ledgerTransactionId ? "hover:bg-violet-50/30" : "hover:bg-slate-50/40"}`}
                                >
                                    <td className="px-5 py-3.5 text-xs font-mono text-slate-500 whitespace-nowrap">
                                        {fmt(entry.createdAt)}
                                    </td>
                                    {/* Org Name cell */}
                                    <td className="px-5 py-3.5">
                                        {entry.orgName ? (
                                            <button
                                                onClick={() => navigate(`/platform/organizations/${entry.organizationId}`)}
                                                className="flex items-center gap-1.5 group"
                                            >
                                                <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600 truncate max-w-[110px] transition-colors">{entry.orgName}</span>
                                            </button>
                                        ) : (
                                            <span className="text-xs font-mono text-slate-400">{entry.organizationId ? String(entry.organizationId).slice(-6) : "—"}</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <EventBadge type={entry.eventType} />
                                    </td>
                                    <td className="px-5 py-3.5 text-sm font-bold text-slate-800">
                                        {fmtMoney(entry.amount, entry.currency)}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-bold text-slate-500">
                                        {entry.currency}
                                    </td>
                                    {/* Reference — clickable if double-entry linked, raw fallback otherwise */}
                                    <td className="px-5 py-3.5">
                                        <ReferenceCell entry={entry} />
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-medium text-slate-500">
                                        {entry.provider || "—"}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-medium text-slate-400">
                                        {entry.source || "—"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400 font-medium">
                        Page {pagination.page} of {pagination.pages} · {pagination.total} entries
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
