/**
 * InvoicePaymentTable.jsx
 * Section 3 — Invoices and Payments
 *
 * Unified invoice table with expandable payment rows.
 * Columns: Invoice ID | Billing Date | Amount | Amount Paid | Method | Status
 * Expanding an invoice row reveals its associated payment attempts.
 *
 * PLANE: Platform
 */

import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
    ChevronDown, ChevronRight, FileText, CreditCard,
    ExternalLink, AlertTriangle, CheckCircle2, Loader2
} from "lucide-react";
import InvoiceFulfillmentLifecycle from "./InvoiceFulfillmentLifecycle";
import PaymentAttemptsPanel from "./PaymentAttemptsPanel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—";

const cur = (val, currency = "USD") => {
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val || 0);
    } catch {
        return `${currency} ${(val || 0).toFixed(2)}`;
    }
};

// ─── Status Chips ──────────────────────────────────────────────────────────────

const INVOICE_STATUS_STYLES = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    open: "bg-blue-50 text-blue-700 border-blue-200",
    issued: "bg-blue-50 text-blue-700 border-blue-200",
    partial: "bg-amber-50 text-amber-700 border-amber-200",
    overdue: "bg-red-50 text-red-700 border-red-200",
    processing: "bg-indigo-50 text-indigo-700 border-indigo-200",
    void: "bg-slate-100 text-slate-500 border-slate-200",
    uncollectible: "bg-red-100 text-red-600 border-red-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    draft: "bg-slate-50 text-slate-400 border-slate-100"
};

const PAYMENT_STATUS_STYLES = {
    captured: "bg-emerald-50 text-emerald-700",
    pending: "bg-blue-50 text-blue-700",
    failed: "bg-red-50 text-red-700",
    refunded: "bg-violet-50 text-violet-700",
    partially_refunded: "bg-amber-50 text-amber-700"
};

function StatusChip({ status, map = INVOICE_STATUS_STYLES }) {
    const isProcessing = status === "processing";
    const cls = map[status] || "bg-slate-50 text-slate-500 border-slate-200";
    return (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide inline-flex items-center gap-1 ${cls}`}>
            {isProcessing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
            {status || "—"}
        </span>
    );
}

function MethodBadge({ method }) {
    if (!method) return <span className="text-slate-300 text-xs">—</span>;
    const icons = { cash: "💵", bank: "🏦", card: "💳", manual: "✍️" };
    return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
            <span>{icons[method] || "💳"}</span> {method}
        </span>
    );
}

// ─── Expanded Detail Panel ───────────────────────────────────────────────────────────────

function ExpandedInvoicePanel({ invoice, payments }) {
    return (
        <tr>
            <td colSpan={7} className="p-0">
                <div className="px-4 py-4 bg-slate-50/60 border-t border-slate-100 space-y-3">
                    {/* Fulfillment lifecycle tracker */}
                    <InvoiceFulfillmentLifecycle invoice={invoice} payments={payments} />
                    {/* Payment attempts detail table */}
                    <PaymentAttemptsPanel
                        payments={payments}
                        currency={invoice.currency || "USD"}
                        compact={false}
                    />
                </div>
            </td>
        </tr>
    );
}

// ─── Payment Sub-Row ───────────────────────────────────────────────────────────

function PaymentRows({ payments }) {
    if (!payments || payments.length === 0) {
        return (
            <tr>
                <td colSpan={7} className="px-6 py-3 text-xs text-slate-400 italic bg-slate-50/60">
                    No payment attempts recorded for this invoice.
                </td>
            </tr>
        );
    }

    return payments.map((p, i) => (
        <tr key={p._id || i} className="bg-slate-50/70 border-t border-slate-100">
            <td className="pl-12 pr-3 py-2.5">
                <div className="flex items-center gap-1.5">
                    <CreditCard className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span className="text-[10px] font-mono text-slate-500">
                        {String(p._id || "").slice(-8)}
                    </span>
                </div>
            </td>
            <td className="px-3 py-2.5 text-[11px] text-slate-500">{fmt(p.createdAt)}</td>
            <td className="px-3 py-2.5 text-[11px] font-bold text-slate-700">{cur(p.amount, p.currency)}</td>
            <td className="px-3 py-2.5 text-[11px] text-slate-400">—</td>
            <td className="px-3 py-2.5"><MethodBadge method={p.method || p.metadata?.method} /></td>
            <td className="px-3 py-2.5" colSpan={2}>
                <StatusChip status={p.status} map={PAYMENT_STATUS_STYLES} />
            </td>
        </tr>
    ));
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function InvoicePaymentTable({
    invoices = [],
    payments = [],
    onPayInvoice,
    canManage = false
}) {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(new Set());

    // Group payments by invoiceId
    const paymentsByInvoice = useMemo(() => {
        const map = {};
        payments.forEach(p => {
            const key = String(p.invoiceId || "");
            if (key) {
                if (!map[key]) map[key] = [];
                map[key].push(p);
            }
        });
        return map;
    }, [payments]);

    const toggle = (id) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    if (invoices.length === 0) {
        return (
            <div className="rounded-2xl border border-slate-100 bg-white px-6 py-10 text-center">
                <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-400">No invoices found</p>
                <p className="text-xs text-slate-300 mt-1">Invoices will appear here when generated</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Invoices & Payments</h3>
                </div>
                <span className="text-xs font-bold text-slate-400">{invoices.length} invoice(s)</span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            {["Invoice ID", "Billing Date", "Amount", "Amount Paid", "Method", "Status", ""].map(h => (
                                <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {invoices.map((inv) => {
                            const id = String(inv._id);
                            const isExpanded = expanded.has(id);
                            const invPayments = paymentsByInvoice[id] || [];
                            const currency = inv.currency || "USD";
                            const payable = ["open", "issued", "partial", "overdue"].includes(inv.status);

                            // Determine dominant method from payments
                            const dominantMethod = invPayments[0]?.method || invPayments[0]?.metadata?.method || null;

                            return (
                                <React.Fragment key={id}>
                                    <tr
                                        className={`hover:bg-slate-50/60 transition-colors cursor-pointer ${isExpanded ? "bg-indigo-50/20" : ""}`}
                                        onClick={() => toggle(id)}
                                    >
                                        {/* Expand toggle + Invoice ID */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    className="text-slate-400 hover:text-indigo-600 transition-colors flex-shrink-0"
                                                    onClick={(e) => { e.stopPropagation(); toggle(id); }}
                                                    aria-label={isExpanded ? "Collapse" : "Expand"}
                                                >
                                                    {isExpanded
                                                        ? <ChevronDown className="w-3.5 h-3.5" />
                                                        : <ChevronRight className="w-3.5 h-3.5" />}
                                                </button>
                                                <span className="text-xs font-mono text-slate-500">
                                                    {inv.invoiceNumber || `…${id.slice(-8)}`}
                                                </span>
                                                {invPayments.length > 0 && (
                                                    <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-1.5 rounded-full">
                                                        {invPayments.length}p
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-600">{fmt(inv.issuedAt || inv.createdAt)}</td>
                                        <td className="px-4 py-3 font-black text-slate-800 text-xs">{cur(inv.totalAmount, currency)}</td>
                                        <td className="px-4 py-3 text-xs">
                                            <span className={`font-black ${(inv.amountPaid || 0) > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                                                {cur(inv.amountPaid || 0, currency)}
                                            </span>
                                            {(inv.amountRemaining || 0) > 0 && (
                                                <span className="ml-1 text-[10px] text-orange-500 font-bold">
                                                    ({cur(inv.amountRemaining, currency)} left)
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <MethodBadge method={dominantMethod} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusChip status={inv.status} />
                                        </td>
                                        {/* Actions column */}
                                        <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                                            <div className="flex items-center gap-2">
                                                {payable && canManage && onPayInvoice && (
                                                    <button
                                                        id={`btn-pay-invoice-${id}`}
                                                        onClick={() => onPayInvoice(inv)}
                                                        className="text-[10px] font-black px-2.5 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                                                    >
                                                        Pay
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => navigate(`/platform/billing/invoices?open=${id}`)}
                                                    className="text-slate-400 hover:text-indigo-600 transition-colors"
                                                    title="View invoice detail"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Expanded payment panel (v22.0: lifecycle + attempts table) */}
                                    {isExpanded && (
                                        <ExpandedInvoicePanel
                                            invoice={inv}
                                            payments={invPayments}
                                        />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
