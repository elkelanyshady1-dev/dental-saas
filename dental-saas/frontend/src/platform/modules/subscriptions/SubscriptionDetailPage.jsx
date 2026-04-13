/**
 * SubscriptionDetailPage.jsx
 * Platform — Subscription / Contract Detail View
 * Token-aligned rewrite. No bg-white/10 glassmorphism.
 */
import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft, CreditCard, DollarSign, Calendar,
    RotateCcw, XCircle, Users, Building2
} from 'lucide-react';
import { getSubscriptionOverview, cancelSubscription } from '@/platform/services/subscriptionService';
import CreditAdjustmentModal from './components/CreditAdjustmentModal';
import RequireCapability from '@/platform/core/guards/RequireCapability';
import PageContainer from '@/platform/core/ui/PageContainer';
import Card, { CardHeader } from '@/platform/core/ui/Card';
import { OrgStatusBadge } from '@/platform/core/ui/StatusBadge';
import { LoadingState, ErrorState } from '@/platform/core/ui/Feedback';
import Button from '@/platform/core/ui/Button';
import { ConfirmDialog } from '@/platform/core/ui';

// ── Usage progress bar ──────────────────────────────────────────────────────
function UsageBar({ label, used, max }) {
    const pct = max > 0 ? Math.min((used / max) * 100, 100) : 0;
    const isHigh = pct >= 80;
    const isMed = pct >= 60;
    const barColor = isHigh ? 'bg-red-500' : isMed ? 'bg-amber-400' : 'bg-blue-500';

    return (
        <div>
            <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <span className={`text-xs font-bold ${isHigh ? 'text-red-600' : 'text-slate-500'}`}>
                    {used} / {max}
                </span>
            </div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

// ── Stat cell ────────────────────────────────────────────────────────────────
function StatCell({ icon: Icon, label, value, sub, iconColor = 'text-blue-500' }) {
    return (
        <Card padding="sm">
            <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg bg-slate-50 border border-slate-100 shrink-0 ${iconColor}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
                    <p className="text-xl font-bold text-slate-900 truncate">{value}</p>
                    {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
                </div>
            </div>
        </Card>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────
const SubscriptionDetailPageContent = () => {
    const { orgId } = useParams();
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isAdjusting, setIsAdjusting] = useState(false);
    const [isCanceling, setIsCanceling] = useState(false);
    const [cancelError, setCancelError] = useState(null);
    const [confirmCancelMode, setConfirmCancelMode] = useState(null); // 'period_end' | 'immediate' | null

    const fetchOverview = async () => {
        try {
            const data = await getSubscriptionOverview(orgId);
            setOverview(data);
        } catch (err) {
            console.error("Failed to fetch subscription overview", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOverview(); }, [orgId]);

    const handleCancel = async (mode) => {
        // Step 1: open ConfirmDialog — do NOT call this directly from onClick
        // This handler runs only after admin confirms
        setCancelError(null);
        setIsCanceling(true);
        try {
            await cancelSubscription(orgId, mode);
            await fetchOverview();
        } catch (err) {
            setCancelError(err.response?.data?.message || "Failed to cancel subscription");
        } finally {
            setIsCanceling(false);
        }
    };

    if (loading) return <LoadingState message="Loading subscription details…" fullPage />;
    if (!overview) return <ErrorState message="Organization or subscription not found." />;

    const { organization, contract, subscription, financials, usage, limits } = overview;
    const activeContract = contract || subscription || {};
    const contractStatus = activeContract.contractStatus || activeContract.status;
    const isActive = contractStatus === 'active';

    return (
        <>
            <PageContainer
                title={organization.name}
                subtitle="Subscription & Contract Management"
                icon={CreditCard}
                actions={
                    <div className="flex items-center gap-3">
                        <Link
                            to="/platform/subscriptions"
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" /> All Subscriptions
                        </Link>
                        <Button
                            variant="secondary"
                            size="md"
                            icon={DollarSign}
                            onClick={() => setIsAdjusting(true)}
                        >
                            Adjust Credits
                        </Button>
                        {!isActive && (
                            <Button
                                variant="danger"
                                size="md"
                                icon={XCircle}
                                loading={isCanceling}
                                onClick={() => setConfirmCancelMode('period_end')}
                            >
                                Cancel Subscription
                            </Button>
                        )}
                    </div>
                }
            >
                {cancelError && (
                    <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                        <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                        <p className="text-red-700 text-sm font-medium">{cancelError}</p>
                    </div>
                )}

                {/* ── KPI stat row ─────────────────────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCell
                        icon={CreditCard}
                        label="Plan & Contract"
                        value={(activeContract.planCode || activeContract.planVersionTag || "—").toUpperCase()}
                        sub={activeContract.billingInterval ? `${activeContract.billingInterval} billing` : undefined}
                        iconColor="text-blue-500"
                    >
                        <OrgStatusBadge status={contractStatus} />
                    </StatCell>

                    <StatCell
                        icon={DollarSign}
                        label="Credit Balance"
                        value={`$${(financials?.creditBalance ?? 0).toFixed(2)}`}
                        sub="Stored prepaid credits"
                        iconColor="text-emerald-500"
                    />

                    <StatCell
                        icon={Calendar}
                        label="Contract Period"
                        value={activeContract.effectiveFrom
                            ? new Date(activeContract.effectiveFrom).toLocaleDateString()
                            : "N/A"}
                        sub={activeContract.effectiveTo
                            ? `→ ${new Date(activeContract.effectiveTo).toLocaleDateString()}`
                            : "Open-ended"}
                        iconColor="text-indigo-500"
                    />
                </div>

                {/* ── Status badge row ─────────────────────────────────────── */}
                <div className="flex items-center gap-4">
                    <OrgStatusBadge status={contractStatus} />
                    <span className="text-sm text-slate-400">
                        Auto-renew: <strong className={activeContract.autoRenew ? 'text-emerald-600' : 'text-slate-500'}>
                            {activeContract.autoRenew ? 'On' : 'Off'}
                        </strong>
                    </span>
                </div>

                {/* ── Usage compliance ──────────────────────────────────────── */}
                {usage && limits && (
                    <Card>
                        <CardHeader title="Usage Compliance" icon={Building2} />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <UsageBar label="Branches" used={usage.branches ?? 0} max={limits.maxBranches ?? 0} />
                            <UsageBar label="Users" used={usage.users ?? 0} max={limits.maxUsers ?? 0} />
                        </div>
                    </Card>
                )}

                {/* ── Credit adjustment modal ───────────────────────────────── */}
                {isAdjusting && (
                    <CreditAdjustmentModal
                        orgId={orgId}
                        currentCredit={financials?.creditBalance}
                        onClose={() => setIsAdjusting(false)}
                        onUpdate={fetchOverview}
                    />
                )}
            </PageContainer>

            {/* ── Confirm Cancel Subscription Dialog ──────────────────────── */}
            <ConfirmDialog
                open={!!confirmCancelMode}
                title={confirmCancelMode === 'immediate' ? 'Cancel Immediately' : 'Cancel at Period End'}
                description={
                    confirmCancelMode === 'immediate'
                        ? 'The organization will lose plan access immediately. This action cannot be undone. Issue a credit if a refund is required.'
                        : 'The subscription will be canceled at the end of the current billing period. The organization retains access until then.'
                }
                confirmLabel={confirmCancelMode === 'immediate' ? 'Cancel Immediately' : 'Cancel at Period End'}
                cancelLabel="Keep Subscription"
                intent="danger"
                loading={isCanceling}
                onConfirm={async () => {
                    const mode = confirmCancelMode;
                    setConfirmCancelMode(null);
                    await handleCancel(mode);
                }}
                onCancel={() => setConfirmCancelMode(null)}
            />
        </>
    );
};

export default function SubscriptionDetailPage() {
    return (
        <RequireCapability permission="MANAGE_SUBSCRIPTIONS">
            <SubscriptionDetailPageContent />
        </RequireCapability>
    );
}
