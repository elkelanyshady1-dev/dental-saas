import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { publicApi } from "@/services/api";
import { PLAN_QUERY_KEYS } from "@/lib/query/planQueryKeys";
import { usePlanChannelListener, PLAN_EVENTS } from "@/lib/realtime/planChannel";
import { BRAND } from "@/config/brand";

// ─── Module label map (mirrors backend's moduleLabels in platformPublicPricing.controller.js)
const MODULE_LABELS = {
    patients: "Patient Management",
    appointments: "Appointment Scheduling",
    finance: "Financial Accounting",
    inventory: "Inventory Management",
    lab: "Laboratory Case Tracking",
    orthodonticsAdv: "Advanced Orthodontics Module",   // matches PlanVersion schema field name
    communication: "Patient Communications (SMS/Email)",
    analytics: "Analytics & Reporting",
    booking: "Online Booking"
};

/**
 * normalizePlan
 * Adapts the PlanVersion API response shape to the shape expected by this UI.
 *
 * Backend sends (after Plan → PlanTemplate + PlanVersion migration):
 *   { id, code, name, description, monthlyPrice, annualPrice,
 *     limits: {}, modules: {}, trialDays, isPopular, isSalesManaged }
 *
 * Note: `features` is never returned by the backend. We derive it from
 * the enabled modules so the feature list renders meaningfully.
 * All array accesses in the render are guarded with `?? []` as belt-and-suspenders.
 */
function normalizePlan(raw) {
    const modules = raw.modules ?? {};

    // Build a flat features array from enabled module keys.
    // A module is "enabled" if its value is truthy (boolean true or object with included:true).
    const features = Object.entries(modules)
        .filter(([, val]) => {
            if (typeof val === "boolean") return val;
            if (typeof val === "object" && val !== null) return val.included ?? val.enabled ?? false;
            return false;
        })
        .map(([key, val]) => {
            // Prefer the marketing label if the backend sent one
            if (typeof val === "object" && val?.label) return val.label;
            return MODULE_LABELS[key] || key;
        });

    return {
        id: raw.id ?? raw._id,
        code: raw.code ?? "",
        name: raw.name ?? raw.templateName ?? "",
        description: raw.description ?? "",
        monthlyPrice: raw.monthlyPrice ?? null,
        annualPrice: raw.annualPrice ?? null,
        currency: raw.currency ?? "USD",
        limits: raw.limits ?? {},
        modules,
        features,           // always an array, never undefined
        trialDays: raw.trialDays ?? 14,
        isPopular: raw.isPopular ?? false,
        isSalesManaged: raw.isSalesManaged ?? false,
    };
}

// Phase 3/8: Country options with ISO codes for pricing lookup
const COUNTRIES = [
    { label: "Select your country", value: "" },
    { label: "Egypt (EGP)", value: "EG" },
    { label: "Saudi Arabia (SAR)", value: "SA" },
    { label: "UAE (AED)", value: "AE" },
    { label: "Kuwait (KWD)", value: "KW" },
    { label: "Qatar (QAR)", value: "QA" },
    { label: "Bahrain (BHD)", value: "BH" },
    { label: "Oman (OMR)", value: "OM" },
    { label: "United Kingdom (GBP)", value: "GB" },
    { label: "United States (USD)", value: "US" }
];

const CURRENCY_SYMBOLS = {
    USD: "$", GBP: "£", EGP: "E£", SAR: "﷼", AED: "د.إ",
    KWD: "KD", QAR: "QR", BHD: "BD", OMR: "OMR"
};

function formatPrice(amount, currency) {
    if (amount == null) return null;
    const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
    return `${sym}${Number(amount).toLocaleString()}`;
}

function PlanSkeleton() {
    return (
        <div className="bg-white rounded-[32px] p-10 border border-slate-100 animate-pulse">
            <div className="h-6 bg-slate-100 rounded-xl mb-4 w-1/2" />
            <div className="h-4 bg-slate-100 rounded mb-8 w-3/4" />
            <div className="h-12 bg-slate-100 rounded-xl mb-8 w-1/3" />
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-4 bg-slate-100 rounded mb-3" />
            ))}
        </div>
    );
}

export default function Pricing() {
    useEffect(() => {
        document.title = `Pricing & Plans | ${BRAND.platform.name}`;
    }, []);

    const [isAnnual, setIsAnnual] = useState(true);
    const [country, setCountry] = useState("US");
    const queryClient = useQueryClient();

    // ── React Query: server-state for public plans ────────────────────────────
    // Uses PLAN_QUERY_KEYS.publicPlans(country) so Platform Plane can invalidate
    // all public plan caches after a visibility/pricing/publish change.
    const {
        data: queryResult,
        isLoading: loading,
        error: queryError,
    } = useQuery({
        queryKey: PLAN_QUERY_KEYS.publicPlans(country),
        queryFn: async () => {
            const res = await publicApi.get(`/public/plans?country=${country}`);
            if (!res.data.success) throw new Error("API returned success=false");
            return {
                plans: (res.data.data || []).map(normalizePlan),
                currency: res.data.currency || "USD",
                pricingAvailable: res.data.pricingAvailable ?? true,
            };
        },
        staleTime: 60_000,     // 1 min — public data changes infrequently
        gcTime: 5 * 60_000,    // 5 min garbage collect
    });

    // ── Cross-Tab Sync: BroadcastChannel listener (Public Plane — listen only) ──
    // Receives PLAN_UPDATED / PLAN_DEPRECATED from Platform tabs.
    // Zero-trust: event carries NO data — we always refetch from API.
    const handlePlanEvent = useCallback((type) => {
        if (
            type === PLAN_EVENTS.PLAN_UPDATED ||
            type === PLAN_EVENTS.PLAN_DEPRECATED
        ) {
            queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEYS.ALL_PUBLIC });
        }
    }, [queryClient]);

    usePlanChannelListener(handlePlanEvent);

    // ── Derived state from query result ──────────────────────────────────────
    const plans = queryResult?.plans ?? [];
    const currency = queryResult?.currency ?? "USD";
    const pricingAvailable = queryResult?.pricingAvailable ?? false;
    const error = queryError ? "Unable to load plans. Please try again." : null;

    // ── Savings % — computed from first plan with both monthly + annual ──────
    const savingsPercent = useMemo(() => {
        const ref = plans.find(p => p.monthlyPrice != null && p.annualPrice != null);
        if (ref && ref.monthlyPrice > 0) {
            const annualIfMonthly = ref.monthlyPrice * 12;
            return Math.round(((annualIfMonthly - ref.annualPrice) / annualIfMonthly) * 100);
        }
        return null;
    }, [plans]);


    return (
        <div className="bg-slate-50 min-h-screen py-24 px-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="text-center mb-16">
                    <h1 className="text-5xl font-extrabold text-slate-900 mb-6">
                        Simple Pricing for <span className="text-blue-600">Modern Orthodontics</span>
                    </h1>
                    <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                        Choose the plan that fits your orthodontic practice. All plans include a 30-day free trial.
                    </p>



                    {/* Billing interval toggle */}
                    <div className="mt-6 flex items-center justify-center gap-4">
                        <span className={`text-sm font-bold ${!isAnnual ? "text-slate-900" : "text-slate-400"}`}>Monthly</span>
                        <button
                            onClick={() => setIsAnnual(!isAnnual)}
                            className="w-14 h-7 bg-slate-200 rounded-full relative p-1 transition-colors hover:bg-slate-300"
                            aria-label="Toggle billing interval"
                            aria-pressed={isAnnual}
                        >
                            <div className={`w-5 h-5 bg-blue-600 rounded-full shadow-md transition-transform ${isAnnual ? "translate-x-7" : "translate-x-0"}`} />
                        </button>
                        <span className={`text-sm font-bold ${isAnnual ? "text-slate-900" : "text-slate-400"}`}>
                            Annually {savingsPercent != null && savingsPercent > 0 ? (
                                <span className="text-green-600 ml-1 text-xs bg-green-100 px-2 py-0.5 rounded-full">
                                    Save {savingsPercent}%
                                </span>
                            ) : savingsPercent === 0 ? null : (
                                <span className="text-green-600 ml-1 text-xs bg-green-100 px-2 py-0.5 rounded-full">
                                    Best Value
                                </span>
                            )}
                        </span>
                    </div>

                    {/* v22.0: Pricing gate banner */}
                    {!loading && !pricingAvailable && (
                        <div className="mt-6 bg-blue-50 border border-blue-100 rounded-2xl p-5 text-center">
                            <p className="text-blue-800 font-semibold text-sm mb-2">
                                🔒 Verify your phone to see regional pricing
                            </p>
                            <p className="text-blue-600 text-xs mb-3">
                                We personalize pricing based on your location. Sign up to see prices for your region.
                            </p>
                            <Link
                                to="/signup"
                                className="inline-block bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
                            >
                                Start Signup →
                            </Link>
                        </div>
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="text-center mb-8">
                        <p className="text-red-500 font-medium text-sm">{error}</p>
                        <button
                            onClick={() => refetch()}
                            className="mt-2 text-blue-600 font-bold text-sm hover:underline"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Plans grid */}
                <div className="grid md:grid-cols-3 gap-8 items-stretch">
                    {loading ? (
                        [1, 2, 3].map(i => <PlanSkeleton key={i} />)
                    ) : plans.length === 0 && !error ? (
                        <div className="col-span-3 text-center py-20 text-slate-400 font-medium">
                            No plans available. Please try a different country.
                        </div>
                    ) : (
                        plans.map((plan, idx) => {
                            const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
                            const formattedPrice = price != null ? formatPrice(price, currency) : null;
                            const isSalesManaged = plan.isSalesManaged || formattedPrice == null;
                            const isPopular = plan.isPopular || false;

                            return (
                                <div
                                    key={plan.id || idx}
                                    className={`relative bg-white rounded-[32px] p-10 flex flex-col border transition-all duration-300 ${isPopular
                                        ? "border-blue-500 shadow-2xl shadow-blue-500/10 scale-105 z-10"
                                        : "border-slate-200 shadow-xl shadow-slate-200/50 hover:border-slate-300"
                                        }`}
                                >
                                    {isPopular && (
                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                            Most Popular
                                        </div>
                                    )}

                                    {/* Plan name + description */}
                                    <div className="mb-8">
                                        <h2 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h2>
                                        <p className="text-slate-500 text-sm">{plan.description}</p>
                                    </div>

                                    {/* Price — Phase 7+8: from API, regional currency */}
                                    <div className="mb-8">
                                        {isSalesManaged ? (
                                            <div>
                                                <span className="text-3xl font-extrabold text-slate-900">Custom</span>
                                                <p className="text-slate-400 text-sm mt-1">Sign up to see pricing</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-4xl font-extrabold text-slate-900">{formattedPrice}</span>
                                                    <span className="text-slate-500 font-medium">/month</span>
                                                </div>
                                                {isAnnual && plan.annualPrice != null && (
                                                    <p className="text-green-600 text-xs font-bold mt-1">Billed annually</p>
                                                )}
                                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{currency}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Features — derived from enabled modules after PlanVersion migration */}
                                    {(plan.features ?? []).length > 0 && (
                                        <ul className="space-y-4 mb-10 flex-1">
                                            {(plan.features ?? []).map((feature, fidx) => (
                                                <li key={fidx} className="flex items-start gap-3 text-slate-600 text-sm">
                                                    <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {/* CTA — always navigates to /signup */}
                                    <Link
                                        to="/signup"
                                        className={`w-full py-4 rounded-2xl font-bold text-center transition-all block mt-auto ${isPopular
                                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 hover:bg-blue-700"
                                            : "bg-slate-50 text-slate-900 hover:bg-slate-100 border border-slate-200"
                                            }`}
                                    >
                                        Sign Up — 30 Days Trial
                                    </Link>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="mt-20 text-center">
                    <p className="text-slate-500 text-sm">
                        Managing more than 50 clinics?{" "}
                        <Link to="/contact" className="text-blue-600 font-bold hover:underline">Talk to our Enterprise team</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
