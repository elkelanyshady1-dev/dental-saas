/**
 * PaymentAttemptsPanel.jsx
 * v22.0 — Phase 4: Payment Attempts Panel
 *
 * Shows all PaymentAttempt records for a given invoice.
 * Columns: Attempt ID | Method | Amount | Status | Failure Reason | Date
 *
 * Used inside the expanded invoice row in InvoicePaymentTable,
 * and also as a standalone panel inside InvoiceFulfillmentLifecycle.
 *
 * PLANE: Platform
 */

import React from "react";
import {
    CreditCard, AlertTriangle, CheckCircle2,
    Clock, RotateCcw, XCircle, Loader2
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

// ─── Status definition ────────────────────────────────────────────────────────

function getStatusConfig(status) {
    const s = (status || "").toLowerCase();
    const map = {
        captured: { label: "Captured", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
        succeeded: { label: "Captured", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
        pending: { label: "Pending", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Clock },
        authorized: { label: "Authorized", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Clock },
        processing: { label: "Processing", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Loader2 },
        failed: { label: "Failed", cls: "bg-red-50 text-red-700 border-red-200", Icon: XCircle },
        refunded: { label: "Refunded", cls: "bg-violet-50 text-violet-700 border-violet-200", Icon: RotateCcw },
        partially_refunded: { label: "Partial Refund", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: RotateCcw },
        disputed: { label: "Disputed", cls: "bg-orange-50 text-orange-700 border-orange-200", Icon: AlertTriangle }
    };
    return map[s] || { label: status || "—", cls: "bg-slate-50 text-slate-500 border-slate-200", Icon: CreditCard };
}

// ─── Method badge ─────────────────────────────────────────────────────────────

function MethodBadge({ method }) {
    const icons = { cash: "💵", bank: "🏦", card: "💳", manual: "✍️", stripe: "⚡" };
    const m = method || "—";
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
            <span>{icons[m] || "💳"}</span>
            <span className="capitalize">{m}</span>
        </span>
    );
}

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }) {
    const { label, cls, Icon } = getStatusConfig(status);
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wide ${cls}`}>
            <Icon className="w-3 h-3" />
            {label}
        </span>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PaymentAttemptsPanel({ payments = [], currency = "USD", compact = false }) {

    if (payments.length === 0) {
        return (
            <div className={`${compact ? "py-3 px-4" : "rounded-2xl border border-slate-100 bg-white px-6 py-8"} text-center`}>
                <CreditCard className="w-6 h-6 text-slate-200 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-400">No payment attempts recorded</p>
                <p className="text-[10px] text-slate-300 mt-0.5">
                    Payment attempts will appear here when initiated
                </p>
            </div>
        );
    }

    return (
        <div className={compact ? "" : "rounded-2xl border border-slate-100 bg-white overflow-hidden"}>
            {!compact && (
                <div className="px-5 py-3.5 border-b border-slate-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Payment Attempts
                        </span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">
                        {payments.length} attempt{payments.length !== 1 ? "s" : ""}
                    </span>
                </div>
            )}

            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            {["Attempt ID", "Method", "Amount", "Status", "Failure Reason", "Date"].map(h => (
                                <th key={h} className="px-4 py-2.5 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {payments.map((p, i) => {
                            const status = p.status || p.outcome || "pending";
                            const amt = p.amount ?? (p.amountMinor ? p.amountMinor / 100 : 0);
                            const cur_ = p.currency || currency;
                            const failMsg = p.failureReason || p.metadata?.failureReason || p.errorMessage || null;
                            const isFailed = ["failed", "declined"].includes(status.toLowerCase());

                            return (
                                <tr key={p._id || i}
                                    className={`transition-colors ${isFailed ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/40"}`}>
                                    {/* Attempt ID */}
                                    <td className="px-4 py-2.5">
                                        <span className="font-mono text-[10px] text-slate-500">
                                            …{String(p._id || i).slice(-8)}
                                        </span>
                                    </td>

                                    {/* Method */}
                                    <td className="px-4 py-2.5">
                                        <MethodBadge method={p.method || p.metadata?.method} />
                                    </td>

                                    {/* Amount */}
                                    <td className="px-4 py-2.5 font-bold text-slate-700">
                                        {cur(amt, cur_)}
                                    </td>

                                    {/* Status */}
                                    <td className="px-4 py-2.5">
                                        <StatusChip status={status} />
                                    </td>

                                    {/* Failure reason */}
                                    <td className="px-4 py-2.5 max-w-[180px]">
                                        {failMsg ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-medium">
                                                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                                <span className="truncate" title={failMsg}>{failMsg}</span>
                                            </span>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* Date */}
                                    <td className="px-4 py-2.5 text-[10px] text-slate-400 whitespace-nowrap">
                                        {fmt(p.createdAt)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
