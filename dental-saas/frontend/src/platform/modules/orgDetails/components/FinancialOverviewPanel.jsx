/**
 * FinancialOverviewPanel.jsx
 * Section 1 of OrgFinancialControl
 *
 * Compact card grid showing the full financial snapshot:
 * Plan, Subscription State, Next Billing Date/Amount,
 * Outstanding Balance, Credit Balance, Refunds (30d), Payment Health.
 *
 * PLANE: Platform
 */

import React, { useMemo } from "react";
import {
    TrendingUp, Tag, CreditCard, Clock, DollarSign,
    AlertTriangle, RefreshCw, CheckCircle2, XCircle,
    Pause, Loader2, Zap, Shield
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
    return Math.ceil((new Date(date) - Date.now()) / 86400000);
};

// ─── Payment health computation ───────────────────────────────────────────────

function computeHealth(contract, invoices = []) {
    if (!contract) return { level: "unknown", label: "No Contract", Icon: XCircle, color: "slate" };
    if (contract.contractStatus === "suspended")
        return { level: "suspended", label: "Suspended", Icon: Pause, color: "orange" };
    if (contract.contractStatus === "void")
        return { level: "critical", label: "Voided", Icon: XCircle, color: "red" };
    if (invoices.some(i => i.status === "processing"))
        return { level: "processing", label: "Processing", Icon: Loader2, color: "blue" };

    const overdue = invoices.filter(i => ["overdue", "partial"].includes(i.status));
    if (overdue.length === 0)
        return { level: "healthy", label: "Healthy", Icon: CheckCircle2, color: "emerald" };

    const worst = overdue.reduce((acc, inv) => {
        const d = inv.dueDate ? Math.floor((Date.now() - new Date(inv.dueDate)) / 86400000) : 0;
        return d > acc ? d : acc;
    }, 0);

    return worst >= 7
        ? { level: "critical", label: "Critical — Overdue ≥7d", Icon: XCircle, color: "red" }
        : { level: "warning", label: "Warning — Overdue", Icon: AlertTriangle, color: "amber" };
}

// ─── Color palette ────────────────────────────────────────────────────────────

const COLORS = {
    emerald: { ring: "ring-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
    amber: { ring: "ring-amber-200", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
    red: { ring: "ring-red-200", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
    orange: { ring: "ring-orange-200", bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
    blue: { ring: "ring-blue-200", bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500 animate-pulse" },
    violet: { ring: "ring-violet-200", bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
    slate: { ring: "ring-slate-200", bg: "bg-slate-50", text: "text-slate-500", dot: "bg-slate-400" },
};

// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, sub, color = "slate", dimmed = false }) {
    const c = COLORS[color] || COLORS.slate;
    return (
        <div className={`
            relative flex flex-col gap-2 p-4 rounded-2xl bg-white border border-slate-100
            hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
            ${dimmed ? "opacity-55" : ""}
        `}>
            <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${c.bg} ring-1 ${c.ring}`}>
                    <Icon className={`w-4 h-4 ${c.text}`} />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
            </div>
            <p className={`text-xl font-black leading-tight ${c.text}`}>{value}</p>
            {sub && <p className="text-[10px] text-slate-400 font-medium">{sub}</p>}
        </div>
    );
}

// ─── Health badge ─────────────────────────────────────────────────────────────

function HealthBadge({ health }) {
    const c = COLORS[health.color] || COLORS.slate;
    const { Icon } = health;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${c.bg} ${c.text} ${c.ring}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
            <Icon className="w-3 h-3" />
            {health.label}
        </span>
    );
}

// ─── Trial badge ──────────────────────────────────────────────────────────────

function TrialBadge({ daysLeft }) {
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-violet-50 text-violet-700 border border-violet-200">
            <Zap className="w-3 h-3" />
            Trial — {daysLeft}d left
        </span>
    );
}

// ─── Processing banner ────────────────────────────────────────────────────────

function ProcessingBanner({ count }) {
    return (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            <span className="text-xs font-bold">
                {count} invoice{count > 1 ? "s" : ""} awaiting payment confirmation
            </span>
            <span className="ml-auto text-[10px] text-blue-500 font-medium">Processing…</span>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FinancialOverviewPanel({ contract, summary, invoices = [], payments = [] }) {
    const health = useMemo(() => computeHealth(contract, invoices), [contract, invoices]);

    const currency = contract?.currency || summary?.currency || "USD";
    const status = contract?.contractStatus || summary?.contractStatus;
    const planName = contract?.planCode || summary?.planCode || "—";
    const nextDate = contract?.effectiveTo || summary?.effectiveTo;
    const lockedPrice = contract?.lockedPrice || summary?.lockedPrice;
    const creditBal = summary?.creditBalance ?? 0;
    const trialDays = daysDiff(contract?.trialEnds || summary?.trialEnds);
    const isTrialing = status === "trialing" || (trialDays !== null && trialDays > 0);

    const outstanding = useMemo(
        () => invoices
            .filter(i => ["open", "partial", "overdue", "issued"].includes(i.status))
            .reduce((s, i) => s + (i.amountRemaining ?? Math.max(0, (i.totalAmount || 0) - (i.amountPaid || 0))), 0),
        [invoices]
    );

    const refunds30d = useMemo(() => {
        const cutoff = Date.now() - 30 * 86400000;
        return payments
            .filter(p => p.status === "refunded" && new Date(p.createdAt) > cutoff)
            .reduce((s, p) => s + (p.amount || 0), 0);
    }, [payments]);

    const processingCount = invoices.filter(i => i.status === "processing").length;

    const statusColor = {
        active: "emerald", trialing: "blue", suspended: "orange",
        void: "red", grace: "amber", expired: "red"
    }[status] || "slate";

    return (
        <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-50 to-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center ring-1 ring-indigo-100">
                        <TrendingUp className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Financial Overview</p>
                        <p className="text-sm font-black text-slate-800">{planName}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <HealthBadge health={health} />
                    {isTrialing && trialDays !== null && <TrialBadge daysLeft={trialDays} />}
                </div>
            </div>

            {/* Processing banner */}
            {processingCount > 0 && (
                <div className="px-5 pt-4">
                    <ProcessingBanner count={processingCount} />
                </div>
            )}

            {/* Metrics grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-5">
                <MetricCard
                    icon={Tag}
                    label="Plan"
                    value={planName}
                    color="violet"
                />
                <MetricCard
                    icon={Shield}
                    label="Subscription State"
                    value={status || "—"}
                    color={statusColor}
                    sub={isTrialing && trialDays !== null ? `${trialDays} days remain` : undefined}
                />
                <MetricCard
                    icon={Clock}
                    label="Next Billing Date"
                    value={fmt(nextDate)}
                    sub={nextDate ? `in ${Math.max(0, daysDiff(nextDate))} days` : undefined}
                    color="blue"
                />
                <MetricCard
                    icon={DollarSign}
                    label="Next Invoice Amount"
                    value={lockedPrice != null ? cur(lockedPrice, currency) : "—"}
                    sub={contract?.billingInterval || summary?.billingInterval || ""}
                    color="slate"
                />
                <MetricCard
                    icon={AlertTriangle}
                    label="Outstanding Balance"
                    value={cur(outstanding, currency)}
                    sub={outstanding > 0 ? "Needs attention" : "All settled"}
                    color={outstanding > 0 ? "amber" : "emerald"}
                />
                {/* Only show credit balance if there is actual account credit (not a card refund) */}
                {creditBal > 0 ? (
                    <MetricCard
                        icon={RefreshCw}
                        label="Account Credit"
                        value={cur(creditBal, currency)}
                        sub="Applied to next invoice"
                        color="emerald"
                    />
                ) : (
                    <MetricCard
                        icon={RefreshCw}
                        label="Refunded to Card"
                        value={cur(refunds30d, currency)}
                        sub={refunds30d > 0 ? "Returned to payment method (30d)" : "No refunds in 30 days"}
                        color={refunds30d > 0 ? "violet" : "slate"}
                        dimmed={refunds30d === 0}
                    />
                )}
                <MetricCard
                    icon={health.Icon}
                    label="Payment Health"
                    value={health.label}
                    color={health.color}
                />
            </div>
        </div>
    );
}
