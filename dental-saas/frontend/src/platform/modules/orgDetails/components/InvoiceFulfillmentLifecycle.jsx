/**
 * InvoiceFulfillmentLifecycle.jsx
 * v22.0 — Phase 4: Invoice Fulfillment Lifecycle Visualizer
 *
 * Renders a horizontal step-by-step lifecycle tracker for an invoice,
 * from creation through payment capture to optional refund.
 *
 * Steps:
 *   1. Invoice Created
 *   2. Payment Attempt
 *   3. Payment Captured
 *   4. Invoice Paid
 *   5. Refund Issued  (visible only when refunded)
 *
 * Active step is derived from the invoice status and payment data.
 *
 * PLANE: Platform
 */

import React, { useMemo } from "react";
import {
    FileText, CreditCard, CheckCircle2,
    CircleDollarSign, CornerDownLeft, Loader2
} from "lucide-react";

// ─── Step definitions ─────────────────────────────────────────────────────────

function buildSteps(invoice, payments = []) {
    const status = invoice?.status || "draft";
    const hasPayments = payments.length > 0;
    const hasCaptured = payments.some(p => ["captured", "partially_refunded", "refunded"].includes(p.status || p.outcome));
    const isRefunded = ["refunded", "partially_refunded"].includes(invoice?.paymentStatus)
        || payments.some(p => ["refunded", "partially_refunded"].includes(p.status || p.outcome));
    const isProcessing = status === "processing";
    const isFailed = status === "failed";
    const isPaid = status === "paid";
    const isVoid = ["void", "uncollectible"].includes(status);

    const steps = [
        {
            id: "created",
            label: "Invoice Created",
            sub: invoice?.invoiceNumber || null,
            icon: FileText,
            done: !["draft"].includes(status) || isVoid,
            active: ["draft", "issued", "open"].includes(status) && !isPaid && !isProcessing
        },
        {
            id: "attempt",
            label: "Payment Attempt",
            sub: hasPayments ? `${payments.length} attempt(s)` : "Awaiting",
            icon: isProcessing ? Loader2 : CreditCard,
            done: hasCaptured || isPaid,
            active: isProcessing || (hasPayments && !hasCaptured && !isPaid),
            processing: isProcessing,
            failed: isFailed || (hasPayments && !hasCaptured && !isPaid && !isProcessing)
        },
        {
            id: "captured",
            label: "Payment Captured",
            sub: hasCaptured ? "Funds confirmed" : null,
            icon: CheckCircle2,
            done: hasCaptured || isPaid,
            active: hasCaptured && !isPaid
        },
        {
            id: "paid",
            label: "Invoice Paid",
            sub: invoice?.paidAt ? new Date(invoice.paidAt).toLocaleDateString("en-US", { dateStyle: "medium" }) : null,
            icon: CircleDollarSign,
            done: isPaid,
            active: isPaid && !isRefunded
        },
        {
            id: "refunded",
            label: "Refund Issued",
            sub: isRefunded
                ? (invoice?.paymentStatus === "refunded" ? "Full refund" : "Partial refund")
                : null,
            icon: CornerDownLeft,
            done: isRefunded,
            active: isRefunded,
            hide: !isRefunded && !isPaid
        }
    ];

    return steps.filter(s => !s.hide);
}

// ─── Step dot ────────────────────────────────────────────────────────────────

function StepDot({ step, index, total }) {
    const Icon = step.icon;
    const isLast = index === total - 1;

    let dotClass = "w-8 h-8 rounded-full flex items-center justify-center ring-2 transition-all duration-300 ";
    let iconClass = "w-4 h-4 ";
    let lineClass = "flex-1 h-0.5 mx-1 transition-all duration-500 ";

    if (step.done) {
        dotClass += "bg-emerald-500 ring-emerald-200 shadow-sm shadow-emerald-100";
        iconClass += "text-white";
        lineClass += "bg-emerald-300";
    } else if (step.processing) {
        dotClass += "bg-indigo-500 ring-indigo-200 animate-pulse";
        iconClass += "text-white animate-spin";
        lineClass += "bg-slate-100";
    } else if (step.failed) {
        dotClass += "bg-red-100 ring-red-200";
        iconClass += "text-red-500";
        lineClass += "bg-slate-100";
    } else if (step.active) {
        dotClass += "bg-indigo-500 ring-indigo-200";
        iconClass += "text-white";
        lineClass += "bg-indigo-100";
    } else {
        dotClass += "bg-slate-100 ring-slate-200";
        iconClass += "text-slate-300";
        lineClass += "bg-slate-100";
    }

    return (
        <div className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 min-w-0">
                <div className={dotClass}>
                    <Icon className={iconClass} />
                </div>
                <div className="text-center min-w-0 w-16">
                    <p className={`text-[9px] font-black uppercase tracking-wider leading-tight ${step.done ? "text-emerald-600"
                            : step.active ? "text-indigo-600"
                                : step.failed ? "text-red-500"
                                    : "text-slate-400"
                        }`}>
                        {step.label}
                    </p>
                    {step.sub && (
                        <p className="text-[9px] text-slate-400 font-medium mt-0.5 truncate">
                            {step.sub}
                        </p>
                    )}
                </div>
            </div>
            {!isLast && (
                <div className={lineClass} style={{ marginBottom: "18px" }} />
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InvoiceFulfillmentLifecycle({ invoice, payments = [] }) {
    const steps = useMemo(() => buildSteps(invoice, payments), [invoice, payments]);

    if (!invoice) return null;

    const isVoid = ["void", "uncollectible", "failed"].includes(invoice.status);

    return (
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Fulfillment Lifecycle
                    </span>
                </div>
                {isVoid && (
                    <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wide border border-slate-200">
                        {invoice.status}
                    </span>
                )}
            </div>

            {/* Steps */}
            {isVoid ? (
                <div className="px-6 py-5 flex items-center gap-3 text-slate-400">
                    <FileText className="w-5 h-5 text-slate-300" />
                    <div>
                        <p className="text-sm font-bold text-slate-500">Invoice {invoice.status}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {invoice.status === "void"
                                ? "This invoice was voided before payment was received."
                                : invoice.status === "uncollectible"
                                    ? "This invoice was marked uncollectible after dunning."
                                    : "Payment processing failed for this invoice."}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="px-5 py-5 flex items-start overflow-x-auto">
                    {steps.map((step, i) => (
                        <StepDot key={step.id} step={step} index={i} total={steps.length} />
                    ))}
                </div>
            )}
        </div>
    );
}
