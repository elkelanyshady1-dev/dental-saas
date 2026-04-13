/**
 * ContractLifecycleCard.jsx
 * Sprint 7.2 — Contract Lifecycle Visualization
 *
 * Renders:
 *  - Contract metadata (plan, price, billing interval, status)
 *  - SVG lifecycle timeline (created → effective → expiry → renewed)
 *  - Renewal countdown chip (days remaining)
 *  - Grace period warning banner (when contractStatus is relevant)
 *  - Auto-renew toggle with confirmation modal
 *
 * Props:
 *   contract          OrgContract object (from API)
 *   onToggleAutoRenew (contractId, nextValue) => Promise<void>
 *   canManage         boolean (from capabilities)
 */

import React, { useState, useMemo } from "react";
import {
    Calendar, RefreshCw, AlertTriangle, CheckCircle2,
    Clock, XCircle, TrendingUp, TrendingDown, DollarSign, Zap, Users
} from "lucide-react";
import { CONTRACT_STATUS_MAP } from "../../utils/statusStyles";
import ConfirmModal from "./ConfirmModal";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" });
}

function fmtCurrency(val, currency) {
    if (val == null) return "—";
    try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
    } catch {
        return `${currency} ${Number(val).toFixed(2)}`;
    }
}

function diffDays(fromDate, toDate) {
    const ms = new Date(toDate) - new Date(fromDate);
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function TimelineBar({ effectiveFrom, effectiveTo, createdAt, gracePeriodDays = 0 }) {
    const now = new Date();
    const start = effectiveFrom ? new Date(effectiveFrom) : now;
    const end = effectiveTo ? new Date(effectiveTo) : null;

    if (!end) {
        // Open-ended contract — just show start
        return (
            <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <span>Active from <span className="font-black text-slate-700">{fmtDate(start)}</span></span>
                <span className="flex-1 h-px bg-gradient-to-r from-emerald-300/40 to-slate-200/20 rounded" />
                <span className="italic opacity-60">Open-ended</span>
            </div>
        );
    }

    const totalMs = end - start;
    const elapsedMs = now - start;
    const pct = Math.min(Math.max((elapsedMs / totalMs) * 100, 0), 100);
    const graceStart = new Date(end);
    const graceEnd = new Date(end.getTime() + gracePeriodDays * 86400000);
    const graceWidthPct = totalMs > 0 ? (gracePeriodDays * 86400000 / totalMs) * 100 : 0;
    const inGrace = now >= end && now <= graceEnd;
    const isExpired = now > graceEnd;

    return (
        <div className="space-y-2">
            {/* Bar */}
            <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
                {/* Elapsed */}
                <div
                    className={`absolute left-0 top-0 h-full rounded-full transition-all ${inGrace ? "bg-orange-400" : isExpired ? "bg-slate-300" : "bg-emerald-400"
                        }`}
                    style={{ width: `${pct}%` }}
                />
                {/* Grace period zone */}
                {gracePeriodDays > 0 && (
                    <div
                        className="absolute top-0 h-full bg-orange-200/60 rounded-r-full"
                        style={{ left: `${Math.min(100 - graceWidthPct, 100)}%`, width: `${graceWidthPct}%` }}
                    />
                )}
                {/* Today marker */}
                {pct > 0 && pct < 100 && (
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-slate-900/40"
                        style={{ left: `${pct}%` }}
                    />
                )}
            </div>
            {/* Labels */}
            <div className="flex justify-between text-[10px] font-bold text-slate-400">
                <span>{fmtDate(start)}</span>
                {gracePeriodDays > 0 && (
                    <span className="text-orange-500">+{gracePeriodDays}d grace</span>
                )}
                <span>{fmtDate(end)}</span>
            </div>
        </div>
    );
}

// ─── Countdown chip ────────────────────────────────────────────────────────────
// Sprint 8: trialDays + trialEndDate props control label

function RenewalCountdown({ effectiveTo, trialDays, trialEndDate }) {
    const days = effectiveTo ? diffDays(new Date(), new Date(effectiveTo)) : null;
    const now = new Date();
    // True when inside a trial window
    const isTrial = trialDays > 0 && trialEndDate && now < new Date(trialEndDate);

    if (days === null) return null;

    if (days < 0) {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-[11px] font-black border border-slate-200">
                <XCircle className="w-3 h-3" /> Expired
            </span>
        );
    }

    if (days <= 7) {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-700 text-[11px] font-black border border-red-200 animate-pulse">
                <Clock className="w-3 h-3" /> {isTrial ? `Trial ends in ${days}d` : `${days}d remaining`}
            </span>
        );
    }

    if (days <= 30) {
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-black border border-amber-200">
                <Clock className="w-3 h-3" /> {isTrial ? `Trial ends in ${days}d` : `${days}d remaining`}
            </span>
        );
    }

    return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-black border border-emerald-200">
            <RefreshCw className="w-3 h-3" /> {isTrial ? `Trial ends in ${days}d` : `Renews in ${days}d`}
        </span>
    );
}

// ─── Grace warning ─────────────────────────────────────────────────────────────

function GraceWarningBanner({ contractStatus, gracePeriodDays, effectiveTo }) {
    const isGrace = contractStatus === "active" && effectiveTo && diffDays(new Date(effectiveTo), new Date()) > 0;

    if (contractStatus !== "pending_payment" && !isGrace) return null;

    const isPendingPayment = contractStatus === "pending_payment";

    return (
        <div className={`flex items-start gap-3 rounded-2xl border px-5 py-4 ${isPendingPayment
            ? "bg-red-50 border-red-200"
            : "bg-orange-50 border-orange-200"
            }`}>
            <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isPendingPayment ? "text-red-500" : "text-orange-500"}`} />
            <div>
                <p className={`text-xs font-black uppercase tracking-widest mb-0.5 ${isPendingPayment ? "text-red-700" : "text-orange-700"}`}>
                    {isPendingPayment ? "Payment Required" : "Grace Period Active"}
                </p>
                <p className={`text-xs font-medium ${isPendingPayment ? "text-red-600" : "text-orange-600"}`}>
                    {isPendingPayment
                        ? "This contract requires payment to activate. Auto-suspension will occur after the grace period."
                        : `Contract is within its ${gracePeriodDays}-day grace period. Ensure payment is received to avoid suspension.`
                    }
                </p>
            </div>
        </div>
    );
}

// ─── Meta pill ────────────────────────────────────────────────────────────────

function MetaPill({ icon: Icon, label, value, mono }) {
    return (
        <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-[9px] text-slate-400 font-black uppercase tracking-widest">
                <Icon className="w-3 h-3" />{label}
            </div>
            <p className={`text-sm font-black text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</p>
        </div>
    );
}

// ─── Main export ───────────────────────────────────────────────────────────────

export default function ContractLifecycleCard({ contract, pendingContract, onToggleAutoRenew, onCancelScheduledChange, canManage = false }) {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toggling, setToggling] = useState(false);

    if (!contract) {
        return (
            <div className="rounded-3xl border-2 border-dashed border-slate-100 p-10 text-center">
                <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-xs font-black uppercase tracking-widest">No active contract</p>
            </div>
        );
    }

    const {
        _id,
        planVersionId,
        planVersionTag,
        planCode,
        contractStatus,
        currency,
        lockedPrice,
        billingInterval,
        effectiveFrom,
        effectiveTo,
        nextBillingDate,
        trialDays,
        trialEndDate,
        autoRenew,
        salesManaged,
        gracePeriodDays = 7,
        dunning,
        scheduledChange,
        createdAt,
    } = contract;

    const statusClass = CONTRACT_STATUS_MAP[contractStatus] || "bg-slate-50 text-slate-500 border-slate-200";

    const handleToggleAutoRenew = async () => {
        setToggling(true);
        setConfirmOpen(false);
        try {
            await onToggleAutoRenew?.(_id, !autoRenew);
        } finally {
            setToggling(false);
        }
    };

    const nextRetryAt = dunning?.nextRetryAt;
    const retryCount = dunning?.retryCount ?? 0;

    return (
        <>
            <div className="bg-bg-card rounded-card border border-brand-border shadow-card overflow-hidden">

                {/* Header bar */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 bg-slate-50/30">
                    <div className="flex items-center gap-3">
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${statusClass}`}>
                            {contractStatus}
                        </span>
                        <RenewalCountdown
                            effectiveTo={effectiveTo}
                            trialDays={trialDays}
                            trialEndDate={trialEndDate}
                        />
                        {salesManaged && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 text-[10px] font-black uppercase tracking-wider">
                                <Users className="w-3 h-3" /> Sales Managed
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Auto-renew toggle */}
                        {canManage && (
                            <button
                                id="contract-autorenew-toggle"
                                onClick={() => setConfirmOpen(true)}
                                disabled={toggling}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-300 disabled:opacity-50 ${autoRenew ? "bg-emerald-500" : "bg-slate-200"
                                    }`}
                                role="switch"
                                aria-checked={autoRenew}
                                title={autoRenew ? "Disable auto-renew" : "Enable auto-renew"}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${autoRenew ? "translate-x-6" : "translate-x-1"
                                        }`}
                                />
                            </button>
                        )}
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Auto-Renew {autoRenew ? "On" : "Off"}
                        </span>
                    </div>
                </div>

                {/* Grace / Payment warning */}
                <div className="px-8 pt-5">
                    <GraceWarningBanner
                        contractStatus={contractStatus}
                        gracePeriodDays={gracePeriodDays}
                        effectiveTo={effectiveTo}
                    />
                </div>

                {/* Dunning warning */}
                {retryCount > 0 && (
                    <div className="mx-8 mt-3 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-xs font-black text-amber-800 uppercase tracking-widest mb-0.5">
                                Payment Retry {retryCount}
                            </p>
                            <p className="text-xs font-medium text-amber-700">
                                Next retry scheduled for{" "}
                                <span className="font-black">{fmtDate(nextRetryAt)}</span>.
                                Ensure billing details are up to date to avoid suspension.
                            </p>
                        </div>
                    </div>
                )}

                {/* Sprint 8 — Pending/Scheduled Plan Banner ─────────────────────────── */}
                {/* Shows when a pending_activation contract exists (scheduled after trial) */}
                {pendingContract && pendingContract.contractStatus === "pending_activation" && (
                    <div className="mx-8 mt-4 flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-2xl px-5 py-4">
                        <TrendingUp className="w-4 h-4 text-violet-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-xs font-black text-violet-800 uppercase tracking-widest mb-0.5">
                                Plan Scheduled After Trial
                            </p>
                            <p className="text-xs font-medium text-violet-700">
                                {pendingContract.planCode || pendingContract.planVersionTag || "—"}
                                {pendingContract.lockedPrice > 0 && pendingContract.currency && (
                                    <> &mdash; {(() => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: pendingContract.currency }).format(pendingContract.lockedPrice); } catch { return `${pendingContract.currency} ${pendingContract.lockedPrice}`; } })()}/{pendingContract.billingInterval || "month"}</>
                                )}
                                {pendingContract.effectiveFrom && (
                                    <> &middot; Starts <span className="font-black">{fmtDate(pendingContract.effectiveFrom)}</span></>
                                )}
                            </p>
                        </div>
                    </div>
                )}

                {/* Sprint 8 — Scheduled Change Banner */}
                {scheduledChange && (
                    <div className="mx-8 mt-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
                        <TrendingDown className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-xs font-black text-amber-800 uppercase tracking-widest mb-0.5">
                                Scheduled Downgrade
                            </p>
                            <p className="text-xs font-medium text-amber-700">
                                {planCode || planVersionTag || "Current plan"} &rarr; {scheduledChange.newPlanCode || "—"}
                                {scheduledChange.effectiveDate && (
                                    <> &middot; Effective <span className="font-black">{fmtDate(scheduledChange.effectiveDate)}</span></>
                                )}
                            </p>
                        </div>
                        <button
                            id={`cancel-scheduled-change-${_id}`}
                            onClick={() => onCancelScheduledChange?.(_id)}
                            className="text-[10px] font-black text-amber-700 hover:text-amber-900 border border-amber-300 hover:border-amber-500 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                        >
                            Cancel Change
                        </button>
                    </div>
                )}

                {/* Meta grid */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-6 px-8 py-6 border-b border-slate-50">
                    <MetaPill icon={TrendingUp} label="Plan" value={planVersionTag || planVersionId || "—"} />
                    <MetaPill icon={DollarSign} label="Locked Price" value={fmtCurrency(lockedPrice, currency)} />
                    <MetaPill icon={RefreshCw} label="Billing Interval" value={billingInterval ? billingInterval.charAt(0).toUpperCase() + billingInterval.slice(1) : "—"} />
                    <MetaPill icon={Calendar} label="Next Billing" value={fmtDate(nextBillingDate || effectiveTo)} />
                    <MetaPill icon={Zap} label="Grace Period" value={`${gracePeriodDays} days`} />
                </div>

                {/* Timeline */}
                <div className="px-8 py-5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                        Contract Timeline
                    </p>
                    <TimelineBar
                        effectiveFrom={effectiveFrom}
                        effectiveTo={effectiveTo}
                        createdAt={createdAt}
                        gracePeriodDays={gracePeriodDays}
                    />
                </div>

                {/* Footer metadata */}
                <div className="flex items-center justify-between px-8 py-4 bg-slate-50/30 border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-medium">
                        Created <span className="font-bold text-slate-600">{fmtDate(createdAt)}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">
                        Currency <span className="font-black text-slate-700">{currency || "—"}</span>
                    </p>
                </div>
            </div>

            {/* Auto-renew confirmation modal */}
            <ConfirmModal
                isOpen={confirmOpen}
                onCancel={() => setConfirmOpen(false)}
                onConfirm={handleToggleAutoRenew}
                loading={toggling}
                title={autoRenew ? "Disable Auto-Renewal?" : "Enable Auto-Renewal?"}
                message={
                    autoRenew
                        ? "The contract will expire at the end of the current period and will not renew automatically. The organization must be re-contracted manually."
                        : "The contract will automatically renew at the end of the current period. A new invoice will be generated based on the locked price."
                }
                confirmLabel={autoRenew ? "Disable Auto-Renew" : "Enable Auto-Renew"}
                intent={autoRenew ? "warning" : "primary"}
            />
        </>
    );
}
