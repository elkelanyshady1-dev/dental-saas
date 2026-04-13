/**
 * UpgradeContractModal.jsx
 * Platform — Contract Upgrade Workflow (v22 — Single-Call Architecture)
 *
 * ── Architecture ──────────────────────────────────────────────────────────────
 *
 *   BEFORE (broken):
 *     Browser → POST /contracts
 *             → POST /contracts/:id/invoice
 *             → POST /invoices/:id/pay        ← 410 GONE (deprecated)
 *             → PATCH /contracts/:id/status
 *   (No atomicity. Deprecated endpoint. Client-side pricing. Orphaned states on failure.)
 *
 *   AFTER (correct):
 *     Browser → POST /contracts/preview       (read-only: get price from pricingEngine)
 *             → POST /contracts/upgrade        (single atomic call → BillingOrchestrator)
 *
 * ── Pricing Rule ──────────────────────────────────────────────────────────────
 *   The frontend NEVER computes a price.
 *   All prices come from POST /contracts/preview → pricingEngine.computePrice().
 *   The upgrade call uses the preview result for display only.
 *   The backend re-computes via pricingEngine inside the transaction.
 *
 * ── Failure Handling ──────────────────────────────────────────────────────────
 *   Upgrade endpoint uses a MongoDB transaction.
 *   On any failure, the transaction is aborted. No partial state is left.
 *   The browser shows the error and offers a retry button.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    X, Zap, CheckCircle2, Loader2, AlertTriangle,
    Clock, ArrowRight, RefreshCw, TrendingUp, TrendingDown,
    ShieldCheck
} from 'lucide-react';
import platformApi from '@/platform/auth/platformApi';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function intervalLabel(interval) {
    const map = { monthly: '/month', yearly: '/year', biennial: '/2 years' };
    return map[interval] || (interval ? `/${interval}` : '/month');
}

function fmtPrice(amount, currency = 'USD') {
    if (amount == null) return '—';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
        return `${currency} ${Number(amount).toFixed(2)}`;
    }
}

/** Resolve the best display name for a plan version. */
function pvDisplayName(pv) {
    if (!pv) return '—';
    return pv.templateName || pv.label || pv.planCode || pv.templateCode || '—';
}

// ─── Plan Card ───────────────────────────────────────────────────────────────

function PlanCard({ pv, isSelected, onSelect, preview, previewLoading }) {
    const showPrice = isSelected && preview && !previewLoading;

    return (
        <button
            key={pv._id}
            onClick={() => onSelect(pv)}
            className={`
                w-full text-left p-4 rounded-xl border-2 transition-all
                ${isSelected
                    ? 'border-brand-primary bg-brand-primary/5'
                    : 'border-slate-200 hover:border-slate-300 bg-white'}
            `}
        >
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-bold text-slate-900">
                        {pvDisplayName(pv)}
                    </p>
                    <p className="text-[11px] text-slate-400">
                        {pv.versionTag} · {pv.status}
                        {pv.templateCode && pv.templateCode !== pv.templateName && (
                            <span className="ml-1 opacity-60">({pv.templateCode})</span>
                        )}
                    </p>
                </div>
                <div className="text-right">
                    {showPrice ? (
                        <>
                            <p className="text-sm font-black text-slate-900">
                                {fmtPrice(preview.price, preview.currency)}
                            </p>
                            <p className="text-[10px] text-slate-400">
                                {intervalLabel(preview.billingInterval)}
                            </p>
                        </>
                    ) : isSelected && previewLoading ? (
                        <Loader2 className="w-4 h-4 text-brand-primary animate-spin" />
                    ) : null}
                </div>
            </div>
        </button>
    );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function UpgradeContractModal({ orgId, currentContract, onClose, onSuccess }) {
    const [planVersions, setPlanVersions] = useState([]);
    const [selectedPV, setSelectedPV] = useState(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);

    // Preview state — backend-authoritative pricing
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(null);

    // Upgrade workflow state
    const [upgrading, setUpgrading] = useState(false);
    const [upgradeError, setUpgradeError] = useState(null);
    const [result, setResult] = useState(null);   // backend response on success

    // ── Load available PlanVersions ───────────────────────────────────────────
    useEffect(() => {
        platformApi.get('/plan-versions?status=active')
            .then(r => {
                const list = Array.isArray(r.data)
                    ? r.data
                    : (r.data?.planVersions || r.data?.data || []);
                setPlanVersions(list);
                if (list.length > 0) setSelectedPV(list[0]);
            })
            .catch(e => setFetchError(e.response?.data?.message || 'Failed to load plans'))
            .finally(() => setLoading(false));
    }, []);

    // ── Backend price preview ─────────────────────────────────────────────────
    // Called every time the selected plan changes.
    // Uses POST /contracts/preview → pricingEngine (no writes).
    const runPreview = useCallback(async (pv) => {
        if (!pv || !orgId) return;
        setPreviewLoading(true);
        setPreviewError(null);
        setPreview(null);
        try {
            const r = await platformApi.post('/contracts/preview', {
                organizationId: orgId,
                planVersionId: pv._id,
                billingInterval: 'monthly',   // default; billingInterval selector can extend this
            });
            setPreview(r.data?.data || r.data);
        } catch (e) {
            setPreviewError(e.response?.data?.message || 'Price preview unavailable');
        } finally {
            setPreviewLoading(false);
        }
    }, [orgId]);

    useEffect(() => {
        if (selectedPV) runPreview(selectedPV);
    }, [selectedPV, runPreview]);

    // ── Single-call atomic upgrade ────────────────────────────────────────────
    // POST /contracts/upgrade → BillingOrchestratorService.upgradeSubscription()
    // The orchestrator runs all 4 steps inside a MongoDB transaction.
    // On any failure, the transaction aborts. No partial state is created.
    const runUpgrade = async () => {
        if (!selectedPV || previewLoading || previewError) return;

        setUpgrading(true);
        setUpgradeError(null);
        setResult(null);

        try {
            const res = await platformApi.post('/contracts/upgrade', {
                organizationId: orgId,
                planVersionId: selectedPV._id,
                billingInterval: preview?.billingInterval || 'monthly',
                paymentMethod: 'manual',
                autoRenew: true,
            });

            const data = res.data?.data || res.data;
            setResult(data);

            // Auto-close on success (immediate activation path)
            if (data?.status !== 'pending_activation') {
                setTimeout(() => {
                    onSuccess?.();
                    onClose();
                }, 2000);
            }

        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Upgrade failed';
            setUpgradeError(msg);
        } finally {
            setUpgrading(false);
        }
    };

    // ── Derived state ─────────────────────────────────────────────────────────
    const isIdle = !upgrading && !result && !upgradeError;
    const isPendingActivation = result?.status === 'pending_activation';
    const isActivated = result?.status === 'activated';
    const canConfirm = selectedPV && !loading && !previewLoading && !previewError && preview;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={isIdle ? onClose : undefined}
            />

            {/* Panel */}
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-brand-primary/10 rounded-xl">
                            <Zap className="w-5 h-5 text-brand-primary" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-slate-900">Upgrade Plan</h2>
                            <p className="text-[11px] text-slate-400">
                                {currentContract
                                    ? `Current: ${currentContract.planCode || currentContract.planVersionTag || '—'} (${currentContract.contractStatus})`
                                    : 'No active contract — upgrading from trial'}
                            </p>
                        </div>
                    </div>
                    {isIdle && (
                        <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    )}
                </div>

                <div className="p-6 space-y-5">

                    {/* Loading plans */}
                    {loading && (
                        <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Loading available plans…</span>
                        </div>
                    )}

                    {/* Fetch error */}
                    {fetchError && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                            <p className="text-xs text-red-700 font-medium">{fetchError}</p>
                        </div>
                    )}

                    {/* Plan selector (idle phase only) */}
                    {!loading && !fetchError && isIdle && (
                        <>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                    Select New Plan
                                </p>
                                {planVersions.length === 0 ? (
                                    <div className="py-4 text-center text-sm text-slate-400">
                                        No active plan versions available.
                                    </div>
                                ) : (
                                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                                        {planVersions.map(pv => (
                                            <PlanCard
                                                key={pv._id}
                                                pv={pv}
                                                isSelected={selectedPV?._id === pv._id}
                                                onSelect={setSelectedPV}
                                                preview={selectedPV?._id === pv._id ? preview : null}
                                                previewLoading={selectedPV?._id === pv._id && previewLoading}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Comparison panel */}
                            {selectedPV && preview && !previewLoading && (
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                                        Upgrade Summary
                                    </p>
                                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                                        {/* Current */}
                                        <div className="p-3 bg-white rounded-xl border border-slate-200">
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Current</p>
                                            <p className="text-xs font-black text-slate-700 truncate">
                                                {currentContract?.planCode || '—'}
                                            </p>
                                            <p className="text-[10px] text-slate-400">{currentContract?.planVersionTag || 'trial'}</p>
                                            <p className="text-xs font-bold text-slate-900 mt-1">
                                                {fmtPrice(currentContract?.lockedPrice, currentContract?.currency)}
                                                <span className="text-[9px] font-normal text-slate-400 ml-0.5">
                                                    {intervalLabel(currentContract?.billingInterval)}
                                                </span>
                                            </p>
                                        </div>

                                        {/* Arrow */}
                                        <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />

                                        {/* New plan — data comes from pricingEngine preview, NOT from raw pricing fields */}
                                        <div className="p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/20">
                                            <p className="text-[9px] font-black text-brand-primary uppercase tracking-widest mb-1">New</p>
                                            <p className="text-xs font-black text-slate-700 truncate">
                                                {pvDisplayName(selectedPV)}
                                            </p>
                                            <p className="text-[10px] text-slate-400">{selectedPV.versionTag}</p>
                                            <p className="text-xs font-bold text-slate-900 mt-1">
                                                {fmtPrice(preview.price, preview.currency)}
                                                <span className="text-[9px] font-normal text-slate-400 ml-0.5">
                                                    {intervalLabel(preview.billingInterval)}
                                                </span>
                                            </p>
                                        </div>
                                    </div>

                                    {/* Tax breakdown if applicable */}
                                    {preview.tax > 0 && (
                                        <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                                            <span className="text-[10px] text-slate-400">Includes tax</span>
                                            <span className="text-[10px] font-bold text-slate-600">
                                                +{fmtPrice(preview.tax, preview.currency)}
                                            </span>
                                        </div>
                                    )}

                                    {/* Price delta */}
                                    {currentContract?.lockedPrice != null && preview?.price != null && (
                                        <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between">
                                            <span className="text-xs text-slate-500 font-medium">Price difference</span>
                                            <span className={`text-xs font-black ${preview.price > currentContract.lockedPrice
                                                    ? 'text-red-600'
                                                    : preview.price < currentContract.lockedPrice
                                                        ? 'text-emerald-600'
                                                        : 'text-slate-500'
                                                }`}>
                                                {preview.price > currentContract.lockedPrice ? (
                                                    <><TrendingUp className="inline w-3 h-3 mr-0.5" />
                                                        +{fmtPrice(preview.price - currentContract.lockedPrice, preview.currency)}
                                                        {intervalLabel(preview.billingInterval)}</>
                                                ) : preview.price < currentContract.lockedPrice ? (
                                                    <><TrendingDown className="inline w-3 h-3 mr-0.5" />
                                                        -{fmtPrice(currentContract.lockedPrice - preview.price, preview.currency)}
                                                        {intervalLabel(preview.billingInterval)}</>
                                                ) : 'No change'}
                                            </span>
                                        </div>
                                    )}

                                    {/* Atomic guarantee notice */}
                                    <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400">
                                        <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                                        Upgrade is atomic — rollback guaranteed on failure
                                    </div>
                                </div>
                            )}

                            {/* Preview error */}
                            {previewError && (
                                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                    <p className="text-xs text-amber-700 font-medium">{previewError}</p>
                                </div>
                            )}
                        </>
                    )}

                    {/* Upgrading spinner */}
                    {upgrading && (
                        <div className="flex flex-col items-center gap-4 py-6">
                            <div className="relative">
                                <div className="w-14 h-14 rounded-full border-4 border-brand-primary/20 flex items-center justify-center">
                                    <Loader2 className="w-7 h-7 text-brand-primary animate-spin" />
                                </div>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-black text-slate-900">Upgrading…</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    Running atomic upgrade — do not close this window
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Upgrade error */}
                    {upgradeError && !upgrading && (
                        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-bold text-red-700">Upgrade Failed</p>
                                <p className="text-xs text-red-600 mt-1">{upgradeError}</p>
                                <p className="text-[10px] text-red-400 mt-2">
                                    The transaction was aborted. No changes were made.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Pending activation success */}
                    {result && isPendingActivation && (
                        <div className="flex flex-col items-center gap-3 py-4 text-center">
                            <div className="p-3 bg-blue-50 rounded-full border border-blue-200">
                                <Clock className="w-7 h-7 text-blue-500" />
                            </div>
                            <p className="text-sm font-black text-slate-900">Plan Scheduled</p>
                            <p className="text-xs text-slate-500 max-w-xs">
                                Your paid plan is pre-paid and will activate when the current trial ends.
                                Your trial continues until then.
                            </p>
                            <div className="text-[10px] text-slate-400">
                                {fmtPrice(result.price, result.currency)} {intervalLabel(result.billingInterval)} · {result.billingInterval}
                            </div>
                        </div>
                    )}

                    {/* Immediate activation success */}
                    {result && isActivated && (
                        <div className="flex flex-col items-center gap-3 py-4">
                            <div className="p-3 bg-emerald-50 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                            </div>
                            <p className="text-sm font-black text-slate-900">Upgrade Successful</p>
                            <p className="text-xs text-slate-400 text-center">
                                Contract activated. Organization plan updated.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex gap-3 p-6 border-t border-slate-100">
                    {/* Idle: show Cancel + Confirm */}
                    {isIdle && !loading && !fetchError && (
                        <>
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={runUpgrade}
                                disabled={!canConfirm}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-brand-primary rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                                title={!preview ? 'Waiting for pricing preview…' : undefined}
                            >
                                <ArrowRight className="w-4 h-4" />
                                {previewLoading ? 'Loading price…' : 'Confirm Upgrade'}
                            </button>
                        </>
                    )}

                    {/* During upgrade: lock buttons */}
                    {upgrading && (
                        <div className="w-full flex items-center justify-center gap-2 text-sm text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing…
                        </div>
                    )}

                    {/* Error: show Close + Retry */}
                    {upgradeError && !upgrading && (
                        <>
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => { setUpgradeError(null); }}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-brand-primary rounded-xl hover:opacity-90 transition-opacity"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </button>
                        </>
                    )}

                    {/* Pending activation: show Close + Done */}
                    {result && isPendingActivation && (
                        <>
                            <button
                                onClick={() => { onSuccess?.(); onClose(); }}
                                className="flex-1 px-4 py-2.5 text-sm font-bold text-white bg-brand-primary rounded-xl hover:opacity-90 transition-opacity"
                            >
                                Done
                            </button>
                        </>
                    )}

                    {/* Immediate success: auto-closes, show nothing or spinner */}
                    {result && isActivated && (
                        <div className="w-full flex items-center justify-center gap-2 text-sm text-slate-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Closing…
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
