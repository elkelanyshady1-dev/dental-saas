/**
 * ContractBuilderWizard.jsx
 * Platform — Multi-Step Contract Builder
 *
 * Sections 2-9: Replace UpgradeContractModal with enterprise contract wizard.
 *
 * Steps:
 *   1 — Select Plan         (planVersionId)
 *   2 — Configure Contract  (dates, billing interval, trial override, auto-renew)
 *   3 — Billing Preview     (pricing preview + discount / entitlement overrides)
 *   4 — Confirm & Create    (submit → POST /contracts/upgrade)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    X, ChevronRight, ChevronLeft, Check, Loader2,
    Zap, Calendar, DollarSign, Tag, Users, Building2,
    CreditCard, AlertTriangle, CheckCircle2, Package,
    Sliders, RefreshCw, ShieldCheck, Clock
} from 'lucide-react';
import platformApi from '@/platform/auth/platformApi';


// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (iso) =>
    iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtMoney = (val, currency = 'USD') => {
    if (val == null) return '—';
    try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
    } catch {
        return `${currency} ${Number(val).toFixed(2)}`;
    }
};

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = [
    { id: 1, label: 'Select Plan', icon: Package },
    { id: 2, label: 'Configure', icon: Sliders },
    { id: 3, label: 'Preview', icon: DollarSign },
    { id: 4, label: 'Confirm', icon: ShieldCheck },
];

function StepIndicator({ current }) {
    return (
        <div className="flex items-center gap-0 mb-8">
            {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = current > s.id;
                const active = current === s.id;
                return (
                    <React.Fragment key={s.id}>
                        <div className="flex flex-col items-center">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${done ? 'bg-emerald-500 border-emerald-500 text-white' :
                                active ? 'bg-brand-primary border-brand-primary text-white' :
                                    'bg-white border-slate-200 text-slate-400'
                                }`}>
                                {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                            </div>
                            <span className={`mt-1.5 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${active ? 'text-brand-primary' : done ? 'text-emerald-600' : 'text-slate-400'
                                }`}>{s.label}</span>
                        </div>
                        {i < STEPS.length - 1 && (
                            <div className={`flex-1 h-0.5 mx-2 mb-4 transition-all duration-500 ${done ? 'bg-emerald-400' : 'bg-slate-100'
                                }`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

// ─── Step 1: Plan Selection ───────────────────────────────────────────────────

function StepPlanSelection({ selected, onSelect }) {
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        platformApi.get('/plan-versions?status=active&limit=50')
            .then(res => {
                const data = res.data?.data || res.data?.planVersions || res.data || [];
                setPlans(Array.isArray(data) ? data : []);
                setError(null);
            })
            .catch(err => setError(err.response?.data?.message || 'Failed to load plans'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
        </div>
    );
    if (error) return (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
        </div>
    );
    if (plans.length === 0) return (
        <div className="py-12 text-center text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">No active plan versions available.</p>
            <p className="text-xs mt-1">Publish a plan version in Plan Builder first.</p>
        </div>
    );

    return (
        <div className="space-y-3">
            <p className="text-xs text-slate-500 mb-4">
                Select the plan version to provision for this organization.
            </p>
            <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto pr-1">
                {plans.map(pv => {
                    const isSelected = selected?._id === pv._id;
                    const region = pv.pricing?.regions?.[0];
                    const monthlyPrice = region?.monthly;
                    const isZeroPrice = monthlyPrice === 0;
                    return (
                        <button
                            key={pv._id}
                            type="button"
                            id={`plan-select-${pv._id}`}
                            onClick={() => onSelect(pv)}
                            className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 group ${isSelected
                                ? 'border-brand-primary bg-blue-50'
                                : 'border-slate-100 bg-white hover:border-slate-300 hover:bg-slate-50'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-bold text-slate-900">
                                            {pv.label || pv.templateCode}
                                        </p>
                                        {pv.versionTag && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-100 text-slate-500 border border-slate-200">
                                                {pv.versionTag}
                                            </span>
                                        )}
                                        {pv.visibility && pv.visibility !== 'public' && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-50 text-amber-600 border border-amber-200">
                                                {pv.visibility}
                                            </span>
                                        )}
                                        {/* §9 — Grace Access eligibility badge */}
                                        {isZeroPrice && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-green-50 text-green-600 border border-green-200">
                                                Eligible for Grace Access
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                        {monthlyPrice != null && (
                                            <span className="text-xs font-bold text-brand-primary">
                                                {fmtMoney(monthlyPrice, region?.currency || 'USD')} / month
                                            </span>
                                        )}
                                        {pv.trialDays > 0 && (
                                            <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {pv.trialDays}-day trial
                                            </span>
                                        )}
                                        {pv.templateCode && (
                                            <span className="text-[10px] font-mono text-slate-400">{pv.templateCode}</span>
                                        )}
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${isSelected ? 'border-brand-primary bg-brand-primary' : 'border-slate-200'
                                    }`}>
                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Step 2: Contract Configuration ──────────────────────────────────────────

function StepConfiguration({ config, onChange, selectedPlan, accessConfig, onAccessConfigChange }) {
    const isNonBillable = accessConfig.mode === 'grace' || accessConfig.mode === 'trial';

    return (
        <div className="space-y-5">
            <p className="text-xs text-slate-500">
                Configure contract terms for <strong>{selectedPlan?.label || selectedPlan?.templateCode}</strong>.
            </p>

            {/* §2 — Access Type Selector */}
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Access Type
                </label>
                <div className="flex gap-2">
                    {[
                        { key: 'default', label: 'Standard' },
                        { key: 'trial',   label: 'Trial' },
                        { key: 'grace',   label: 'Grace Access' },
                    ].map(opt => (
                        <button
                            key={opt.key}
                            type="button"
                            id={`access-type-${opt.key}`}
                            onClick={() => onAccessConfigChange('mode', opt.key)}
                            className={`flex-1 py-2 text-xs font-bold rounded-xl border-2 capitalize transition-all ${
                                accessConfig.mode === opt.key
                                    ? opt.key === 'grace'
                                        ? 'border-green-500 bg-green-50 text-green-700'
                                        : opt.key === 'trial'
                                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                                            : 'border-brand-primary bg-blue-50 text-brand-primary'
                                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* §3 — Grace Duration Input */}
            {accessConfig.mode === 'grace' && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-green-600 mb-1">
                        Grace Duration (days)
                    </label>
                    <input
                        id="grace-days"
                        type="number"
                        min={1}
                        max={365}
                        value={accessConfig.graceDays}
                        onChange={e => onAccessConfigChange('graceDays', Number(e.target.value))}
                        className="w-full text-sm border border-green-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-400 bg-white text-slate-800"
                    />
                    <p className="text-xs text-green-600 mt-1">
                        Free access period without billing
                    </p>
                </div>
            )}

            {/* Billing Interval */}
            <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Billing Interval
                </label>
                <div className="flex gap-2">
                    {['monthly', 'yearly', 'biennial'].map(interval => (
                        <button
                            key={interval}
                            type="button"
                            id={`interval-${interval}`}
                            onClick={() => onChange('billingInterval', interval)}
                            className={`flex-1 py-2 text-xs font-bold rounded-xl border-2 capitalize transition-all ${config.billingInterval === interval
                                ? 'border-brand-primary bg-blue-50 text-brand-primary'
                                : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                }`}
                        >
                            {interval}
                        </button>
                    ))}
                </div>
            </div>

            {/* §7 — Payment Method (hidden for non-billable) */}
            {!isNonBillable && (
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                        Payment Method
                    </label>
                    <div className="flex gap-2">
                        {[
                            { val: 'manual', label: 'Manual Invoice' },
                            { val: 'auto_charge', label: 'Auto Charge' },
                        ].map(m => (
                            <button
                                key={m.val}
                                type="button"
                                id={`payment-${m.val}`}
                                onClick={() => onChange('paymentMethod', m.val)}
                                className={`flex-1 py-2 text-xs font-bold rounded-xl border-2 transition-all ${config.paymentMethod === m.val
                                    ? 'border-brand-primary bg-blue-50 text-brand-primary'
                                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                                    }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* §7 — Payment Terms (hidden for non-billable) */}
            {!isNonBillable && (
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                        Payment Terms
                    </label>
                    <select
                        id="payment-terms"
                        value={config.paymentTerms}
                        onChange={e => onChange('paymentTerms', e.target.value)}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white text-slate-800"
                    >
                        <option value="due_on_receipt">Due on Receipt</option>
                        <option value="net15">Net 15</option>
                        <option value="net30">Net 30</option>
                        <option value="net60">Net 60</option>
                    </select>
                </div>
            )}

            {/* Start Date */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                        Contract Start
                    </label>
                    <input
                        id="contract-start-date"
                        type="date"
                        value={config.contractStartDate || ''}
                        onChange={e => onChange('contractStartDate', e.target.value || null)}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white text-slate-800"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">Leave blank for today</p>
                </div>
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                        Contract End <span className="text-slate-300 font-normal">(optional)</span>
                    </label>
                    <input
                        id="contract-end-date"
                        type="date"
                        value={config.contractEndDate || ''}
                        onChange={e => onChange('contractEndDate', e.target.value || null)}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white text-slate-800"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">Leave blank for open-ended</p>
                </div>
            </div>

            {/* §4 — Trial Days Override (hidden when Grace is active) */}
            {accessConfig.mode !== 'grace' && (
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                        Trial Days Override <span className="text-slate-300 font-normal">(optional)</span>
                    </label>
                    <input
                        id="trial-days-override"
                        type="number"
                        min="0"
                        max="365"
                        value={config.trialDaysOverride ?? ''}
                        placeholder={`Plan default: ${selectedPlan?.trialDays ?? 0} days`}
                        onChange={e => onChange('trialDaysOverride', e.target.value ? Number(e.target.value) : null)}
                        className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white text-slate-800"
                    />
                </div>
            )}

            {/* Auto Renew */}
            <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                    <input
                        id="auto-renew"
                        type="checkbox"
                        checked={config.autoRenew}
                        onChange={e => onChange('autoRenew', e.target.checked)}
                        className="sr-only"
                    />
                    <div className={`w-10 h-5 rounded-full border-2 transition-all duration-300 ${config.autoRenew ? 'bg-brand-primary border-brand-primary' : 'bg-slate-100 border-slate-200'
                        }`}>
                        <div className={`w-3.5 h-3.5 bg-white rounded-full shadow transition-all duration-300 mt-0.5 ${config.autoRenew ? 'ml-[22px]' : 'ml-0.5'
                            }`} />
                    </div>
                </div>
                <div>
                    <p className="text-sm font-semibold text-slate-800">Auto-Renew</p>
                    <p className="text-[10px] text-slate-400">Contract renews automatically at end of period</p>
                </div>
            </label>
        </div>
    );
}

// ─── Step 3: Billing Preview ──────────────────────────────────────────────────

function StepBillingPreview({ orgId, selectedPlan, config, overrides, onOverrideChange, preview, setPreview, accessConfig }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Section 8: detect future start date
    const isFutureContract = useMemo(() => {
        if (!config.contractStartDate) return false;
        return new Date(config.contractStartDate) > new Date();
    }, [config.contractStartDate]);

    const fetchPreview = useCallback(async () => {
        if (!selectedPlan?._id || !orgId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await platformApi.post('/contracts/preview', {
                organizationId: orgId,
                planVersionId: selectedPlan._id,
                billingInterval: config.billingInterval,
                discountPercent: overrides.discountPercent || undefined,
                discountAmount: overrides.discountAmount || undefined,
                customPriceOverride: overrides.customPriceOverride !== '' ? (overrides.customPriceOverride || undefined) : undefined,
                couponCode: overrides.couponCode || undefined,
            });
            setPreview(res.data?.data || res.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Pricing preview failed');
        } finally {
            setLoading(false);
        }
    }, [orgId, selectedPlan?._id, config.billingInterval, overrides.discountPercent, overrides.discountAmount, overrides.customPriceOverride, overrides.couponCode]);

    useEffect(() => {
        fetchPreview();
    }, [fetchPreview]);

    return (
        <div className="space-y-6">
            {/* Section 8: Future date activation banner */}
            {isFutureContract && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-amber-900">Scheduled Activation</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                            This contract will activate on <strong>{fmt(config.contractStartDate)}</strong>.
                            Billing will start after activation — no payment is charged now.
                        </p>
                    </div>
                </div>
            )}

            {/* Discount / Pricing Overrides */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pricing Overrides</p>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                            Discount % <span className="text-slate-300">(optional)</span>
                        </label>
                        <input
                            id="discount-percent"
                            type="number" min="0" max="100"
                            value={overrides.discountPercent ?? ''}
                            placeholder="e.g. 20"
                            onChange={e => onOverrideChange('discountPercent', e.target.value ? Number(e.target.value) : null)}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                            Flat Discount <span className="text-slate-300">(optional)</span>
                        </label>
                        <input
                            id="discount-amount"
                            type="number" min="0"
                            value={overrides.discountAmount ?? ''}
                            placeholder="e.g. 50"
                            onChange={e => onOverrideChange('discountAmount', e.target.value ? Number(e.target.value) : null)}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                            Custom Price Override <span className="text-slate-300">(optional)</span>
                        </label>
                        <input
                            id="custom-price-override"
                            type="number" min="0"
                            value={overrides.customPriceOverride ?? ''}
                            placeholder="Negotiated price"
                            onChange={e => onOverrideChange('customPriceOverride', e.target.value !== '' ? Number(e.target.value) : null)}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1.5">
                            Coupon Code <span className="text-slate-300">(optional)</span>
                        </label>
                        <input
                            id="coupon-code"
                            type="text"
                            value={overrides.couponCode ?? ''}
                            placeholder="ENTERPRISE20"
                            onChange={e => onOverrideChange('couponCode', e.target.value || null)}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
                        />
                    </div>
                </div>
            </div>

            {/* Entitlement Overrides */}
            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Entitlement Overrides</p>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1.5">Max Branches</label>
                        <input
                            id="entitlement-max-branches"
                            type="number" min="0"
                            value={overrides.entitlementOverrides?.maxBranches ?? ''}
                            placeholder="Plan default"
                            onChange={e => onOverrideChange('entitlementOverrides', {
                                ...overrides.entitlementOverrides,
                                maxBranches: e.target.value ? Number(e.target.value) : undefined
                            })}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1.5">Max Users</label>
                        <input
                            id="entitlement-max-users"
                            type="number" min="0"
                            value={overrides.entitlementOverrides?.maxUsers ?? ''}
                            placeholder="Plan default"
                            onChange={e => onOverrideChange('entitlementOverrides', {
                                ...overrides.entitlementOverrides,
                                maxUsers: e.target.value ? Number(e.target.value) : undefined
                            })}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white"
                        />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 mb-1.5">Support Tier</label>
                        <select
                            id="entitlement-support-tier"
                            value={overrides.entitlementOverrides?.supportTier ?? ''}
                            onChange={e => onOverrideChange('entitlementOverrides', {
                                ...overrides.entitlementOverrides,
                                supportTier: e.target.value || undefined
                            })}
                            className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-primary bg-white text-slate-800"
                        >
                            <option value="">Plan default</option>
                            <option value="basic">Basic</option>
                            <option value="standard">Standard</option>
                            <option value="premium">Premium</option>
                            <option value="enterprise">Enterprise</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* §5 — Pricing Summary Panel */}
            {accessConfig.mode === 'grace' ? (
                <div className="p-5 bg-gradient-to-br from-green-700 to-green-600 rounded-2xl text-white">
                    <p className="text-xs font-black uppercase tracking-widest text-green-200 mb-3">Access Summary</p>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-lg font-black text-white">Grace Access</p>
                            <p className="text-sm text-green-200">{accessConfig.graceDays} days — no billing</p>
                        </div>
                    </div>
                </div>
            ) : accessConfig.mode === 'trial' ? (
                <div className="p-5 bg-gradient-to-br from-blue-700 to-blue-600 rounded-2xl text-white">
                    <p className="text-xs font-black uppercase tracking-widest text-blue-200 mb-3">Access Summary</p>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <p className="text-lg font-black text-white">Trial</p>
                            <p className="text-sm text-blue-200">
                                {config.trialDaysOverride || selectedPlan?.trialDays || 0} days trial — no billing
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                /* Standard billable preview */
                !isFutureContract && (
                    <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl text-white">
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Billing Preview</p>
                            <button
                                type="button"
                                id="refresh-preview"
                                onClick={fetchPreview}
                                className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
                            >
                                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </div>
                        {loading ? (
                            <div className="flex items-center gap-2 text-slate-400">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="text-sm">Computing price…</span>
                            </div>
                        ) : error ? (
                            <div className="flex items-center gap-2 text-red-400">
                                <AlertTriangle className="w-4 h-4" />
                                <span className="text-sm">{error}</span>
                            </div>
                        ) : preview ? (
                            <div className="space-y-2">
                                {[
                                    { label: 'Base Price', value: fmtMoney(preview.basePrice ?? preview.price, preview.currency) },
                                    preview.discount > 0 && { label: 'Discount', value: `-${fmtMoney(preview.discount, preview.currency)}`, accent: 'text-emerald-400' },
                                    preview.tax > 0 && { label: 'Tax', value: fmtMoney(preview.tax, preview.currency) },
                                ].filter(Boolean).map(row => (
                                    <div key={row.label} className="flex justify-between text-sm">
                                        <span className="text-slate-400">{row.label}</span>
                                        <span className={`font-semibold ${row.accent || 'text-white'}`}>{row.value}</span>
                                    </div>
                                ))}
                                <div className="border-t border-slate-700 pt-2 mt-2 flex justify-between">
                                    <span className="text-sm font-bold text-white">Total</span>
                                    <span className="text-lg font-black text-white">
                                        {fmtMoney(preview.finalPrice, preview.currency)}
                                    </span>
                                </div>
                                {preview.currency && (
                                    <p className="text-[10px] text-slate-400 mt-1">Currency: {preview.currency}</p>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-slate-500">No preview available yet.</p>
                        )}
                    </div>
                )
            )}
        </div>
    );
}


// ─── Step 4: Confirm ──────────────────────────────────────────────────────────

function StepConfirm({ selectedPlan, config, overrides, preview, accessConfig }) {
    const entitlements = overrides.entitlementOverrides || {};
    const hasEntitlements = Object.keys(entitlements).filter(k => entitlements[k] != null).length > 0;
    const currency = preview?.currency || 'USD';

    const discountLabel = overrides.discountPercent
        ? `Discount (${overrides.discountPercent}%)`
        : overrides.discountAmount
            ? 'Flat Discount'
            : null;

    return (
        <div className="space-y-4">
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-bold text-blue-900">Review before creating contract</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                        {accessConfig.mode === 'grace'
                            ? 'This will create a Grace Access contract. No invoice or payment will be generated.'
                            : accessConfig.mode === 'trial'
                            ? 'This will create a Trial contract. No invoice or payment will be generated during the trial period.'
                            : 'This will atomically create a contract, generate an invoice, and apply payment. The transaction will be rolled back if any step fails.'}
                    </p>
                </div>
            </div>

            {/* §5 — Access type badge for non-billable modes */}
            {accessConfig.mode === 'grace' && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-green-800">Grace Access — {accessConfig.graceDays} days</p>
                        <p className="text-xs text-green-600">No payment, invoice, or ledger entry</p>
                    </div>
                </div>
            )}

            {accessConfig.mode === 'trial' && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-blue-800">
                            Trial — {config.trialDaysOverride || selectedPlan?.trialDays || 0} days
                        </p>
                        <p className="text-xs text-blue-600">No payment during trial period</p>
                    </div>
                </div>
            )}

            {/* §5 — Pricing Receipt (standard only) */}
            {accessConfig.mode === 'default' && preview && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Billing Summary</p>

                    {/* Plan line */}
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-600 font-medium">
                            {selectedPlan?.label || selectedPlan?.templateCode} {selectedPlan?.versionTag && `${selectedPlan.versionTag}`}
                        </span>
                        <span className="font-bold text-slate-900">
                            {fmtMoney(preview.basePrice ?? preview.price, currency)}
                        </span>
                    </div>

                    {/* Billing interval */}
                    <div className="flex justify-between text-xs text-slate-500">
                        <span>Billing Interval</span>
                        <span className="capitalize font-medium">{config.billingInterval}</span>
                    </div>

                    {/* Contract start */}
                    <div className="flex justify-between text-xs text-slate-500">
                        <span>Contract Start</span>
                        <span className="font-medium">{fmt(config.contractStartDate) || 'Today'}</span>
                    </div>

                    {/* Coupon */}
                    {overrides.couponCode && (
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>Coupon</span>
                            <span className="font-mono font-bold text-indigo-600">{overrides.couponCode}</span>
                        </div>
                    )}

                    {/* Discount lines */}
                    {((preview.discountAmount || 0) > 0 || discountLabel) && (
                        <div className="flex justify-between text-sm text-emerald-700">
                            <span className="font-medium">{discountLabel || 'Discount'}</span>
                            <span className="font-bold">-{fmtMoney(preview.discountAmount || preview.discount || 0, currency)}</span>
                        </div>
                    )}

                    {/* Tax */}
                    {(preview.tax || 0) > 0 && (
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>Tax</span>
                            <span className="font-medium">{fmtMoney(preview.tax, currency)}</span>
                        </div>
                    )}

                    {/* Divider + total */}
                    <div className="border-t border-slate-200 pt-3 mt-2 flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-800">Amount to Charge</span>
                        <span className="text-xl font-black text-brand-primary">
                            {fmtMoney(preview.finalPrice ?? preview.price, currency)}
                        </span>
                    </div>
                </div>
            )}

            {/* Contract configuration rows */}
            <div className="space-y-1.5">
                {[
                    { icon: CreditCard, label: 'Payment Method', value: config.paymentMethod?.replace(/_/g, ' ') },
                    { icon: Tag, label: 'Payment Terms', value: config.paymentTerms?.replace(/_/g, ' ') },
                    config.contractEndDate && { icon: Calendar, label: 'Contract End', value: fmt(config.contractEndDate) },
                    config.trialDaysOverride != null && { icon: Calendar, label: 'Trial Days', value: `${config.trialDaysOverride} days` },
                    overrides.customPriceOverride != null && { icon: DollarSign, label: 'Custom Price', value: fmtMoney(overrides.customPriceOverride, currency) },
                    { icon: RefreshCw, label: 'Auto-Renew', value: config.autoRenew ? 'Yes' : 'No' },
                ].filter(Boolean).map(row => {
                    const Icon = row.icon;
                    return (
                        <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                            <div className="flex items-center gap-2 text-slate-500">
                                <Icon className="w-3.5 h-3.5" />
                                <span className="text-xs font-medium">{row.label}</span>
                            </div>
                            <span className="text-xs font-bold text-slate-800 capitalize">{row.value}</span>
                        </div>
                    );
                })}
            </div>

            {/* Entitlement Overrides summary */}
            {hasEntitlements && (
                <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl">
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-400 mb-2">Entitlement Overrides</p>
                    {Object.entries(entitlements).filter(([, v]) => v != null).map(([k, v]) => (
                        <div key={k} className="flex justify-between text-xs">
                            <span className="text-violet-600">{k}</span>
                            <span className="font-bold text-violet-900">{String(v)}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


// ─── Main Wizard ──────────────────────────────────────────────────────────────

export default function ContractBuilderWizard({ orgId, currentContract, onClose, onSuccess }) {
    const [step, setStep] = useState(1);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [config, setConfig] = useState({
        billingInterval: 'monthly',
        paymentMethod: 'manual',
        paymentTerms: 'due_on_receipt',
        autoRenew: true,
        contractStartDate: null,
        contractEndDate: null,
        trialDaysOverride: null,
    });
    const [overrides, setOverrides] = useState({
        discountPercent: null,
        discountAmount: null,
        customPriceOverride: null,
        couponCode: null,
        entitlementOverrides: {},
    });
    // §1 — Grace / Promo access state
    const [accessConfig, setAccessConfig] = useState({
        mode: 'default', // 'default' | 'trial' | 'grace'
        graceDays: 150,
    });
    const [preview, setPreview] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);
    const [successResult, setSuccessResult] = useState(null);

    const handleConfigChange = (key, val) => setConfig(c => ({ ...c, [key]: val }));
    const handleOverrideChange = (key, val) => setOverrides(o => ({ ...o, [key]: val }));
    const handleAccessConfigChange = (key, val) => setAccessConfig(a => ({ ...a, [key]: val }));

    const isNonBillable = accessConfig.mode === 'grace' || accessConfig.mode === 'trial';

    const canProceed = () => {
        if (step === 1) return !!selectedPlan;
        if (step === 2) return !!config.billingInterval && (isNonBillable || !!config.paymentMethod);
        return true;
    };

    const handleSubmit = async () => {
        // §8 — Grace day validation
        if (accessConfig.mode === 'grace') {
            if (!accessConfig.graceDays || accessConfig.graceDays < 1) {
                setSubmitError('Grace duration must be at least 1 day');
                return;
            }
            if (accessConfig.graceDays > 365) {
                setSubmitError('Grace duration cannot exceed 365 days');
                return;
            }
        }

        setSubmitting(true);
        setSubmitError(null);
        try {
            const entitlementOverrides = Object.keys(overrides.entitlementOverrides || {})
                .filter(k => overrides.entitlementOverrides[k] != null)
                .reduce((acc, k) => ({ ...acc, [k]: overrides.entitlementOverrides[k] }), {});

            // §6 — Build payload with accessType / graceDays
            const res = await platformApi.post('/contracts/upgrade', {
                organizationId: orgId,
                planVersionId: selectedPlan._id,
                billingInterval: config.billingInterval,
                paymentMethod: isNonBillable ? undefined : config.paymentMethod,
                paymentTerms: isNonBillable ? undefined : config.paymentTerms,
                autoRenew: config.autoRenew,
                contractStartDate: config.contractStartDate || undefined,
                contractEndDate: config.contractEndDate || undefined,

                // Access type mapping: grace → "promo", trial → "trial", default → "paid"
                accessType: accessConfig.mode === 'grace'
                    ? 'promo'
                    : accessConfig.mode === 'trial'
                    ? 'trial'
                    : 'paid',

                trialDaysOverride: accessConfig.mode === 'trial'
                    ? (config.trialDaysOverride ?? undefined)
                    : undefined,

                graceDays: accessConfig.mode === 'grace'
                    ? accessConfig.graceDays
                    : undefined,

                discountPercent: isNonBillable ? undefined : (overrides.discountPercent ?? undefined),
                discountAmount: isNonBillable ? undefined : (overrides.discountAmount ?? undefined),
                customPriceOverride: isNonBillable ? undefined : (overrides.customPriceOverride != null ? overrides.customPriceOverride : undefined),
                couponCode: isNonBillable ? undefined : (overrides.couponCode ?? undefined),
                entitlementOverrides: Object.keys(entitlementOverrides).length > 0 ? entitlementOverrides : undefined,
            });
            setSuccessResult(res.data?.data || res.data);
            onSuccess?.();
        } catch (err) {
            setSubmitError(err.response?.data?.message || err.response?.data?.error || 'Contract creation failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={e => { if (e.target === e.currentTarget && !successResult) onClose?.(); }}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
                role="dialog"
                aria-modal="true"
                aria-label="Contract Builder Wizard"
                id="contract-builder-wizard"
            >
                {/* Success Screen — differentiates grace / trial / paid */}
                {successResult ? (
                    <div className="flex flex-col items-center justify-center p-10 gap-5 text-center">
                        {successResult.accessType === 'promo' ? (
                            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                                <ShieldCheck className="w-8 h-8 text-green-600" />
                            </div>
                        ) : successResult.accessType === 'trial' ? (
                            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
                                <Clock className="w-8 h-8 text-blue-600" />
                            </div>
                        ) : (
                            <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                                <CreditCard className="w-8 h-8 text-amber-600" />
                            </div>
                        )}

                        <div className="space-y-1">
                            <h3 className="text-lg font-black text-slate-900">Contract Created</h3>
                            <p className="text-sm text-slate-500">
                                {successResult.accessType === 'promo'
                                    ? `Grace Access activated — ${successResult.graceDays ?? accessConfig.graceDays} days of free access.`
                                    : successResult.accessType === 'trial'
                                    ? 'Trial contract activated. No invoice generated.'
                                    : 'Invoice issued and awaiting payment to activate.'}
                            </p>
                        </div>

                        {/* Paid contract: invoice details */}
                        {successResult.accessType !== 'promo' && successResult.accessType !== 'trial' && (
                            <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-left">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Invoice ID</span>
                                    <span className="font-mono text-xs text-slate-700">{successResult.invoiceId}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Amount Due</span>
                                    <span className="font-bold text-slate-900">
                                        {fmtMoney(successResult.amountDue, successResult.currency)}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Payment Method</span>
                                    <span className="capitalize text-slate-700">{(successResult.paymentMethod || 'manual').replace(/_/g, ' ')}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Contract Status</span>
                                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">Pending Payment</span>
                                </div>
                            </div>
                        )}

                        {/* Grace Access: contract summary */}
                        {(successResult.accessType === 'promo' || successResult.accessType === 'trial') && (
                            <div className={`w-full border rounded-xl p-4 space-y-2 text-left ${
                                successResult.accessType === 'promo'
                                    ? 'bg-green-50 border-green-200'
                                    : 'bg-blue-50 border-blue-200'
                            }`}>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Access Type</span>
                                    <span className={`font-bold capitalize ${
                                        successResult.accessType === 'promo' ? 'text-green-700' : 'text-blue-700'
                                    }`}>
                                        {successResult.accessType === 'promo' ? 'Grace Access' : 'Trial'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">Contract Status</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                        successResult.accessType === 'promo'
                                            ? 'bg-green-100 text-green-700'
                                            : 'bg-blue-100 text-blue-700'
                                    }`}>Active</span>
                                </div>
                            </div>
                        )}

                        {/* Payment guidance for paid contracts */}
                        {successResult.accessType !== 'promo' && successResult.accessType !== 'trial' && (
                            ['manual', 'cash', 'bank_transfer'].includes(successResult.paymentMethod) ? (
                                <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-left w-full">
                                    <Zap className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                    <p className="text-xs text-blue-700">
                                        Go to the <strong>Billing tab</strong> and use <em>Record Payment</em> on this invoice to activate the contract.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-start gap-2 p-3 bg-purple-50 border border-purple-200 rounded-xl text-left w-full">
                                    <Zap className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                                    <p className="text-xs text-purple-700">
                                        The organization will be redirected to the payment gateway (<strong className="capitalize">{successResult.paymentMethod}</strong>) to complete payment.
                                    </p>
                                </div>
                            )
                        )}

                        <button
                            type="button"
                            id="wizard-done"
                            onClick={onClose}
                            className="mt-1 px-6 py-2.5 text-sm font-bold text-white bg-brand-primary rounded-xl hover:opacity-90 transition-all"
                        >
                            Done
                        </button>
                    </div>

                ) : (
                    <>
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
                            <div>
                                <h2 className="text-lg font-black text-slate-900">Contract Builder</h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {currentContract
                                        ? `Upgrading from ${currentContract.planCode}`
                                        : 'Provisioning new contract'}
                                </p>
                            </div>
                            <button
                                type="button"
                                id="wizard-close"
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-slate-700 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto px-6 py-5">
                            <StepIndicator current={step} />

                            {step === 1 && (
                                <StepPlanSelection selected={selectedPlan} onSelect={setSelectedPlan} />
                            )}
                            {step === 2 && (
                                <StepConfiguration
                                    config={config}
                                    onChange={handleConfigChange}
                                    selectedPlan={selectedPlan}
                                    accessConfig={accessConfig}
                                    onAccessConfigChange={handleAccessConfigChange}
                                />
                            )}
                            {step === 3 && (
                                <StepBillingPreview
                                    orgId={orgId}
                                    selectedPlan={selectedPlan}
                                    config={config}
                                    overrides={overrides}
                                    onOverrideChange={handleOverrideChange}
                                    preview={preview}
                                    setPreview={setPreview}
                                    accessConfig={accessConfig}
                                />
                            )}
                            {step === 4 && (
                                <StepConfirm
                                    selectedPlan={selectedPlan}
                                    config={config}
                                    overrides={overrides}
                                    preview={preview}
                                    accessConfig={accessConfig}
                                />
                            )}

                            {submitError && (
                                <div className="mt-4 flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
                                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-sm text-red-700">{submitError}</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
                            <button
                                type="button"
                                id="wizard-back"
                                onClick={() => step > 1 ? setStep(s => s - 1) : onClose?.()}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                {step === 1 ? 'Cancel' : 'Back'}
                            </button>

                            {step < 4 ? (
                                <button
                                    type="button"
                                    id="wizard-next"
                                    onClick={() => setStep(s => s + 1)}
                                    disabled={!canProceed()}
                                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-brand-primary rounded-xl hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                >
                                    Next
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    id="wizard-confirm"
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                >
                                    {submitting ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" />Creating…</>
                                    ) : (
                                        <><CheckCircle2 className="w-4 h-4" />Create Contract</>
                                    )}
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
