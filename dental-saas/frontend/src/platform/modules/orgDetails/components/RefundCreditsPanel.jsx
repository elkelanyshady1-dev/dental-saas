/**
 * RefundCreditsPanel.jsx
 * Section 4 of OrgFinancialControl
 *
 * Displays:
 *   - Current Credit Balance (always visible)
 *   - Credits Applied to Invoices
 *   - Full Refund History table
 *
 * Columns: Refund ID | Invoice | Payment | Amount | Reason | Status | Created
 * Statuses: requested | approved | processing | completed | failed
 *
 * PLANE: Platform
 */

import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
    RotateCcw, DollarSign, ArrowUpRight,
    CheckCircle2, Clock, XCircle, Loader2, CreditCard
} from "lucide-react";

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

// ─── Refund status mapping ────────────────────────────────────────────────────

function mapStatus(payment) {
    const s = payment.status;
    if (s === "refunded") return "completed";
    if (s === "partially_refunded") return "completed";
    if (s === "captured" && payment.metadata?.refundRequested) return "approved";
    if (s === "processing") return "processing";
    if (s === "failed") return "failed";
    return "requested";
}

const STATUS_CONFIG = {
    requested: { label: "Requested", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Clock },
    approved: { label: "Approved", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
    processing: { label: "Processing", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Loader2 },
    completed: { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    failed: { label: "Failed", cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
};

function StatusChip({ rawStatus }) {
    const key = rawStatus in STATUS_CONFIG ? rawStatus : "requested";
    const { label, cls, Icon } = STATUS_CONFIG[key];
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide ${cls}`}>
            <Icon className="w-2.5 h-2.5" />
            {label}
        </span>
    );
}

// ─── Credit Balance Card ──────────────────────────────────────────────────────

function CreditCard_({ creditBalance, currency, credits = [] }) {
    const appliedTotal = credits.reduce((s, c) => s + (c.amount || 0), 0);
    return (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
            {/* Only show account credit card when there IS actual credit */}
            {creditBalance > 0 && (
                <div className="flex-1 flex items-center gap-3 px-5 py-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Credit</p>
                        <p className="text-xl font-black text-emerald-700">{cur(creditBalance, currency)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Applied automatically to next invoice</p>
                    </div>
                </div>
            )}
            {appliedTotal > 0 && (
                <div className="flex-1 flex items-center gap-3 px-5 py-4 rounded-2xl bg-blue-50 border border-blue-200">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
                        <RotateCcw className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Credits Applied</p>
                        <p className="text-xl font-black text-blue-700">{cur(appliedTotal, currency)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Applied to {credits.length} invoice(s)</p>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function RefundCreditsPanel({ payments = [], summary, currency = "USD", credits = [] }) {
    const navigate = useNavigate();
    const creditBalance = summary?.creditBalance ?? 0;

    const refunds = useMemo(() =>
        payments.filter(p =>
            p.status === "refunded" ||
            p.status === "partially_refunded" ||
            p.metadata?.refundRequested === true
        )
        , [payments]);

    return (
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-violet-50 rounded-xl flex items-center justify-center ring-1 ring-violet-100">
                        <RotateCcw className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Refunds & Credits</p>
                        <p className="text-xs font-bold text-slate-500">{refunds.length} refund(s)</p>
                    </div>
                </div>
            </div>

            <div className="p-5">
                {/* Credit balance cards */}
                <CreditCard_ creditBalance={creditBalance} currency={currency} credits={credits} />

                {/* Refund table */}
                {refunds.length === 0 ? (
                    <div className="py-8 text-center rounded-2xl border border-slate-50 bg-slate-50/50">
                        <RotateCcw className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                        <p className="text-sm font-bold text-slate-400">No refunds on record</p>
                        <p className="text-xs text-slate-300 mt-1">Refunds appear here when processed</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    {["Refund ID", "Invoice", "Payment Ref", "Amount", "Reason", "Status", "Created"].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {refunds.map((p, i) => {
                                    const refundId = String(p._id || i);
                                    const invoiceId = String(p.invoiceId || "");
                                    const reason = p.metadata?.refundReason || p.metadata?.reason || "—";
                                    const txRef = p.transactionRef || p.providerPaymentId || "";
                                    const status = mapStatus(p);

                                    return (
                                        <tr key={refundId} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    <RotateCcw className="w-3 h-3 text-violet-400" />
                                                    <span className="text-[10px] font-mono text-slate-500">…{refundId.slice(-8)}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {invoiceId ? (
                                                    <button
                                                        onClick={() => navigate(`/platform/billing/invoices?open=${invoiceId}`)}
                                                        className="flex items-center gap-1 text-[10px] font-mono text-indigo-600 hover:text-indigo-800 transition-colors"
                                                    >
                                                        …{invoiceId.slice(-8)}
                                                        <ArrowUpRight className="w-2.5 h-2.5" />
                                                    </button>
                                                ) : <span className="text-slate-300 text-xs">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[10px] font-mono text-slate-400">
                                                    {txRef ? `…${txRef.slice(-8)}` : "—"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="font-black text-violet-600 text-xs">
                                                        {cur(p.amount, p.currency || currency)}
                                                    </span>
                                                    {/* Clearly label card refunds vs account credits */}
                                                    <span className="flex items-center gap-1 text-[9px] text-slate-400 font-medium">
                                                        <CreditCard className="w-2.5 h-2.5" />
                                                        to card
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 max-w-[140px]">
                                                <span className="text-xs text-slate-500 truncate block" title={reason}>{reason}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusChip rawStatus={status} />
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                                                {fmt(p.createdAt)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
