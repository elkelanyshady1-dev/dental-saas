/**
 * BillingStatusCard.jsx
 * Section 1 — Financial Status Summary
 *
 * Displays the full financial health snapshot of an organization:
 *   Plan name, billing state, trial countdown, next billing date,
 *   outstanding balance, credit balance, refund total, payment health.
 *
 * PLANE: Platform
 */

import React, { useMemo } from "react";
import {
    CheckCircle2, AlertTriangle, XCircle, Clock, Pause,
    TrendingUp, DollarSign, RefreshCw, CreditCard, Zap,
    Loader2, Tag
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

const daysDiff = (date) => {
    if (!date) return null;
    const d = Math.ceil((new Date(date) - Date.now()) / 86400000);
    return d;
};

// ─── Payment Health Logic ──────────────────────────────────────────────────────

function computePaymentHealth(contract, invoices = []) {
    if (!contract) return { level: "unknown", label: "No Contract", icon: XCircle, color: "slate" };

    if (contract.contractStatus === "suspended") {
        return { level: "suspended", label: "Suspended", icon: Pause, color: "orange" };
    }
    if (contract.contractStatus === "void") {
        return { level: "critical", label: "Voided", icon: XCircle, color: "red" };
    }

    // v22.0: check for any processing invoices
    const processingInvoices = invoices.filter(i => i.status === "processing");
    if (processingInvoices.length > 0) {
        return { level: "processing", label: "Processing Payment", icon: Loader2, color: "blue" };
    }

    const overdueInvoices = invoices.filter(i => i.status === "overdue" || i.status === "partial");
    if (overdueInvoices.length === 0) {
        return { level: "healthy", label: "Healthy", icon: CheckCircle2, color: "emerald" };
    }

    const mostOverdue = overdueInvoices.reduce((worst, inv) => {
        const days = inv.dueDate ? Math.floor((Date.now() - new Date(inv.dueDate)) / 86400000) : 0;
        return days > (worst.days || 0) ? { ...inv, days } : worst;
    }, { days: 0 });

    if (mostOverdue.days > 7) {
        return { level: "critical", label: "Critical — Overdue >7d", icon: XCircle, color: "red" };
    }
    return { level: "warning", label: "Warning — Overdue", icon: AlertTriangle, color: "amber" };
}

// ─── Health Badge ──────────────────────────────────────────────────────────────

const colorMap = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-500" },
    red: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-500" },
    orange: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", dot: "bg-orange-500" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-400 animate-pulse" },
    slate: { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200", dot: "bg-slate-400" }
};

function HealthBadge({ health }) {
    const c = colorMap[health.color] || colorMap.slate;
    const Icon = health.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${c.bg} ${c.text} border ${c.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
            <Icon className="w-3 h-3" />
            {health.label}
        </span>
    );
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, accent = "slate", dimmed = false }) {
    const acc = {
        emerald: "text-emerald-600",
        amber: "text-amber-600",
        red: "text-red-600",
        violet: "text-violet-600",
        blue: "text-blue-600",
        slate: "text-slate-500"
    }[accent] || "text-slate-500";

    return (
        <div className={`rounded-2xl border border-slate-100 bg-white px-5 py-4 flex flex-col gap-1 transition-all hover:shadow-sm ${dimmed ? "opacity-60" : ""}`}>
            <div className="flex items-center gap-2 mb-0.5">
                {Icon && <Icon className={`w-3.5 h-3.5 ${acc}`} />}
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
            </div>
            <p className={`text-xl font-black tracking-tight ${acc}`}>{value}</p>
            {sub && <p className="text-[10px] text-slate-400 font-medium mt-0.5">{sub}</p>}
        </div>
    );
}

// ─── Processing banner ────────────────────────────────────────────────────────

function ProcessingBanner({ count }) {
    return (
        <div className="mx-5 mb-4 flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            <span className="text-xs font-bold">
                {count} invoice{count > 1 ? "s" : ""} awaiting async payment confirmation
            </span>
            <span className="ml-auto text-[10px] text-blue-500 font-medium">Processing…</span>
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function BillingStatusCard({ contract, summary, invoices = [], payments = [] }) {
    const health = useMemo(() => computePaymentHealth(contract, invoices), [contract, invoices]);

    const currency = contract?.currency || summary?.currency || "USD";
    const contractStatus = contract?.contractStatus || summary?.contractStatus;

    // Trial countdown
    const trialDays = daysDiff(contract?.trialEnds || summary?.trialEnds);
    const isOnTrial = contractStatus === "trialing" || (trialDays !== null && trialDays > 0);

    // Next billing date
    const nextBillingDate = contract?.effectiveTo || summary?.nextBillingDate;

    // Outstanding balance (sum of unpaid invoices)
    const outstandingBalance = useMemo(
        () => invoices
            .filter(i => ["open", "partial", "overdue", "issued"].includes(i.status))
            .reduce((sum, i) => sum + (i.amountRemaining ?? (i.totalAmount - (i.amountPaid || 0))), 0),
        [invoices]
    );

    // Refund total last 30 days
    const refundTotal30d = useMemo(() => {
        const cutoff = Date.now() - 30 * 86400000;
        return payments
            .filter(p => p.status === "refunded" && new Date(p.createdAt) > cutoff)
            .reduce((s, p) => s + (p.amount || 0), 0);
    }, [payments]);

    const planName = contract?.planCode || summary?.planCode || "—";
    const creditBalance = summary?.creditBalance ?? 0;

    // v22.0: count processing invoices
    const processingCount = invoices.filter(i => i.status === "processing").length;

    return (
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white overflow-hidden">
            {/* Header bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <TrendingUp className="w-4.5 h-4.5 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Financial Status</p>
                        <p className="text-sm font-black text-slate-800">{planName}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <HealthBadge health={health} />
                    {isOnTrial && trialDays !== null && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-violet-50 text-violet-700 border border-violet-200">
                            <Zap className="w-3 h-3" />
                            Trial — {trialDays}d left
                        </span>
                    )}
                </div>
            </div>

            {/* v22.0: Processing banner */}
            {processingCount > 0 && (
                <div className="px-5 pt-4">
                    <ProcessingBanner count={processingCount} />
                </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-5">
                {/* Plan name */}
                <StatCard
                    label="Plan"
                    value={planName}
                    icon={Tag}
                    accent="violet"
                />
                <StatCard
                    label="Contract Status"
                    value={contractStatus || "—"}
                    icon={CreditCard}
                    accent={
                        contractStatus === "active" ? "emerald" :
                            contractStatus === "suspended" ? "orange" :
                                contractStatus === "grace" ? "amber" :
                                    contractStatus === "void" ? "red" : "slate"
                    }
                />
                <StatCard
                    label="Next Billing Date"
                    value={fmt(nextBillingDate)}
                    sub={nextBillingDate ? `in ${Math.max(0, daysDiff(nextBillingDate))} days` : undefined}
                    icon={Clock}
                    accent="blue"
                />
                <StatCard
                    label="Next Billing Amount"
                    value={cur(contract?.lockedPrice || summary?.lockedPrice, currency)}
                    sub={contract?.billingInterval || summary?.billingCycle || ""}
                    icon={DollarSign}
                    accent="slate"
                />
                <StatCard
                    label="Outstanding Balance"
                    value={cur(outstandingBalance, currency)}
                    icon={AlertTriangle}
                    accent={outstandingBalance > 0 ? "amber" : "emerald"}
                    sub={outstandingBalance > 0 ? "Needs attention" : "All settled"}
                />
                {/* v22.0: Credit balance always shown */}
                <StatCard
                    label="Credit Balance"
                    value={cur(creditBalance, currency)}
                    icon={RefreshCw}
                    accent={creditBalance > 0 ? "emerald" : "slate"}
                    sub={creditBalance > 0 ? "Available credit" : "No credit"}
                    dimmed={creditBalance === 0}
                />
                <StatCard
                    label="Refunds (30d)"
                    value={cur(refundTotal30d, currency)}
                    icon={RefreshCw}
                    accent={refundTotal30d > 0 ? "violet" : "slate"}
                    dimmed={refundTotal30d === 0}
                />
                {summary?.appliedCoupon && (
                    <StatCard
                        label="Applied Coupon"
                        value={summary.appliedCoupon}
                        icon={null}
                        accent="violet"
                    />
                )}
            </div>
        </div>
    );
}
