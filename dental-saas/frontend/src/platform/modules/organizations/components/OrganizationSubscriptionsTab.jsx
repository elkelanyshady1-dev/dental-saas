/**
 * OrganizationSubscriptionsTab.jsx
 * Platform — Organization Subscriptions & Contracts
 *
 * Fetches: GET /api/platform/organizations/:id/contracts
 *
 * Sections:
 *   A — Active Contract Card (with Upgrade / Cancel / Toggle AutoRenew)
 *   B — Contract History Table
 *   C — Invoice Table
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
    CreditCard, Zap, XCircle, RefreshCw, ChevronRight,
    CheckCircle2, AlertTriangle, Clock, DollarSign,
    FileText, Hash, Calendar, Loader2, ArrowUpRight,
    ToggleLeft, ToggleRight, Ban, CalendarClock
} from 'lucide-react';
import platformApi from '@/platform/auth/platformApi';
import Card, { CardHeader } from '@/platform/core/ui/Card';
import { LoadingState, ErrorState, EmptyState } from '@/platform/core/ui/Feedback';
import { ConfirmDialog } from '@/platform/core/ui';
import ContractBuilderWizard from '@/platform/contracts/ContractBuilderWizard';
// Sprint 8: contract debug timeline
import ContractTimelinePanel from '@/platform/modules/billing/components/ContractTimelinePanel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtMoney = (val, currency = 'USD') =>
    val != null
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val)
        : '—';

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CFG = {
    active: { label: 'Active', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    trial: { label: 'Trial', bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
    draft: { label: 'Draft', bg: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
    superseded: { label: 'Superseded', bg: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
    terminated: { label: 'Terminated', bg: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-500' },
    expired: { label: 'Expired', bg: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-400' },
    canceled: { label: 'Canceled', bg: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
    paid: { label: 'Paid', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    open: { label: 'Open', bg: 'bg-blue-50 text-blue-700 border-blue-200', dot: 'bg-blue-400' },
    void: { label: 'Void', bg: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
    uncollectible: { label: 'Uncollectible', bg: 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-500' },
};

function StatusPill({ status }) {
    const cfg = STATUS_CFG[status?.toLowerCase()] || {
        label: status || '—',
        bg: 'bg-slate-100 text-slate-500 border-slate-200',
        dot: 'bg-slate-400'
    };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

// ─── Section A — Active Contract Card ─────────────────────────────────────────

function ActiveContractCard({ contract, orgId, onUpgrade, onRefetch, pendingContract }) {
    const [toggling, setToggling] = useState(false);
    const [canceling, setCanceling] = useState(false);
    const [actionError, setActionError] = useState(null);
    const [confirmCancel, setConfirmCancel] = useState(false); // ← replaces window.confirm

    if (!contract) {
        return (
            <Card>
                <div className="flex items-center justify-between">
                    <CardHeader title="Active Contract" icon={CreditCard} />
                    <button
                        onClick={onUpgrade}
                        id="activate-plan-btn"
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-primary rounded-xl hover:opacity-90 transition-opacity"
                    >
                        <Zap className="w-3.5 h-3.5" />
                        Build Contract
                    </button>
                </div>
                <div className="mt-4 py-8 text-center text-sm text-slate-400">
                    No active contract. Click <strong>Activate Plan</strong> to provision one.
                </div>
            </Card>
        );
    }

    const handleToggleAutoRenew = async () => {
        setToggling(true);
        setActionError(null);
        try {
            await platformApi.patch(`/contracts/${contract._id}/status`, {
                autoRenew: !contract.autoRenew
            });
            onRefetch();
        } catch (err) {
            setActionError(err.response?.data?.message || 'Failed to toggle auto-renew');
        } finally {
            setToggling(false);
        }
    };

    const handleCancel = async () => {
        // Step 1 is now handled by ConfirmDialog — this runs only after admin confirms
        setCanceling(true);
        setActionError(null);
        try {
            await platformApi.patch(`/contracts/${contract._id}/status`, { status: 'canceled' });
            onRefetch();
        } catch (err) {
            setActionError(err.response?.data?.message || 'Failed to cancel contract');
        } finally {
            setCanceling(false);
        }
    };

    const isTrial = contract.trialDays > 0 && contract.trialEndDate;

    // ── Correct auto-renew derivation ────────────────────────────────────────────
    // contract.autoRenew is set to true by default on all contracts — including
    // trial-only provisioning. That flag ALONE is misleading: a trial-only org
    // with no pending_activation will suspend after the trial, not auto-renew.
    //
    // Correct rule: auto-renew = true ONLY when a pending_activation contract exists.
    // This is the canonical lifecycle indicator used by contractRenewal.service.js.
    const autoRenew = Boolean(pendingContract);

    // The toggle action controls whether the scheduled plan will renew beyond its
    // first billing period — only meaningful if a pending plan is already set up.
    // For trial-only orgs (no pending), the toggle is irrelevant and hidden.
    const canToggleAutoRenew = Boolean(pendingContract);

    return (
        <>
            <Card>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <CardHeader title="Active Contract" icon={CreditCard} />
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Upgrade button — always available */}
                        <button
                            onClick={onUpgrade}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-brand-primary rounded-xl hover:opacity-90 transition-opacity"
                        >
                            <Zap className="w-3.5 h-3.5" />
                            Upgrade Plan
                        </button>

                        {/* Auto-renew toggle — only shown when a pending scheduled plan exists.
                            For trial-only orgs there is no plan to "renew" so the toggle is
                            hidden to avoid confusion. */}
                        {canToggleAutoRenew && (
                            <button
                                onClick={handleToggleAutoRenew}
                                disabled={toggling}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                                {pendingContract?.autoRenew
                                    ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" />
                                    : <ToggleLeft className="w-3.5 h-3.5 text-slate-400" />}
                                {toggling ? 'Saving…' : `Auto-Renew ${pendingContract?.autoRenew ? 'On' : 'Off'}`}
                            </button>
                        )}

                        <button
                            onClick={() => setConfirmCancel(true)}
                            disabled={canceling}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                            <Ban className="w-3.5 h-3.5" />
                            {canceling ? 'Canceling...' : 'Cancel'}
                        </button>
                    </div>
                </div>

                {actionError && (
                    <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                        <p className="text-xs text-red-700">{actionError}</p>
                    </div>
                )}

                {/* Trial banner — always shown for trial contracts */}
                {isTrial && (
                    <div className="mb-4 flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                        <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                        <div className="flex flex-col gap-0.5">
                            <p className="text-xs text-blue-700 font-medium">
                                Trial period — ends <strong>{fmt(contract.trialEndDate)}</strong>
                            </p>
                            {/* Lifecycle "next step" — derived from whether a plan is scheduled */}
                            {pendingContract ? (
                                <p className="text-xs text-blue-600">
                                    Next plan: <strong>{pendingContract.planCode}</strong>
                                    {pendingContract.planVersionTag ? ` (${pendingContract.planVersionTag})` : ''}
                                    {' — activates automatically when trial ends'}
                                </p>
                            ) : (
                                <p className="text-xs text-amber-700 font-medium">
                                    ⚠ No plan scheduled — organization will be <strong>suspended</strong> after trial ends.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                        { label: 'Contract ID', value: String(contract._id), mono: true, truncate: true },
                        { label: 'Plan Code', value: contract.planCode, bold: true },
                        { label: 'Plan Version', value: contract.planVersionTag },
                        { label: 'Status', value: <StatusPill status={contract.contractStatus} /> },
                        { label: 'Locked Price', value: fmtMoney(contract.lockedPrice, contract.currency) },
                        { label: 'Currency', value: contract.currency },
                        { label: 'Start Date', value: fmt(contract.effectiveFrom) },
                        { label: 'End Date', value: fmt(contract.effectiveTo) || 'Open-ended' },
                        { label: 'Trial Ends', value: contract.trialDays > 0 ? fmt(contract.trialEndDate) : '--' },
                        {
                            label: 'Auto-Renew',
                            // Derived from pendingContract existence, not from contract.autoRenew
                            // (which defaults to true on all contracts including trial-only)
                            value: autoRenew ? 'Yes' : 'No'
                        },
                        { label: 'Grace Period', value: `${contract.gracePeriodDays ?? 0} days` },
                        { label: 'Activated At', value: fmt(contract.updatedAt) },
                    ].map(({ label, value, mono, bold, truncate }) => (
                        <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                            {typeof value === 'string' || typeof value === 'number' ? (
                                <p className={`text-xs ${bold ? 'font-bold' : 'font-medium'} text-slate-800 ${mono ? 'font-mono' : ''} ${truncate ? 'truncate' : ''}`}>
                                    {value || '—'}
                                </p>
                            ) : value}
                        </div>
                    ))}
                </div>
            </Card >

            {/* Confirm Cancel Contract Dialog */}
            < ConfirmDialog
                open={confirmCancel}
                title="Cancel Contract"
                description="The organization will lose plan access at the end of the current billing period. Existing invoices will not be affected."
                confirmLabel="Cancel Contract"
                cancelLabel="Keep Active"
                intent="danger"
                loading={canceling}
                onConfirm={async () => { setConfirmCancel(false); await handleCancel(); }
                }
                onCancel={() => setConfirmCancel(false)}
            />
        </>
    );
}

function UpcomingPlanCard({ contract }) {
    if (!contract) return null;

    return (
        <Card>
            <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-blue-50 rounded-xl border border-blue-100">
                    <CalendarClock className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-sm font-bold text-slate-900">Upcoming Plan</h2>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700 border border-blue-200">
                            <Clock className="w-2.5 h-2.5" />
                            PENDING
                        </span>
                    </div>
                    <p className="text-xs text-slate-400">Activates automatically when trial ends</p>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                    { label: 'Plan', value: contract.planCode, bold: true },
                    { label: 'Version', value: contract.planVersionTag },
                    { label: 'Locked Price', value: fmtMoney(contract.lockedPrice, contract.currency) },
                    { label: 'Starts On', value: fmt(contract.effectiveFrom) },
                    { label: 'Status', value: <StatusPill status={contract.contractStatus} /> },
                    { label: 'Auto-Renew', value: contract.autoRenew ? 'Yes' : 'No' },
                ].map(({ label, value, bold }) => (
                    <div key={label} className="bg-blue-50/50 rounded-xl p-3 border border-blue-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                        {typeof value === 'string' ? (
                            <p className={`text-xs ${bold ? 'font-bold' : 'font-medium'} text-slate-800`}>{value || '—'}</p>
                        ) : value}
                    </div>
                ))}
            </div>
        </Card>
    );
}

// ─── Section B — Contract History Table ───────────────────────────────────────

function ContractHistoryTable({ contracts }) {
    if (!contracts || contracts.length === 0) {
        return (
            <Card>
                <CardHeader title="Contract History" icon={FileText} />
                <div className="mt-4 py-8 text-center text-sm text-slate-400">No contract history found.</div>
            </Card>
        );
    }

    return (
        <Card padding="none">
            <div className="p-5 border-b border-brand-border flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl border border-indigo-100">
                    <FileText className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-slate-900">Contract History</h2>
                    <p className="text-xs text-slate-400">{contracts.length} contract{contracts.length !== 1 ? 's' : ''} total</p>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-surface-soft">
                            {['Status', 'Plan', 'Version', 'Start', 'End', 'Locked Price', 'Superseded By'].map(h => (
                                <th key={h} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {contracts.map(c => (
                            <tr key={c._id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="px-5 py-3">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <StatusPill status={c.contractStatus} />
                                        {c.source === 'sales' && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-violet-50 text-violet-700 border border-violet-200">
                                                SALES
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-5 py-3 text-xs font-bold text-slate-900">{c.planCode}</td>
                                <td className="px-5 py-3 text-xs text-slate-500">{c.planVersionTag}</td>
                                <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt(c.effectiveFrom)}</td>
                                <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{fmt(c.effectiveTo) || '—'}</td>
                                <td className="px-5 py-3 text-xs font-medium text-slate-800">
                                    {fmtMoney(c.lockedPrice, c.currency)}
                                </td>
                                <td className="px-5 py-3 text-[10px] font-mono text-slate-400 truncate max-w-[120px]">
                                    {c.supersededById ? String(c.supersededById) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

// ─── Section C — Invoice Table ────────────────────────────────────────────────

function InvoiceTable({ invoices }) {
    if (!invoices || invoices.length === 0) {
        return (
            <Card>
                <CardHeader title="Invoice History" icon={DollarSign} />
                <div className="mt-4 py-8 text-center text-sm text-slate-400">No invoices found.</div>
            </Card>
        );
    }

    return (
        <Card padding="none">
            <div className="p-5 border-b border-brand-border flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-100">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                    <h2 className="text-sm font-bold text-slate-900">Invoice History</h2>
                    <p className="text-xs text-slate-400">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-surface-soft">
                            {['Invoice ID', 'Type', 'Amount', 'Currency', 'Status', 'Paid At'].map(h => (
                                <th key={h} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-brand-border whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {invoices.map(inv => {
                            const isTrial = inv.metadata?.isTrialActivation || inv.metadata?.trialProvisioning;
                            return (
                                <tr key={inv._id} className="hover:bg-slate-50/60 transition-colors">
                                    <td className="px-5 py-3">
                                        <p className="text-[10px] font-mono text-slate-500 truncate max-w-[120px]">{String(inv._id)}</p>
                                        {isTrial && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-600 border border-blue-200 mt-0.5">
                                                TRIAL
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500 capitalize">{inv.invoiceType}</td>
                                    <td className="px-5 py-3 text-xs font-bold text-slate-900">
                                        {fmtMoney(inv.totalAmount, inv.currency)}
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500">{inv.currency}</td>
                                    <td className="px-5 py-3">
                                        <StatusPill status={inv.status} />
                                    </td>
                                    <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                                        {fmt(inv.paidAt)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function OrganizationSubscriptionsTab({ orgId }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showUpgrade, setShowUpgrade] = useState(false);

    const fetchContracts = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await platformApi.get(`/organizations/${orgId}/contracts`);
            setData(res.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to load contract data');
        } finally {
            setLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        fetchContracts();
    }, [fetchContracts]);

    if (loading) return <LoadingState message="Loading subscription data…" />;
    if (error) return <ErrorState message={error} onRetry={fetchContracts} />;

    // Derive pending contract from the full contracts list
    const pendingContract = (data?.contracts || []).find(
        c => c.contractStatus === 'pending_activation'
    ) || null;

    return (
        <div className="space-y-6">
            {/* Section A — Active Contract */}
            <ActiveContractCard
                contract={data?.currentContract}
                orgId={orgId}
                onUpgrade={() => setShowUpgrade(true)}
                onRefetch={fetchContracts}
                pendingContract={pendingContract}
            />

            {/* Sprint 8 — Debug timeline for active contract */}
            {data?.currentContract?._id && (
                <ContractTimelinePanel contractId={String(data.currentContract._id)} />
            )}

            {/* Section A2 — Upcoming Pending Plan (shown when trial active + pending exists) */}
            {pendingContract && <UpcomingPlanCard contract={pendingContract} />}

            {/* Section B — Contract History */}
            <ContractHistoryTable contracts={data?.contracts || []} />

            {/* Section C — Invoice History */}
            <InvoiceTable invoices={data?.invoices || []} />

            {/* Contract Builder Wizard (replaces UpgradeContractModal — Section 17) */}
            {showUpgrade && (
                <ContractBuilderWizard
                    orgId={orgId}
                    currentContract={data?.currentContract}
                    onClose={() => setShowUpgrade(false)}
                    onSuccess={fetchContracts}
                />
            )}
        </div>
    );
}