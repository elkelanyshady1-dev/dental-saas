/**
 * PlatformPaymentsPage.jsx
 * Platform Finance — Payment Attempt History
 *
 * Route: /platform/billing/payments
 * Capability: VIEW_PLATFORM_ANALYTICS
 *
 * Reads from PaymentAttempt collection — each payment event (success, failure,
 * refund, dispute) creates a new record with full retry history.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    CreditCard, Download, RefreshCw, Loader2,
    AlertTriangle, ChevronLeft, ChevronRight, Filter, Building2
} from "lucide-react";
import platformApi from "../auth/platformApi";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";

const STATUS_CFG = {
    captured: { label: "Succeeded", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    failed: { label: "Failed", cls: "bg-red-50 text-red-700 border-red-200" },
    refunded: { label: "Refunded", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    disputed: { label: "Disputed", cls: "bg-orange-50 text-orange-700 border-orange-200" },
    authorized: { label: "Authorized", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    initiated: { label: "Initiated", cls: "bg-slate-50 text-slate-600 border-slate-200" },
};

function StatusBadge({ status }) {
    const cfg = STATUS_CFG[status] || { label: status, cls: "bg-slate-50 text-slate-600 border-slate-200" };
    return (
        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${cfg.cls}`}>
            {cfg.label}
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

const PROVIDERS = ["stripe", "paymob", "paypal", "manual"];

export default function PlatformPaymentsPage() {
    const { hasCapability, loading: capLoading } = usePlatformCapabilities();
    const navigate = useNavigate();
    const [attempts, setAttempts] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState("");
    const [providerFilter, setProviderFilter] = useState("");
    const [page, setPage] = useState(1);

    const load = useCallback(async (p = page) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: p, limit: 50 });
            if (statusFilter) params.set("status", statusFilter);
            if (providerFilter) params.set("provider", providerFilter);
            const res = await platformApi.get(`/billing/payments?${params}`);
            const body = res.data;
            setAttempts(body.data || []);
            setPagination(body.pagination || { page: p, limit: 50, total: 0, pages: 1 });
        } catch (e) {
            setError(e?.response?.data?.error || e.message || "Failed to load payment history");
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter, providerFilter]);

    useEffect(() => { load(page); }, [load, page, statusFilter, providerFilter]);

    const handleExport = () => {
        const params = new URLSearchParams();
        if (statusFilter) params.set("status", statusFilter);
        if (providerFilter) params.set("provider", providerFilter);
        window.open(`/api/platform/billing/payments/export?${params}`, "_blank");
    };

    if (capLoading) return null;
    if (!hasCapability("VIEW_PLATFORM_ANALYTICS")) {
        return <PlatformUnauthorized capability="VIEW_PLATFORM_ANALYTICS" />;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 px-4 py-6" id="payments-page">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-200 text-emerald-700">
                        <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Payment History</h1>
                        <p className="text-sm text-slate-500 font-medium">
                            Every payment attempt, retry, refund, and dispute · {pagination.total} records
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">
                        <Download className="w-3 h-3" /> CSV
                    </button>
                    <button onClick={() => load(page)} className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 flex-wrap">
                <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <select
                    id="payments-status-filter"
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                    <option value="">All statuses</option>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select
                    id="payments-provider-filter"
                    value={providerFilter}
                    onChange={e => { setProviderFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                >
                    <option value="">All providers</option>
                    {PROVIDERS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
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
                        <span className="text-sm font-medium">Loading payment history…</span>
                    </div>
                ) : attempts.length === 0 ? (
                    <div className="py-16 text-center">
                        <CreditCard className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-400 font-medium">No payment attempts found</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                {["Timestamp", "Organization", "Invoice", "Provider", "Amount", "Status", "Attempt #", "Error"].map(h => (
                                    <th key={h} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {attempts.map(a => (
                                <tr key={a._id} className="hover:bg-slate-50/60 transition-colors cursor-pointer" onClick={() => a.invoiceId && navigate(`/platform/billing/invoices?open=${a.invoiceId}`)}>
                                    <td className="px-5 py-3.5 text-xs font-mono text-slate-500 whitespace-nowrap">
                                        {fmt(a.createdAt)}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {a.orgName ? (
                                            <div className="flex items-center gap-1.5">
                                                <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                <span className="text-xs font-bold text-slate-700 truncate max-w-[140px]">{a.orgName}</span>
                                            </div>
                                        ) : (
                                            <span className="text-xs font-mono text-slate-400">{a.organizationId ? String(a.organizationId).slice(-6) : "—"}</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {a.invoiceId ? (
                                            <button
                                                onClick={e => { e.stopPropagation(); navigate(`/platform/billing/invoices?open=${a.invoiceId}`); }}
                                                className="text-xs font-mono text-blue-600 hover:text-blue-800 underline underline-offset-1 transition-colors"
                                            >
                                                ···{String(a.invoiceId).slice(-8)}
                                            </button>
                                        ) : "—"}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-bold text-slate-600 capitalize">
                                        {a.provider || "—"}
                                    </td>
                                    <td className="px-5 py-3.5 text-sm font-bold text-slate-800">
                                        {fmtMoney(a.amount, a.currency)}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <StatusBadge status={a.status} />
                                    </td>
                                    <td className="px-5 py-3.5 text-center">
                                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ${a.attemptNumber > 1 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-slate-50 text-slate-600 border border-slate-200"}`}>
                                            #{a.attemptNumber || 1}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3.5 max-w-[160px]">
                                        {a.errorCode ? (
                                            <span className="text-xs font-mono text-red-500 truncate" title={a.errorMessage || a.errorCode}>
                                                {a.errorCode}
                                            </span>
                                        ) : "—"}
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
                        Page {pagination.page} of {pagination.pages} · {pagination.total} records
                    </p>
                    <div className="flex items-center gap-1">
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}
                            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
