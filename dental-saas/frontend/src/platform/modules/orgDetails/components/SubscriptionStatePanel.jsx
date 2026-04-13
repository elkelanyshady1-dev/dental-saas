/**
 * SubscriptionStatePanel.jsx
 * Section 2 of OrgFinancialControl
 *
 * Shows the subscription lifecycle state, metadata, and actions.
 * Actions: Suspend, Resume, Void Contract with tooltips.
 *
 * PLANE: Platform
 */

import React, { useState } from "react";
import {
    CreditCard, Calendar, RefreshCw, Hash,
    Pause, Play, Slash, AlertCircle, CheckCircle2,
    Clock, XCircle, Info, ChevronDown
} from "lucide-react";
import platformApi from "../../../auth/platformApi";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { dateStyle: "medium" }) : "—";

// ─── State badges ────────────────────────────────────────────────────────────

const STATE_CONFIG = {
    active: { label: "Active", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
    trialing: { label: "Trial", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Clock },
    trial: { label: "Trial", cls: "bg-blue-50 text-blue-700 border-blue-200", Icon: Clock },
    past_due: { label: "Past Due", cls: "bg-red-50 text-red-700 border-red-200", Icon: AlertCircle },
    overdue: { label: "Overdue", cls: "bg-red-50 text-red-700 border-red-200", Icon: AlertCircle },
    grace: { label: "Grace", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
    suspended: { label: "Suspended", cls: "bg-orange-50 text-orange-700 border-orange-200", Icon: Pause },
    void: { label: "Voided", cls: "bg-slate-100 text-slate-600 border-slate-200", Icon: XCircle },
    cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500 border-slate-200", Icon: XCircle },
    expired: { label: "Expired", cls: "bg-slate-100 text-slate-500 border-slate-200", Icon: XCircle },
    pending_activation: { label: "Pending", cls: "bg-violet-50 text-violet-700 border-violet-200", Icon: Clock },
};

function StateBadge({ status }) {
    const cfg = STATE_CONFIG[status] || { label: status || "Unknown", cls: "bg-slate-50 text-slate-500 border-slate-200", Icon: Hash };
    const { Icon } = cfg;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black border ${cfg.cls}`}>
            <Icon className="w-3.5 h-3.5" />
            {cfg.label}
        </span>
    );
}

// ─── Metadata row ─────────────────────────────────────────────────────────────

function MetaRow({ icon: Icon, label, value, mono = false }) {
    return (
        <div className="flex items-center justify-between py-2.5 border-b border-slate-50 last:border-0">
            <div className="flex items-center gap-2 text-slate-500">
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
            </div>
            <span className={`text-xs font-bold text-slate-700 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
        </div>
    );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionButton({ id, icon: Icon, label, desc, onClick, loading, variant = "slate" }) {
    const variants = {
        amber: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
        red: "bg-red-50 border-red-200 text-red-700 hover:bg-red-100",
        emerald: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
        slate: "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
    };
    return (
        <div className="flex flex-col gap-0.5">
            <button
                id={id}
                onClick={onClick}
                disabled={loading}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-50 ${variants[variant]}`}
                title={desc}
            >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {label}
            </button>
            <p className="text-[9px] text-slate-400 px-1">{desc}</p>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SubscriptionStatePanel({ contract, contracts = [], onRefresh }) {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState(null);

    const status = contract?.contractStatus;
    const canSuspend = ["active", "grace"].includes(status);
    const canResume = status === "suspended";
    const canVoid = ["active", "grace", "suspended", "pending_activation"].includes(status);

    async function handle(action, confirmText, apiCall) {
        if (!window.confirm(confirmText)) return;
        setLoading(true);
        setMsg(null);
        try {
            await apiCall();
            setMsg({ ok: true, text: `${action} successful.` });
            onRefresh?.();
        } catch (e) {
            const errMsg = e?.response?.data?.error?.message || e.message || `${action} failed.`;
            setMsg({ ok: false, text: errMsg });
        } finally {
            setLoading(false);
        }
    }

    const suspend = () => handle(
        "Suspend",
        "Suspend Contract\n\nTemporarily disable access. Billing pauses and can be resumed.\n\nProceed?",
        () => platformApi.post(`/contracts/${contract._id}/suspend`, { reason: "Manual suspension by operator" })
    );

    const resume = () => handle(
        "Resume",
        "Resume Contract\n\nRestore access and resume billing.\n\nProceed?",
        () => platformApi.post(`/contracts/${contract._id}/resume`)
    );

    const voidFn = () => handle(
        "Void",
        "Void Contract\n\nPermanently cancel this contract. Cannot be reversed.\n\nOnly allowed if no paid invoices exist. Proceed?",
        () => platformApi.post(`/contracts/${contract._id}/void`, { reason: "Voided by platform operator" })
    );

    if (!contract) {
        return (
            <div className="rounded-2xl border border-slate-100 bg-white px-6 py-10 text-center">
                <CreditCard className="w-7 h-7 text-slate-200 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-400">No active contract</p>
                <p className="text-xs text-slate-300 mt-1">A contract will appear here when the organization subscribes to a plan</p>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center ring-1 ring-indigo-100">
                        <CreditCard className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subscription State</p>
                        <p className="text-xs font-bold text-slate-600">{contract.planCode || "—"}</p>
                    </div>
                </div>
                <StateBadge status={status} />
            </div>

            {/* Contract metadata */}
            <div className="px-5 py-4 border-b border-slate-50">
                <MetaRow icon={Hash} label="Contract ID" value={String(contract._id || "").slice(-12)} mono />
                <MetaRow icon={CreditCard} label="Plan Code" value={contract.planCode} />
                <MetaRow icon={CreditCard} label="Plan Version" value={contract.planVersionTag} />
                <MetaRow icon={Calendar} label="Activation Date" value={fmt(contract.effectiveFrom)} />
                <MetaRow icon={Calendar} label="Renewal Schedule" value={fmt(contract.effectiveTo)} />
                <MetaRow icon={Clock} label="Trial End" value={contract.trialEnds ? fmt(contract.trialEnds) : "—"} />
                <MetaRow icon={RefreshCw} label="Auto-Renew" value={contract.autoRenew ? "Enabled" : "Disabled"} />
                <MetaRow icon={Calendar} label="Billing Interval" value={contract.billingInterval || contract.billingCycle || "—"} />
            </div>

            {/* Feedback */}
            {msg && (
                <div className={`mx-5 mt-4 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${msg.ok
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                    {msg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {msg.text}
                    <button onClick={() => setMsg(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
                </div>
            )}

            {/* Actions */}
            {(canSuspend || canResume || canVoid) && (
                <div className="flex flex-wrap gap-3 px-5 py-4">
                    {canSuspend && (
                        <ActionButton
                            id="btn-suspend-contract"
                            icon={Pause}
                            label="Suspend"
                            desc="Temporarily disable access. Can be resumed."
                            onClick={suspend}
                            loading={loading}
                            variant="amber"
                        />
                    )}
                    {canResume && (
                        <ActionButton
                            id="btn-resume-contract"
                            icon={Play}
                            label="Resume"
                            desc="Restore access and resume billing."
                            onClick={resume}
                            loading={loading}
                            variant="emerald"
                        />
                    )}
                    {canVoid && (
                        <ActionButton
                            id="btn-void-contract"
                            icon={Slash}
                            label="Void"
                            desc="Permanently cancel. Cannot be reversed."
                            onClick={voidFn}
                            loading={loading}
                            variant="red"
                        />
                    )}
                </div>
            )}

            {/* All contracts list */}
            {contracts.length > 1 && (
                <div className="px-5 py-4 border-t border-slate-50">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2.5">Contract History ({contracts.length})</p>
                    <div className="space-y-1.5">
                        {contracts.map(c => (
                            <div key={c._id} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-100">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono text-slate-400">…{String(c._id).slice(-8)}</span>
                                    <span className="text-[10px] font-bold text-slate-600">{c.planCode}</span>
                                </div>
                                <StateBadge status={c.contractStatus} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
