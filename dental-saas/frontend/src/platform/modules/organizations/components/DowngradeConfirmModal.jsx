/**
 * DowngradeConfirmModal.jsx
 * Sprint 8 — Schedule a Contract Downgrade
 *
 * Props:
 *   orgId            string
 *   contractId       string  — the active contract to schedule the change on
 *   currentContract  object  — { planCode, planVersionTag, lockedPrice, currency, billingInterval }
 *   onClose          fn
 *   onSuccess        fn
 *
 * Endpoint: POST /api/platform/contracts/:contractId/schedule-change
 *   body: { newPlanVersionId, newPlanCode, effectiveDate }
 */
import React, { useState, useEffect } from "react";
import {
    X, TrendingDown, Loader2, AlertTriangle,
    CheckCircle2, Calendar, ArrowRight
} from "lucide-react";
import platformApi from "@/platform/auth/platformApi";

const fmtCurrency = (val, currency = "USD") => {
    if (val == null) return "—";
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val); }
    catch { return `${currency} ${Number(val).toFixed(2)}`; }
};

const intervalLabel = (interval) => {
    const map = { monthly: "/month", yearly: "/year", biennial: "/2 years" };
    return map[interval] || (interval ? `/${interval}` : "/month");
};

export default function DowngradeConfirmModal({
    orgId, contractId, currentContract, onClose, onSuccess
}) {
    const [planVersions, setPlanVersions] = useState([]);
    const [selectedPV, setSelectedPV] = useState(null);
    const [effectiveDate, setEffectiveDate] = useState(
        currentContract?.effectiveTo
            ? new Date(currentContract.effectiveTo).toISOString().split("T")[0]
            : ""
    );
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    const [done, setDone] = useState(false);
    // Fix 3: backend-resolved preview price (same pattern as UpgradeContractModal)
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);

    useEffect(() => {
        platformApi.get("/plan-versions?status=active")
            .then(r => {
                const list = Array.isArray(r.data) ? r.data : (r.data?.planVersions || r.data?.data || []);
                setPlanVersions(list);
                if (list.length > 0) setSelectedPV(list[0]);
            })
            .catch(() => setFetchError("Failed to load plan versions"))
            .finally(() => setLoading(false));
    }, []);

    // Fix 3: fetch backend price preview when target plan changes
    useEffect(() => {
        if (!selectedPV || !orgId) return;
        setPreviewLoading(true);
        setPreview(null);
        platformApi.post("/contracts/preview", {
            organizationId: orgId,
            planVersionId: selectedPV._id,
            billingInterval: selectedPV.billingInterval || "monthly",
        }).then(r => {
            setPreview(r.data?.data || r.data);
        }).catch(() => {
            // Graceful fallback when preview endpoint is not yet available
            const fallbackPrice = selectedPV.pricing?.regions?.[0]?.priceMonthly ?? selectedPV.lockedPrice ?? 0;
            setPreview({
                price: fallbackPrice,
                currency: selectedPV.pricing?.baseCurrency || "USD",
                interval: selectedPV.billingInterval || "monthly",
                _fallback: true,
            });
        }).finally(() => setPreviewLoading(false));
    }, [selectedPV, orgId]);

    const handleSubmit = async () => {
        if (!selectedPV || !effectiveDate) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            await platformApi.post(`/contracts/${contractId}/schedule-change`, {
                newPlanVersionId: selectedPV._id,
                newPlanCode: selectedPV.planCode,
                effectiveDate: new Date(effectiveDate).toISOString(),
            });
            setDone(true);
            setTimeout(() => { onSuccess?.(); onClose(); }, 1500);
        } catch (err) {
            setSubmitError(err.response?.data?.message || err.message || "Failed to schedule change");
        } finally {
            setSubmitting(false);
        }
    };

    const newPrice = preview?.price ?? 0;
    const newCurrency = preview?.currency || selectedPV?.pricing?.baseCurrency || "USD";
    const newInterval = preview?.interval || selectedPV?.billingInterval || "monthly";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={!submitting ? onClose : undefined} />

            <div className="relative z-10 bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-50 rounded-xl border border-amber-200">
                            <TrendingDown className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <h2 className="text-sm font-black text-slate-900">Schedule Downgrade</h2>
                            <p className="text-[11px] text-slate-400">
                                Changes take effect at the scheduled date
                            </p>
                        </div>
                    </div>
                    {!submitting && (
                        <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl">
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    )}
                </div>

                <div className="p-6 space-y-5">
                    {/* Plan comparison */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Current */}
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Current Plan</p>
                            <p className="text-sm font-black text-slate-900">{currentContract?.planCode || "—"}</p>
                            <p className="text-[11px] text-slate-500">{currentContract?.planVersionTag}</p>
                            <p className="text-sm font-bold text-slate-700 mt-1">
                                {fmtCurrency(currentContract?.lockedPrice, currentContract?.currency)}
                                <span className="text-[10px] text-slate-400 font-normal ml-0.5">
                                    {intervalLabel(currentContract?.billingInterval)}
                                </span>
                            </p>
                        </div>

                        {/* Arrow */}
                        <div className="flex items-center justify-center col-span-2 -my-1">
                            <ArrowRight className="w-4 h-4 text-amber-400" />
                        </div>

                        {/* Target */}
                        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl col-span-2">
                            <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mb-2">Target Plan</p>
                            {loading ? (
                                <p className="text-xs text-slate-400">Loading…</p>
                            ) : fetchError ? (
                                <p className="text-xs text-red-500">{fetchError}</p>
                            ) : (
                                <div className="space-y-2">
                                    <select
                                        id="downgrade-plan-select"
                                        className="w-full text-sm border border-amber-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                                        value={selectedPV?._id || ""}
                                        onChange={e => {
                                            const pv = planVersions.find(p => p._id === e.target.value);
                                            setSelectedPV(pv || null);
                                        }}
                                    >
                                        {planVersions.map(pv => (
                                            <option key={pv._id} value={pv._id}>
                                                {pv.planCode} — {pv.versionTag}
                                            </option>
                                        ))}
                                    </select>
                                    {selectedPV && (
                                        <p className="text-sm font-bold text-amber-800">
                                            {previewLoading
                                                ? <span className="text-xs text-amber-400">Calculating…</span>
                                                : <>{fmtCurrency(newPrice, newCurrency)}<span className="text-[10px] font-normal ml-0.5">{intervalLabel(newInterval)}</span></>
                                            }
                                        </p>
                                    )}
                                    {preview?._fallback && (
                                        <p className="text-[9px] text-amber-500 mt-1">⚠ Estimated from catalog</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Effective date */}
                    <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">
                            Effective Date
                        </label>
                        <input
                            id="downgrade-effective-date"
                            type="date"
                            value={effectiveDate}
                            onChange={e => setEffectiveDate(e.target.value)}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                            Defaults to current contract end date. Must be a future date.
                        </p>
                    </div>

                    {/* Errors */}
                    {submitError && (
                        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-700">{submitError}</p>
                        </div>
                    )}

                    {/* Success */}
                    {done && (
                        <div className="flex flex-col items-center gap-2 py-4">
                            <div className="p-3 bg-emerald-50 rounded-full border border-emerald-200">
                                <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                            </div>
                            <p className="text-sm font-black text-slate-900">Downgrade Scheduled</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {!done && (
                    <div className="flex gap-3 p-6 border-t border-slate-100">
                        <button
                            onClick={onClose}
                            disabled={submitting}
                            className="flex-1 px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            id="confirm-downgrade-btn"
                            onClick={handleSubmit}
                            disabled={!selectedPV || !effectiveDate || submitting || loading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Scheduling…</>
                                : <><Calendar className="w-4 h-4" /> Schedule Downgrade</>
                            }
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
