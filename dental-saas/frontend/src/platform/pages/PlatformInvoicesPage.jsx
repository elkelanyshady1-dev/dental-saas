/**
 * PlatformInvoicesPage.jsx
 * Platform Finance — Invoice Management (v2.0 — Stripe-style model)
 *
 * Route: /platform/billing/invoices
 * Capability: VIEW_ORGANIZATIONS
 *
 * v2.0 changes:
 *   - Modal now fetches full invoice detail (line items, summary) from GET /billing/invoices/:id
 *   - Line items table in modal
 *   - Financial breakdown (subtotal, discount, tax, total)
 *   - Payment status pill
 *   - Table: Invoice # / Org / Type / Currency / Status / Due Date / Amount
 *   - PDF / Download / Print buttons with query-token auth (from previous task)
 */

import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

import {
    FileText, Search, Download, RefreshCw, Loader2,
    AlertTriangle, ChevronLeft, ChevronRight, X, Printer,
    CreditCard, Calendar, Hash, Building2
} from "lucide-react";
import platformApi from "../auth/platformApi";
import { usePlatformCapabilities } from "../hooks/usePlatformCapabilities";
import PlatformUnauthorized from "../core/components/PlatformUnauthorized";
import { getPlatformToken } from "../auth/PlatformAuthContext";
// Section 11: Shared money utility — roundCurrency + Intl.NumberFormat
import { fmtMoney } from "../../utils/money";

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
    paid: { label: "Paid", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    open: { label: "Open", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    issued: { label: "Issued", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    partial: { label: "Partial", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    overdue: { label: "Overdue", cls: "bg-red-50 text-red-700 border-red-200" },
    draft: { label: "Draft", cls: "bg-slate-50 text-slate-600 border-slate-200" },
    void: { label: "Void", cls: "bg-slate-100 text-slate-500 border-slate-200" },
    uncollectible: { label: "Uncollectible", cls: "bg-red-50 text-red-700 border-red-200" },
};

function StatusBadge({ status }) {
    const cfg = STATUS_CFG[status] || { label: status, cls: "bg-slate-50 text-slate-600 border-slate-200" };
    return (
        <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
}

// ─── Payment status pill ──────────────────────────────────────────────────────
const PAYMENT_STATUS_CFG = {
    pending: { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    processing: { label: "Processing", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    authorized: { label: "Authorized", cls: "bg-sky-50 text-sky-700 border-sky-200" },
    captured: { label: "Captured", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    failed: { label: "Failed", cls: "bg-red-50 text-red-700 border-red-200" },
    refunded: { label: "Refunded", cls: "bg-violet-50 text-violet-700 border-violet-200" },
    partially_refunded: { label: "Part. Refunded", cls: "bg-violet-50 text-violet-600 border-violet-200" },
    disputed: { label: "Disputed", cls: "bg-orange-50 text-orange-700 border-orange-200" },
};

function PaymentStatusBadge({ status }) {
    const cfg = PAYMENT_STATUS_CFG[status] || { label: status || "—", cls: "bg-slate-50 text-slate-500 border-slate-200" };
    return (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmt(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" });
}

// Section 11: fmtMoney imported from shared utility (removes local incomplete version)
// The shared utility applies roundCurrency before Intl.NumberFormat.

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────
function InvoiceDetailModal({ invoiceSummary, onClose }) {
    const navigate = useNavigate();
    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch full detail immediately on open
    useEffect(() => {
        if (!invoiceSummary?._id) return;
        setLoading(true);
        setError(null);
        platformApi.get(`/billing/invoices/${invoiceSummary._id}`)
            .then(r => setInvoice(r.data.data))
            .catch(e => setError(e?.response?.data?.error || "Failed to load invoice detail"))
            .finally(() => setLoading(false));
    }, [invoiceSummary?._id]);

    if (!invoiceSummary) return null;

    // Use summary data while full detail loads — prevents empty modal flash
    const display = invoice || invoiceSummary;
    const lineItems = invoice?.lineItems || [];
    const summary = invoice?.summary || {};
    const currency = display.currency;

    // ── PDF button: opens PDF inline in a new browser tab ─────────────────────
    const openPdf = () => {
        const token = getPlatformToken();
        window.open(
            `/api/platform/billing/invoices/${display._id}/pdf?mode=inline&token=${token}`,
            "_blank",
            "noopener,noreferrer"
        );
    };

    // ── Download button: triggers browser save-file dialog ────────────────────
    const downloadPdf = () => {
        const token = getPlatformToken();
        const link = document.createElement("a");
        link.href = `/api/platform/billing/invoices/${display._id}/pdf?mode=download&token=${token}`;
        link.download = `invoice-${display.invoiceNumber || display._id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── Print button: opens PDF inline then triggers OS print dialog ──────────
    const printPdf = () => {
        const token = getPlatformToken();
        const url = `/api/platform/billing/invoices/${display._id}/pdf?mode=inline&token=${token}`;
        const printWindow = window.open(url, "_blank");
        if (printWindow) {
            printWindow.onload = () => {
                printWindow.focus();
                printWindow.print();
            };
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-y-auto">

                {/* ── Header ── */}
                <div className="flex items-start justify-between p-6 border-b border-slate-100">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-lg font-black text-slate-900">
                                {display.invoiceNumber || "Invoice"}
                            </h2>
                            <StatusBadge status={display.status} />
                            {display.paymentStatus && (
                                <PaymentStatusBadge status={display.paymentStatus} />
                            )}
                        </div>
                        {invoice?.organization && (
                            <p className="text-sm text-slate-500 font-medium">
                                {invoice.organization.name}
                                {invoice.organization.billingCountry && (
                                    <span className="ml-2 text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                                        {invoice.organization.billingCountry}
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            id={`invoice-pdf-${display._id}`}
                            onClick={openPdf}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-blue-600 border border-blue-700 rounded-xl hover:bg-blue-700 transition-colors"
                        >
                            <FileText className="w-3 h-3" /> PDF
                        </button>
                        <button
                            id={`invoice-download-${display._id}`}
                            onClick={downloadPdf}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            <Download className="w-3 h-3" /> Download
                        </button>
                        <button
                            id={`invoice-print-${display._id}`}
                            onClick={printPdf}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            <Printer className="w-3 h-3" /> Print
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* ── Loading / Error ── */}
                {loading && (
                    <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Loading invoice detail…</span>
                    </div>
                )}
                {error && (
                    <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                    </div>
                )}

                <div className="p-6 space-y-6">
                    {/* ── Invoice meta grid ── */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {[
                            ["Invoice #", display.invoiceNumber || "—", Hash, null],
                            ["Issue Date", fmt(display.createdAt), Calendar, null],
                            ["Due Date", fmt(display.dueDate), Calendar, null],
                            ["Paid At", fmt(display.paidAt), Calendar, null],
                            ["Currency", display.currency || "—", CreditCard, null],
                        ].map(([label, val, Icon]) => (
                            <div key={label} className="bg-slate-50 rounded-xl p-3">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Icon className="w-3 h-3 text-slate-400" />
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                                </div>
                                <p className="text-sm font-bold text-slate-700 truncate">{val}</p>
                            </div>
                        ))}
                        {/* Contract — clickable link to contract detail */}
                        {(() => {
                            const contractId = display.contractId?._id || display.contractId;
                            const contractShort = contractId ? String(contractId).slice(-8) : null;
                            return (
                                <div className="bg-slate-50 rounded-xl p-3">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <FileText className="w-3 h-3 text-slate-400" />
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Contract</p>
                                    </div>
                                    {contractShort ? (
                                        <p
                                            className="text-sm font-bold text-indigo-600 truncate cursor-pointer hover:underline"
                                            onClick={() => { onClose(); navigate(`/platform/contracts/${contractId}`); }}
                                            title="View contract detail"
                                        >
                                            …{contractShort}
                                        </p>
                                    ) : (
                                        <p className="text-sm font-bold text-slate-400">—</p>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    {/* ── Line Items Table ── */}
                    {!loading && lineItems.length > 0 && (
                        <div>
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                                Line Items
                            </p>
                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead>
                                        <tr className="bg-slate-800">
                                            <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-300">Description</th>
                                            <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-300 text-center">Qty</th>
                                            <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-300 text-right">Unit Price</th>
                                            <th className="px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-300 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {lineItems.map((item, idx) => (
                                            <tr
                                                key={idx}
                                                className={`${idx % 2 === 1 ? "bg-slate-50/60" : "bg-white"} ${Number(item.total) < 0 ? "text-red-600" : "text-slate-800"}`}
                                            >
                                                <td className="px-4 py-3 text-sm font-medium">{item.description || "—"}</td>
                                                <td className="px-4 py-3 text-sm text-center text-slate-500">{item.quantity ?? 1}</td>
                                                <td className="px-4 py-3 text-sm text-right font-mono">{fmtMoney(item.unitPrice, currency)}</td>
                                                <td className="px-4 py-3 text-sm text-right font-bold font-mono">{fmtMoney(item.total, currency)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ── Financial Breakdown ── */}
                    {!loading && invoice && (
                        <div className="bg-slate-50 rounded-2xl p-5">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">
                                Financial Summary
                            </p>
                            <div className="space-y-2">
                                {/* Subtotal */}
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 font-medium">Subtotal</span>
                                    <span className="font-bold text-slate-700 font-mono">
                                        {fmtMoney(summary.subtotal ?? invoice.subtotalAmount, currency)}
                                    </span>
                                </div>

                                {/* Discount */}
                                {(summary.discount > 0 || invoice.couponDiscountAmount > 0) && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-red-500 font-medium">
                                            Discount {invoice.couponCode ? `(${invoice.couponCode})` : ""}
                                        </span>
                                        <span className="font-bold text-red-500 font-mono">
                                            −{fmtMoney(summary.discount ?? invoice.couponDiscountAmount, currency)}
                                        </span>
                                    </div>
                                )}

                                {/* Credit */}
                                {(summary.creditApplied > 0 || invoice.creditApplied > 0) && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-violet-500 font-medium">Credit Applied</span>
                                        <span className="font-bold text-violet-500 font-mono">
                                            −{fmtMoney(summary.creditApplied ?? invoice.creditApplied, currency)}
                                        </span>
                                    </div>
                                )}

                                {/* Tax */}
                                {(summary.tax > 0 || invoice.taxAmount > 0) && (
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-slate-500 font-medium">
                                            Tax {invoice.taxPercent ? `(${invoice.taxPercent}%)` : ""}
                                        </span>
                                        <span className="font-bold text-slate-700 font-mono">
                                            {fmtMoney(summary.tax ?? invoice.taxAmount, currency)}
                                        </span>
                                    </div>
                                )}

                                {/* Divider */}
                                <div className="border-t border-slate-200 pt-2 mt-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-base font-black text-slate-900">Total Due</span>
                                        <span className="text-2xl font-black text-slate-900 font-mono">
                                            {fmtMoney(invoice.totalAmount, currency)}
                                        </span>
                                    </div>
                                </div>

                                {/* Payment status + amounts */}
                                <div className="flex items-center justify-between text-sm pt-1">
                                    <span className="text-slate-400 font-medium">Payment status</span>
                                    <PaymentStatusBadge status={invoice.paymentStatus} />
                                </div>

                                {(() => {
                                    const isRefunded =
                                        invoice.paymentStatus === "refunded" ||
                                        invoice.paymentStatus === "partially_refunded" ||
                                        invoice.status === "refunded";

                                    // When refunded, amountPaid may have been zeroed by the processor.
                                    // Show original totalAmount as 'Originally Paid' and totalAmount as 'Refunded to Card'.
                                    const refundedAmount = invoice.refundedAmount ??
                                        (isRefunded && invoice.amountPaid === 0 ? invoice.totalAmount : null);

                                    if (isRefunded && refundedAmount != null && refundedAmount > 0) {
                                        return (
                                            <>
                                                <div className="flex items-center justify-between text-sm pt-1">
                                                    <span className="text-slate-400 font-medium">Originally Paid</span>
                                                    <span className="font-black text-emerald-600 font-mono text-sm line-through opacity-60">
                                                        {fmtMoney(refundedAmount, currency)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-sm pt-1 bg-violet-50 -mx-5 px-5 py-2 rounded-xl mt-1">
                                                    <span className="text-violet-700 font-bold">↩ Refunded to Card</span>
                                                    <span className="font-black text-violet-700 font-mono text-sm">
                                                        {fmtMoney(refundedAmount, currency)}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    Funds returned to original payment method
                                                </p>
                                            </>
                                        );
                                    }

                                    // Default: show paid + remaining as before
                                    return (
                                        <>
                                            {invoice.amountPaid != null && (
                                                <div className="flex items-center justify-between text-sm pt-1">
                                                    <span className="text-slate-400 font-medium">Amount Paid</span>
                                                    <span className="font-black text-emerald-600 font-mono text-sm">
                                                        {fmtMoney(invoice.amountPaid, currency)}
                                                    </span>
                                                </div>
                                            )}
                                            {invoice.amountRemaining != null && invoice.amountRemaining > 0 && (
                                                <div className="flex items-center justify-between text-sm pt-1">
                                                    <span className="text-slate-400 font-medium">Remaining Balance</span>
                                                    <span className="font-black text-orange-600 font-mono text-sm">
                                                        {fmtMoney(invoice.amountRemaining, currency)}
                                                    </span>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}

                                {/* Pay Invoice button — shown for open/partial/overdue invoices */}
                                {["open", "issued", "partial", "overdue"].includes(invoice.status) && invoice.organizationId && (
                                    <div className="pt-3 border-t border-slate-100 mt-1">
                                        <a
                                            href={`/platform/organizations/${invoice.organizationId}?tab=billing`}
                                            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-emerald-500 text-white text-xs font-black rounded-xl hover:bg-emerald-600 transition-colors"
                                        >
                                            Pay Invoice
                                        </a>
                                        <p className="text-[10px] text-slate-400 text-center mt-1">Apply payment in Org Billing Tab</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Fallback total when detail hasn't loaded */}
                    {!loading && !invoice && (
                        <div className="bg-slate-50 rounded-2xl p-4">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Total</p>
                            <p className="text-3xl font-black text-slate-900">{fmtMoney(display.totalAmount, display.currency)}</p>
                            <p className="text-xs text-slate-400 font-medium mt-1">Payment status: {display.paymentStatus || "—"}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PlatformInvoicesPage() {
    const { hasCapability, loading: capLoading } = usePlatformCapabilities();
    const [invoices, setInvoices] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [selected, setSelected] = useState(null);
    const [page, setPage] = useState(1);
    const [searchParams, setSearchParams] = useSearchParams();

    // ── Auto-open invoice from ?open=<id> (set by GlobalSearchBar navigation) ──
    useEffect(() => {
        const openId = searchParams.get("open");
        if (!openId) return;
        // Optimistically open modal with just the ID — InvoiceDetailModal
        // will fetch the full detail from GET /billing/invoices/:id.
        setSelected({ _id: openId });
        // Remove the query param so the URL stays clean and back button works
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.delete("open");
            return next;
        }, { replace: true });
    }, [searchParams, setSearchParams]);

    const load = useCallback(async (p = page) => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: p, limit: 50 });
            if (statusFilter) params.set("status", statusFilter);
            const res = await platformApi.get(`/billing/invoices?${params}`);
            const body = res.data;
            setInvoices(body.data || []);
            setPagination(body.pagination || { page: p, limit: 50, total: 0, pages: 1 });
        } catch (e) {
            setError(e?.response?.data?.error || e.message || "Failed to load invoices");
        } finally {
            setLoading(false);
        }
    }, [page, statusFilter]);

    useEffect(() => { load(page); }, [load, page, statusFilter]);

    const handleExport = () => {
        const params = new URLSearchParams();
        if (statusFilter) params.set("status", statusFilter);
        const token = getPlatformToken();
        window.open(`/api/platform/billing/invoices/export?${params}&token=${token}`, "_blank");
    };

    const filtered = invoices.filter(inv =>
        !search ||
        (inv.invoiceNumber || "").toLowerCase().includes(search.toLowerCase()) ||
        String(inv.organizationId || "").toLowerCase().includes(search.toLowerCase())
    );

    if (capLoading) return null;
    if (!hasCapability("VIEW_ORGANIZATIONS")) {
        return <PlatformUnauthorized capability="VIEW_ORGANIZATIONS" />;
    }

    return (
        <div className="max-w-7xl mx-auto space-y-6 px-4 py-6" id="invoices-page">
            {selected && (
                <InvoiceDetailModal
                    invoiceSummary={selected}
                    onClose={() => setSelected(null)}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-100 border border-blue-200 text-blue-700">
                        <FileText className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 tracking-tight">Invoices</h1>
                        <p className="text-sm text-slate-500 font-medium">{pagination.total} total records</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        id="invoices-search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search invoice # or org…"
                        className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    />
                </div>
                <select
                    id="invoices-status-filter"
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                    className="px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                    <option value="">All statuses</option>
                    {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
            </div>

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
                        <span className="text-sm font-medium">Loading…</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-16 text-center">
                        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-400 font-medium">No invoices found</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                {["Invoice #", "Organization", "Type", "Amount", "Currency", "Status", "Due Date"].map(h => (
                                    <th key={h} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filtered.map(inv => (
                                <tr
                                    key={inv._id}
                                    className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                                    onClick={() => setSelected(inv)}
                                >
                                    <td className="px-5 py-3.5 text-sm font-bold text-blue-700">
                                        {inv.invoiceNumber || inv._id?.slice(-8) || "—"}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {inv.orgName ? (
                                            <button
                                                onClick={e => { e.stopPropagation(); navigate(`/platform/organizations/${inv.organizationId}`); }}
                                                className="flex items-center gap-1.5 group"
                                            >
                                                <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600 truncate max-w-[130px] transition-colors">{inv.orgName}</span>
                                            </button>
                                        ) : (
                                            <span className="text-xs font-mono text-slate-400">{String(inv.organizationId || "").slice(-8)}</span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs text-slate-400 font-medium capitalize">
                                        {inv.invoiceType || "—"}
                                    </td>
                                    <td className="px-5 py-3.5 text-sm font-bold text-slate-800">
                                        {fmtMoney(inv.totalAmount, inv.currency)}
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-mono font-bold text-slate-500">
                                        {inv.currency || "—"}
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <StatusBadge status={inv.status} />
                                    </td>
                                    <td className="px-5 py-3.5 text-xs font-medium text-slate-500">
                                        {fmt(inv.dueDate)}
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
                        <button
                            disabled={page <= 1}
                            onClick={() => { setPage(p => p - 1); }}
                            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            disabled={page >= pagination.pages}
                            onClick={() => { setPage(p => p + 1); }}
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
