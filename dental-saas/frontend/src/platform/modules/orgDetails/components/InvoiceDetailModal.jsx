/**
 * InvoiceDetailModal.jsx
 * Section 8 of OrgFinancialControl
 *
 * Full-detail modal for a single invoice.
 * Shows: line items, payments, refunds, lifecycle status.
 * Actions: Refund Invoice, Void Invoice, Download PDF.
 *
 * PLANE: Platform
 */

import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    X, FileText, Download, Printer, RotateCcw,
    XCircle, CheckCircle2, AlertCircle, CreditCard,
    Calendar, Hash, DollarSign, ExternalLink, Loader2
} from "lucide-react";
import InvoiceFulfillmentLifecycle from "./InvoiceFulfillmentLifecycle";
import PaymentAttemptsPanel from "./PaymentAttemptsPanel";
// Section 11: Use shared money utility — eliminates floating-point display artifacts
import { fmtMoney } from "../../../../utils/money";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—";

// Section 11: fmtMoney replaces local cur() — roundCurrency + Intl.NumberFormat
// ensures 3647.09 is displayed, not 3647.0899999999997


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
    refunded: "bg-violet-50 text-violet-700 border-violet-200",
};

function StatusChip({ status }) {
    const isProcessing = status === "processing";
    const cls = STATUS_STYLES[status] || "bg-slate-50 text-slate-500 border-slate-200";
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full border uppercase tracking-wide ${cls}`}>
            {isProcessing && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
            {status || "—"}
        </span>
    );
}

// ─── Line Items Table ────────────────────────────────────────────────────────

function LineItemsSection({ lineItems = [], currency }) {
    if (!lineItems || lineItems.length === 0) {
        return (
            <div className="py-4 text-center text-xs text-slate-400">
                No line items recorded
            </div>
        );
    }
    return (
        <table className="w-full text-xs">
            <thead className="bg-slate-50">
                <tr>
                    {["Description", "Qty", "Unit Price", "Total"].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {lineItems.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                        <td className="px-3 py-2.5 font-medium text-slate-700">{item.description || item.label || "—"}</td>
                        <td className="px-3 py-2.5 text-slate-500">{item.quantity ?? 1}</td>
                        <td className="px-3 py-2.5 text-slate-500">{cur(item.unitPrice ?? item.amount, currency)}</td>
                        <td className="px-3 py-2.5 font-black text-slate-800">{fmtMoney(item.total ?? ((item.unitPrice ?? item.amount) * (item.quantity ?? 1)), currency)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ModalAction({ icon: Icon, label, onClick, variant = "slate", loading }) {
    const variants = {
        slate: "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
        violet: "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100",
        red: "bg-red-50 border-red-200 text-red-600 hover:bg-red-100",
        emerald: "bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600",
        indigo: "bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100",
    };
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 ${variants[variant]}`}
        >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
            {label}
        </button>
    );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionTitle({ children }) {
    return (
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{children}</p>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InvoiceDetailModal({ invoice, payments = [], onClose, onRefund, onVoid, canManage }) {
    const navigate = useNavigate();
    const [actionLoading, setActionLoading] = useState(false);

    if (!invoice) return null;

    const currency = invoice.currency || "USD";
    const isPaid = invoice.status === "paid";
    const isVoidable = (invoice.amountPaid ?? 0) === 0 && !["void", "paid"].includes(invoice.status);
    const invoiceId = String(invoice._id);

    // Detect refund state
    const isRefunded =
        invoice.paymentStatus === "refunded" ||
        invoice.paymentStatus === "partially_refunded" ||
        invoice.status === "refunded";
    // When refunded, processor zeroes amountPaid — recover original amount from totalAmount or invoice.refundedAmount
    const refundedAmount = invoice.refundedAmount ??
        (isRefunded && (invoice.amountPaid ?? 0) === 0 ? invoice.totalAmount : null);

    // Filter payments for this invoice
    const invPayments = payments.filter(p => String(p.invoiceId) === invoiceId);
    const refunds = invPayments.filter(p => ["refunded", "partially_refunded"].includes(p.status));

    const handlePDF = (mode) => {
        window.open(`/api/platform/billing/invoices/${invoiceId}/pdf?mode=${mode}`, "_blank");
    };

    const handlePrint = () => {
        const url = `/api/platform/billing/invoices/${invoiceId}/pdf?mode=inline`;
        const w = window.open(url, "_blank");
        if (w) { w.addEventListener("load", () => { w.print(); }, false); }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center ring-1 ring-indigo-100">
                            <FileText className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Invoice Detail</p>
                            <p className="text-sm font-black text-slate-800">
                                {invoice.invoiceNumber || `…${invoiceId.slice(-10)}`}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <StatusChip status={invoice.status} />
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                    {/* Meta grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { icon: Calendar, label: "Issued", value: fmt(invoice.issuedAt || invoice.createdAt) },
                            { icon: Calendar, label: "Due Date", value: fmt(invoice.dueDate) },
                            { icon: DollarSign, label: "Total", value: fmtMoney(invoice.totalAmount, currency) },
                            // For refunded invoices, show 'Refunded' instead of 'Paid: 0'
                            isRefunded && refundedAmount > 0
                                ? { icon: RotateCcw, label: "Refunded to Card", value: fmtMoney(refundedAmount, currency) }
                                : { icon: DollarSign, label: "Paid", value: fmtMoney(invoice.amountPaid || 0, currency) },
                            // Suppress 'Remaining' for refunded invoices — it's misleading (processor sets it to totalAmount)
                            isRefunded && refundedAmount > 0
                                ? { icon: CheckCircle2, label: "Settled", value: "Refund Complete" }
                                : { icon: DollarSign, label: "Remaining", value: fmtMoney(invoice.amountRemaining ?? Math.max(0, (invoice.totalAmount || 0) - (invoice.amountPaid || 0)), currency) },
                            { icon: Hash, label: "Tax", value: fmtMoney(invoice.tax || 0, currency) },
                            { icon: Hash, label: "Currency", value: currency },
                            { icon: Calendar, label: "Paid At", value: fmt(invoice.paidAt) },
                        ].map(({ icon: Icon, label, value }) => (
                            <div key={label} className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <Icon className="w-3 h-3 text-slate-400" />
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                                </div>
                                <p className={`text-sm font-black ${label === "Refunded to Card" ? "text-violet-700" :
                                        label === "Settled" ? "text-emerald-600" :
                                            "text-slate-700"
                                    }`}>{value}</p>
                            </div>
                        ))}
                    </div>

                    {/* Fulfillment lifecycle */}
                    <div>
                        <SectionTitle>Fulfillment Lifecycle</SectionTitle>
                        <InvoiceFulfillmentLifecycle invoice={invoice} payments={invPayments} />
                    </div>

                    {/* Line items */}
                    <div>
                        <SectionTitle>Line Items</SectionTitle>
                        <div className="rounded-2xl border border-slate-100 overflow-hidden">
                            <LineItemsSection lineItems={invoice.lineItems} currency={currency} />

                            {/* Totals footer */}
                            <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 space-y-1">
                                {invoice.subtotal != null && (
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">Subtotal</span>
                                        <span className="font-bold text-slate-700">{fmtMoney(invoice.subtotal, currency)}</span>
                                    </div>
                                )}
                                {(invoice.tax || 0) > 0 && (
                                    <div className="flex justify-between text-xs">
                                        <span className="text-slate-500">Tax</span>
                                        <span className="font-bold text-slate-700">{fmtMoney(invoice.tax, currency)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-200">
                                    <span className="text-slate-700">Total</span>
                                    <span className="text-slate-900">{fmtMoney(invoice.totalAmount, currency)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Payment attempts */}
                    <div>
                        <SectionTitle>Payment Attempts ({invPayments.length})</SectionTitle>
                        <PaymentAttemptsPanel payments={invPayments} currency={currency} />
                    </div>

                    {/* Refunds */}
                    {refunds.length > 0 && (
                        <div>
                            <SectionTitle>Refunds ({refunds.length})</SectionTitle>
                            <div className="space-y-2">
                                {refunds.map((r, i) => (
                                    <div key={r._id || i} className="flex items-center justify-between px-4 py-3 rounded-xl bg-violet-50 border border-violet-100">
                                        <div className="flex items-center gap-2">
                                            <RotateCcw className="w-3.5 h-3.5 text-violet-500" />
                                            <span className="text-[10px] font-mono text-slate-500">…{String(r._id || "").slice(-8)}</span>
                                            {r.metadata?.refundReason && (
                                                <span className="text-xs text-slate-400">— {r.metadata.refundReason}</span>
                                            )}
                                        </div>
                                        <span className="text-xs font-black text-violet-700">{fmtMoney(r.amount, r.currency || currency)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0 flex-wrap">
                    {/* PDF / Print */}
                    <div className="flex items-center gap-2">
                        <ModalAction icon={FileText} label="View PDF" onClick={() => handlePDF("inline")} variant="indigo" />
                        <ModalAction icon={Download} label="Download" onClick={() => handlePDF("download")} variant="slate" />
                        <ModalAction icon={Printer} label="Print" onClick={handlePrint} variant="slate" />
                    </div>

                    {/* Admin actions */}
                    {canManage && (
                        <div className="flex items-center gap-2 flex-wrap">
                            {isPaid && onRefund && (
                                <ModalAction
                                    icon={RotateCcw}
                                    label="Refund Invoice"
                                    onClick={() => onRefund(invoice)}
                                    variant="violet"
                                    loading={actionLoading}
                                />
                            )}
                            {isVoidable && onVoid && (
                                <ModalAction
                                    icon={XCircle}
                                    label="Void Invoice"
                                    onClick={() => onVoid(invoice)}
                                    variant="red"
                                    loading={actionLoading}
                                />
                            )}
                            <button
                                onClick={() => navigate(`/platform/billing/invoices?open=${invoiceId}`)}
                                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-bold transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Full Invoice Page
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
