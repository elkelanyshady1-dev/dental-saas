/**
 * InvoicePaymentsPanel.jsx
 * Section 3 of OrgFinancialControl
 *
 * Unified invoice table with expandable rows showing:
 *  - Fulfillment lifecycle tracker
 *  - Payment attempts with transaction IDs, provider refs, timestamps
 *
 * Actions per row:
 *  - Pay Invoice  (when payable)
 *  - Refund Invoice (when status === "paid")
 *  - Void Invoice (when amountPaid === 0)
 *
 * PLANE: Platform
 */

import React, { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    ChevronDown, ChevronRight, FileText, CreditCard,
    ExternalLink, DollarSign, RotateCcw, XCircle,
    Loader2, AlertTriangle, Hash, CheckCircle2
} from "lucide-react";
import InvoiceFulfillmentLifecycle from "./InvoiceFulfillmentLifecycle";
import PaymentAttemptsPanel from "./PaymentAttemptsPanel";
// Section 6: Use shared money utility — eliminates floating-point display artifacts
import { fmtMoney, roundCurrency } from "../../../../utils/money";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—";

// Section 6: fmtMoney replaces the local cur() helper.
// Intl.NumberFormat + roundCurrency ensures 3647.09 not 3647.0899999999997.

// ─── Status chip ──────────────────────────────────────────────────────────────

const STATUS_STYLES = {
    paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    open: "bg-blue-50 text-blue-700 border-blue-200",
    issued: "bg-blue-50 text-blue-700 border-blue-200",
    partial: "bg-amber-50 text-amber-700 border-amber-200",
    overdue: "bg-red-50 text-red-700 border-red-200",
    processing: "bg-indigo-50 text-indigo-700 border-indigo-200",
    void: "bg-slate-100 text-slate-500 border-slate-200",
    uncollectible: "bg-red-100 text-red-600 border-red-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    draft: "bg-slate-50 text-slate-400 border-slate-100",
};

function InvoiceStatusChip({ status }) {
    const isProcessing = status === "processing";
    const cls = STATUS_STYLES[status] || "bg-slate-50 text-slate-500 border-slate-200";
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide ${cls}`}>
            {isProcessing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
            {status || "—"}
        </span>
    );
}

function MethodBadge({ method }) {
    const icons = { cash: "💵", bank: "🏦", card: "💳", manual: "✍️" };
    if (!method) return <span className="text-slate-300 text-xs">—</span>;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
            <span>{icons[method] || "💳"}</span>
            <span className="capitalize">{method}</span>
        </span>
    );
}

// ─── Action buttons ───────────────────────────────────────────────────────────

function RowActions({ invoice, canManage, onPay, onRefund, onVoid }) {
    const payable = ["open", "issued", "partial", "overdue"].includes(invoice.status);
    const refundable = invoice.status === "paid";
    const voidable = (invoice.amountPaid ?? 0) === 0 &&
        !["void", "paid"].includes(invoice.status);

    if (!canManage) return null;

    return (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            {payable && onPay && (
                <button
                    id={`btn-pay-invoice-${invoice._id}`}
                    onClick={() => onPay(invoice)}
                    className="text-[10px] font-black px-2 py-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
                    title="Apply payment"
                >
                    Pay
                </button>
            )}
            {refundable && onRefund && (
                <button
                    id={`btn-refund-invoice-${invoice._id}`}
                    onClick={() => onRefund(invoice)}
                    className="text-[10px] font-black px-2 py-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 transition-colors"
                    title="Refund invoice"
                >
                    Refund
                </button>
            )}
            {voidable && onVoid && (
                <button
                    id={`btn-void-invoice-${invoice._id}`}
                    onClick={() => onVoid(invoice)}
                    className="text-[10px] font-black px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                    title="Void invoice (only if unpaid)"
                >
                    Void
                </button>
            )}
        </div>
    );
}

// ─── Expanded detail panel ────────────────────────────────────────────────────

function ExpandedPanel({ invoice, payments }) {
    return (
        <tr>
            <td colSpan={8} className="p-0">
                <div className="px-4 py-4 bg-slate-50/60 border-t border-slate-100 space-y-3">
                    <InvoiceFulfillmentLifecycle invoice={invoice} payments={payments} />
                    <PaymentAttemptsPanel payments={payments} currency={invoice.currency || "USD"} />
                </div>
            </td>
        </tr>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InvoicePaymentsPanel({
    invoices = [],
    payments = [],
    canManage = false,
    onPayInvoice,
    onRefundInvoice,
    onVoidInvoice,
}) {
    const navigate = useNavigate();
    const [expanded, setExpanded] = useState(new Set());
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    const paymentsByInvoice = useMemo(() => {
        const map = {};
        payments.forEach(p => {
            const key = String(p.invoiceId || "");
            if (key) { if (!map[key]) map[key] = []; map[key].push(p); }
        });
        return map;
    }, [payments]);

    const toggle = useCallback((id) => {
        setExpanded(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    if (invoices.length === 0) {
        return (
            <div className="rounded-2xl border border-slate-100 bg-white px-6 py-12 text-center">
                <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-400">No invoices</p>
                <p className="text-xs text-slate-300 mt-1">Invoices appear here when generated by the billing engine</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center ring-1 ring-indigo-100">
                        <FileText className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoices & Payments</p>
                        <p className="text-xs font-bold text-slate-500">{invoices.length} invoice(s)</p>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            {["Invoice #", "Billing Date", "Total", "Paid", "Remaining", "Method", "Status", "Actions"].map(h => (
                                <th key={h} className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {invoices.map(inv => {
                            const id = String(inv._id);
                            const isExpanded = expanded.has(id);
                            const invPay = paymentsByInvoice[id] || [];
                            const currency = inv.currency || "USD";
                            // Section 7: roundCurrency prevents floating-point artifacts
                            // in the remaining amount shown in the table and passed to onPay
                            const remaining = roundCurrency(
                                inv.amountRemaining ?? Math.max(0, (inv.totalAmount || 0) - (inv.amountPaid || 0))
                            );
                            const method = invPay[0]?.method || invPay[0]?.metadata?.method || null;

                            return (
                                <React.Fragment key={id}>
                                    <tr
                                        className={`hover:bg-slate-50/60 transition-colors cursor-pointer ${isExpanded ? "bg-indigo-50/20" : ""}`}
                                        onClick={() => toggle(id)}
                                    >
                                        {/* Invoice number + expand */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    className="text-slate-400 hover:text-indigo-600 transition-colors"
                                                    onClick={e => { e.stopPropagation(); toggle(id); }}
                                                >
                                                    {isExpanded
                                                        ? <ChevronDown className="w-3.5 h-3.5" />
                                                        : <ChevronRight className="w-3.5 h-3.5" />}
                                                </button>
                                                <span className="text-[11px] font-mono text-slate-600">
                                                    {inv.invoiceNumber || `…${id.slice(-8)}`}
                                                </span>
                                                {invPay.length > 0 && (
                                                    <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-1.5 rounded-full">
                                                        {invPay.length}p
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Billing Date */}
                                        <td className="px-4 py-3 text-xs text-slate-500">{fmt(inv.issuedAt || inv.createdAt)}</td>

                                        {/* Total */}
                                        <td className="px-4 py-3 text-xs font-black text-slate-800">{fmtMoney(inv.totalAmount, currency)}</td>

                                        {/* Paid */}
                                        <td className="px-4 py-3 text-xs">
                                            <span className={`font-black ${(inv.amountPaid || 0) > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                                                {fmtMoney(inv.amountPaid || 0, currency)}
                                            </span>
                                        </td>

                                        {/* Remaining */}
                                        <td className="px-4 py-3 text-xs">
                                            {remaining > 0
                                                ? <span className="font-black text-orange-500">{fmtMoney(remaining, currency)}</span>
                                                : <span className="text-slate-300">—</span>}
                                        </td>

                                        {/* Method */}
                                        <td className="px-4 py-3"><MethodBadge method={method} /></td>

                                        {/* Status */}
                                        <td className="px-4 py-3"><InvoiceStatusChip status={inv.status} /></td>

                                        {/* Actions */}
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <RowActions
                                                    invoice={inv}
                                                    canManage={canManage}
                                                    onPay={onPayInvoice}
                                                    onRefund={onRefundInvoice}
                                                    onVoid={onVoidInvoice}
                                                />
                                                <button
                                                    onClick={e => { e.stopPropagation(); navigate(`/platform/billing/invoices?open=${id}`); }}
                                                    className="text-slate-400 hover:text-indigo-600 transition-colors"
                                                    title="View full invoice"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Expanded: lifecycle + payment attempts */}
                                    {isExpanded && <ExpandedPanel invoice={inv} payments={invPay} />}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
