/**
 * RefundHistoryTable.jsx
 * Section 4 — Refunds and Credits
 *
 * Displays refund payment attempts and current credit balance.
 * Columns: Refund ID | Invoice | Payment | Amount | Reason | Status | Created
 *
 * Statuses: requested | approved | processed | failed
 * (maps from platform payment status: refunded → processed)
 *
 * PLANE: Platform
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw, ExternalLink, DollarSign, ArrowUpRight } from "lucide-react";

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

// Map raw payment status → display status
function mapRefundStatus(payment) {
    const s = payment.status;
    if (s === "refunded") return "processed";
    if (s === "captured" && payment.metadata?.refundRequested) return "approved";
    return s || "requested";
}

const REFUND_STATUS_STYLES = {
    requested: "bg-blue-50 text-blue-700 border-blue-200",
    approved: "bg-amber-50 text-amber-700 border-amber-200",
    processed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    refunded: "bg-violet-50 text-violet-700 border-violet-200"
};

function RefundStatusChip({ status }) {
    const cls = REFUND_STATUS_STYLES[status] || "bg-slate-50 text-slate-500 border-slate-200";
    return (
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide ${cls}`}>
            {status}
        </span>
    );
}

// ─── Credit Balance Banner ─────────────────────────────────────────────────────

function CreditBalanceBanner({ creditBalance, currency }) {
    if (!creditBalance || creditBalance <= 0) return null;
    return (
        <div className="flex items-center gap-3 px-5 py-3 bg-emerald-50 border-b border-emerald-100">
            <DollarSign className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <div>
                <span className="text-xs font-black text-emerald-700">Credit Balance Available: </span>
                <span className="text-sm font-black text-emerald-600">{cur(creditBalance, currency)}</span>
            </div>
            <span className="text-[10px] text-emerald-500 font-medium ml-auto">Applied automatically to next invoice</span>
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function RefundHistoryTable({ payments = [], summary, currency = "USD" }) {
    const navigate = useNavigate();

    // Filter to refunded payments only
    const refunds = payments.filter(p =>
        p.status === "refunded" ||
        p.status === "partially_refunded" ||
        p.metadata?.refundRequested === true
    );

    const creditBalance = summary?.creditBalance;

    return (
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4 text-slate-400" />
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Refunds & Credits</h3>
                </div>
                {refunds.length > 0 && (
                    <span className="text-xs font-bold text-slate-400">{refunds.length} refund(s)</span>
                )}
            </div>

            {/* Credit balance banner */}
            <CreditBalanceBanner creditBalance={creditBalance} currency={currency} />

            {/* Table or empty state */}
            {refunds.length === 0 ? (
                <div className="px-6 py-10 text-center">
                    <RotateCcw className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm font-bold text-slate-400">No refunds on record</p>
                    {creditBalance > 0 ? (
                        <p className="text-xs text-emerald-500 mt-1 font-medium">
                            Credit balance of {cur(creditBalance, currency)} available
                        </p>
                    ) : (
                        <p className="text-xs text-slate-300 mt-1">Refunds appear here when processed</p>
                    )}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                {["Refund ID", "Invoice", "Original Payment", "Amount", "Reason", "Status", "Created"].map(h => (
                                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {refunds.map((p, i) => {
                                const refundId = String(p._id || i);
                                const displayStatus = mapRefundStatus(p);
                                const reason = p.metadata?.refundReason || p.metadata?.reason || "—";
                                const invoiceId = String(p.invoiceId || "");

                                return (
                                    <tr key={refundId} className="hover:bg-slate-50/60 transition-colors">
                                        {/* Refund ID */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <RotateCcw className="w-3 h-3 text-violet-400 flex-shrink-0" />
                                                <span className="text-[10px] font-mono text-slate-500">
                                                    …{refundId.slice(-8)}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Invoice link */}
                                        <td className="px-4 py-3">
                                            {invoiceId ? (
                                                <button
                                                    onClick={() => navigate(`/platform/billing/invoices?open=${invoiceId}`)}
                                                    className="flex items-center gap-1 text-[10px] font-mono text-indigo-600 hover:text-indigo-800 transition-colors"
                                                >
                                                    …{invoiceId.slice(-8)}
                                                    <ArrowUpRight className="w-2.5 h-2.5" />
                                                </button>
                                            ) : (
                                                <span className="text-slate-300 text-xs">—</span>
                                            )}
                                        </td>

                                        {/* Original payment ref */}
                                        <td className="px-4 py-3">
                                            <span className="text-[10px] font-mono text-slate-400">
                                                {p.transactionRef || p.providerPaymentId
                                                    ? `…${(p.transactionRef || p.providerPaymentId || "").slice(-8)}`
                                                    : "—"}
                                            </span>
                                        </td>

                                        {/* Amount */}
                                        <td className="px-4 py-3">
                                            <span className="font-black text-violet-600 text-xs">
                                                {cur(p.amount, p.currency || currency)}
                                            </span>
                                        </td>

                                        {/* Reason */}
                                        <td className="px-4 py-3 max-w-[160px]">
                                            <span className="text-xs text-slate-500 truncate block" title={reason}>{reason}</span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3">
                                            <RefundStatusChip status={displayStatus} />
                                        </td>

                                        {/* Created */}
                                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
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
    );
}
