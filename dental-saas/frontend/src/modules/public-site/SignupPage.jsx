import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { setAccessToken, setCsrfToken, publicApi } from "@/services/api";
import { Button, Input, Card } from "@/design-system";

// ─── Password Complexity (Phase 1) ───────────────────────────────────────────
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_RULES = [
    { test: (v) => v.length >= 8,             label: "At least 8 characters" },
    { test: (v) => /[A-Z]/.test(v),           label: "One uppercase letter" },
    { test: (v) => /\d/.test(v),              label: "One number" },
    { test: (v) => /[^A-Za-z0-9]/.test(v),    label: "One special character" },
];

// ─── Step Definitions ────────────────────────────────────────────────────────
const STEPS = [
    { key: "phone", label: "Verify Phone" },
    { key: "otp", label: "Phone Code" },
    { key: "emailOtp", label: "Verify Email" },
    { key: "plan", label: "Choose Plan" },
    { key: "details", label: "Account Details" },
];

// ─── Module label map (mirrors Pricing.jsx) ──────────────────────────────────
const MODULE_LABELS = {
    patients: "Patient Management",
    appointments: "Appointment Scheduling",
    finance: "Financial Accounting",
    inventory: "Inventory Management",
    lab: "Laboratory Case Tracking",
    orthodonticsAdv: "Advanced Orthodontics",
    communication: "Patient Communications",
    analytics: "Analytics & Reporting",
    booking: "Online Booking",
};

const CURRENCY_SYMBOLS = {
    USD: "$", GBP: "£", EGP: "E£", SAR: "﷼", AED: "د.إ",
    KWD: "KD", QAR: "QR", BHD: "BD", OMR: "OMR",
};

function formatPrice(amount, currency) {
    if (amount == null) return null;
    const sym = CURRENCY_SYMBOLS[currency] || currency + " ";
    return `${sym}${Number(amount).toLocaleString()}`;
}

// ─── Step Progress Bar ───────────────────────────────────────────────────────
function StepProgress({ currentIndex }) {
    return (
        <div className="flex items-center gap-2 mb-8">
            {STEPS.map((step, idx) => (
                <div key={step.key} className="flex items-center gap-2 flex-1">
                    <div className={`
                        flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all
                        ${idx < currentIndex ? "bg-emerald-500 text-white" :
                          idx === currentIndex ? "bg-blue-600 text-white ring-4 ring-blue-100" :
                          "bg-slate-100 text-slate-400"}
                    `}>
                        {idx < currentIndex ? "✓" : idx + 1}
                    </div>
                    <span className={`text-xs font-semibold hidden sm:block ${
                        idx <= currentIndex ? "text-slate-700" : "text-slate-300"
                    }`}>{step.label}</span>
                    {idx < STEPS.length - 1 && (
                        <div className={`flex-1 h-0.5 rounded-full ${
                            idx < currentIndex ? "bg-emerald-400" : "bg-slate-100"
                        }`} />
                    )}
                </div>
            ))}
        </div>
    );
}

// ─── Step 1: Phone + Email ──────────────────────────────────────────────────
function PhoneStep({ formData, onChange, onNext, loading, error }) {
    const handleSubmit = (e) => {
        e.preventDefault();
        onNext();
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center mb-6">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Verify Your Phone</h2>
                <p className="text-slate-500 text-sm">We'll detect your region and show you local pricing.</p>
            </div>

            <Input
                label="Email Address"
                type="email"
                name="email"
                value={formData.email}
                onChange={onChange}
                required
                placeholder="john@example.com"
            />

            <Input
                label="Phone Number"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={onChange}
                required
                placeholder="+201234567890"
                description="International format with country code (e.g. +20, +971, +44)"
            />

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">
                    {error}
                </div>
            )}

            <Button type="submit" disabled={loading}>
                {loading ? "Sending Code…" : "Send Verification Code"}
            </Button>
        </form>
    );
}

// ─── Step 2: OTP Verification (Phase 2 + Phase 6) ───────────────────────────
function OtpStep({ formData, onChange, onNext, onBack, onResend, loading, error, expiresIn, resendLoading }) {
    const [countdown, setCountdown] = useState(expiresIn || 600);
    const inputRef = useRef(null);

    // Reset countdown when expiresIn changes (after resend)
    useEffect(() => {
        setCountdown(expiresIn || 600);
    }, [expiresIn]);

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => setCountdown(c => c - 1), 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    // Phase 6: Auto-submit when 6 digits entered
    useEffect(() => {
        if (formData.otp.length === 6 && !loading) {
            onNext();
        }
    }, [formData.otp, loading, onNext]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onNext();
    };

    // Phase 6: Paste support — extract digits from pasted text
    const handlePaste = (e) => {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (pasted.length > 0) {
            e.preventDefault();
            onChange({ target: { name: "otp", value: pasted } });
        }
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center mb-6">
                <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Enter Verification Code</h2>
                <p className="text-slate-500 text-sm">
                    We sent a code to <span className="font-semibold text-slate-700">{formData.phoneNumber}</span>
                </p>
            </div>

            {/* Phase 6: Enhanced OTP Input — digits only, paste support */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Verification Code</label>
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    name="otp"
                    value={formData.otp}
                    onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                        onChange({ target: { name: "otp", value: digits } });
                    }}
                    onPaste={handlePaste}
                    required
                    maxLength={6}
                    placeholder="000000"
                    autoFocus
                    className="w-full h-16 rounded-xl border border-slate-200 px-4 text-slate-900
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        placeholder:text-slate-300 transition
                        text-center text-3xl tracking-[0.6em] font-mono font-bold"
                />
                <p className="text-center text-xs text-slate-400 mt-1.5">Paste or type your 6-digit code</p>
            </div>

            {countdown > 0 ? (
                <p className="text-center text-xs text-slate-400">
                    Code expires in <span className="font-bold text-slate-600">{formatTime(countdown)}</span>
                </p>
            ) : (
                /* Phase 2: Resend OTP button — visible after timer expires */
                <div className="text-center space-y-2">
                    <p className="text-xs text-amber-600 font-semibold">Code expired</p>
                    <button
                        type="button"
                        onClick={onResend}
                        disabled={resendLoading}
                        className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700
                            disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {resendLoading ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                Sending…
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Resend Code
                            </>
                        )}
                    </button>
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">
                    {error}
                </div>
            )}

            <Button type="submit" disabled={loading || countdown <= 0 || formData.otp.length < 6}>
                {loading ? "Verifying…" : "Verify"}
            </Button>

            <button
                type="button"
                onClick={onBack}
                className="w-full text-sm text-slate-500 font-medium hover:text-slate-700 transition-colors"
            >
                ← Change phone number
            </button>
        </form>
    );
}

// ─── Step 3: Email OTP Verification (v30.1) ─────────────────────────────────
function EmailOtpStep({ formData, onChange, onNext, onResend, loading, error, resendLoading }) {
    const [countdown, setCountdown] = useState(600); // 10 min
    const inputRef = useRef(null);

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = setInterval(() => setCountdown(c => c - 1), 1000);
        return () => clearInterval(timer);
    }, [countdown]);

    // Auto-submit when 6 digits entered (once per value, avoid infinite loop)
    const hasAutoSubmitted = useRef(false);
    useEffect(() => {
        if (formData.emailOtp.length === 6 && !loading && !hasAutoSubmitted.current) {
            hasAutoSubmitted.current = true;
            onNext();
        }
        if (formData.emailOtp.length < 6) {
            hasAutoSubmitted.current = false;
        }
    }, [formData.emailOtp, loading, onNext]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onNext();
    };

    const handlePaste = (e) => {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (pasted.length > 0) {
            e.preventDefault();
            onChange({ target: { name: "emailOtp", value: pasted } });
        }
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const maskedEmail = formData.email.replace(/(.{2})(.*)(@.*)/, "$1***$3");

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            <div className="text-center mb-6">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Verify Your Email</h2>
                <p className="text-slate-500 text-sm">
                    We sent a 6-digit code to <span className="font-semibold text-slate-700">{maskedEmail}</span>
                </p>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Verification Code</label>
                <input
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    name="emailOtp"
                    value={formData.emailOtp}
                    onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                        onChange({ target: { name: "emailOtp", value: digits } });
                    }}
                    onPaste={handlePaste}
                    required
                    maxLength={6}
                    placeholder="000000"
                    autoFocus
                    className="w-full h-16 rounded-xl border border-slate-200 px-4 text-slate-900
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                        placeholder:text-slate-300 transition
                        text-center text-3xl tracking-[0.6em] font-mono font-bold"
                />
                <p className="text-center text-xs text-slate-400 mt-1.5">Check your email for the 6-digit code</p>
            </div>

            {countdown > 0 ? (
                <p className="text-center text-xs text-slate-400">
                    Code expires in <span className="font-bold text-slate-600">{formatTime(countdown)}</span>
                </p>
            ) : (
                <div className="text-center space-y-2">
                    <p className="text-xs text-amber-600 font-semibold">Code expired</p>
                    <button
                        type="button"
                        onClick={() => { onResend(); setCountdown(600); }}
                        disabled={resendLoading}
                        className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700
                            disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {resendLoading ? "Sending…" : "Resend Code"}
                    </button>
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">
                    {error}
                </div>
            )}

            <Button type="submit" disabled={loading || countdown <= 0 || formData.emailOtp.length < 6}>
                {loading ? "Verifying…" : "Verify Email"}
            </Button>

            {/* Resend button (while timer is still active) */}
            {countdown > 0 && (
                <div className="text-center">
                    <button
                        type="button"
                        onClick={() => { onResend(); setCountdown(600); }}
                        disabled={resendLoading}
                        className="text-sm text-slate-500 font-medium hover:text-blue-600 transition-colors disabled:text-slate-300"
                    >
                        {resendLoading ? "Sending…" : "Didn't receive it? Resend"}
                    </button>
                </div>
            )}
        </form>
    );
}

// ─── Step 4: Plan Selection ─────────────────────────────────────────────────
function PlanStep({ plans, currency, isAnnual, onToggleInterval, onSelectPlan, detectedCountry, detectedRegion, loading, error }) {
    if (loading) {
        return (
            <div className="space-y-4">
                <div className="text-center mb-6">
                    <h2 className="text-xl font-bold text-slate-900 mb-1">Loading Plans…</h2>
                </div>
                {[1, 2, 3].map(i => (
                    <div key={i} className="bg-slate-50 rounded-2xl p-6 animate-pulse border border-slate-100">
                        <div className="h-5 bg-slate-200 rounded w-1/2 mb-3" />
                        <div className="h-8 bg-slate-200 rounded w-1/3 mb-3" />
                        <div className="h-4 bg-slate-200 rounded w-3/4" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="text-center mb-4">
                <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Choose Your Plan</h2>
                <p className="text-slate-500 text-sm">
                    Pricing for <span className="font-semibold text-blue-600">{detectedCountry}</span>
                    {detectedRegion && <span className="text-slate-400"> ({detectedRegion})</span>}
                </p>
            </div>

            {/* Billing toggle */}
            <div className="flex items-center justify-center gap-3 mb-4">
                <span className={`text-xs font-bold ${!isAnnual ? "text-slate-900" : "text-slate-400"}`}>Monthly</span>
                <button
                    type="button"
                    onClick={onToggleInterval}
                    className="w-12 h-6 bg-slate-200 rounded-full relative p-0.5 transition-colors hover:bg-slate-300"
                >
                    <div className={`w-5 h-5 bg-blue-600 rounded-full shadow transition-transform ${isAnnual ? "translate-x-6" : "translate-x-0"}`} />
                </button>
                <span className={`text-xs font-bold ${isAnnual ? "text-slate-900" : "text-slate-400"}`}>Annual</span>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">
                    {error}
                </div>
            )}

            {/* Plan cards */}
            <div className="space-y-3">
                {plans.map((plan) => {
                    const price = isAnnual ? plan.annualPrice : plan.monthlyPrice;
                    const formattedPrice = price != null ? formatPrice(price, currency) : null;
                    const features = Object.entries(plan.modules ?? {})
                        .filter(([, val]) => typeof val === "boolean" ? val : val?.included ?? val?.enabled ?? false)
                        .map(([key, val]) => typeof val === "object" && val?.label ? val.label : MODULE_LABELS[key] || key);

                    return (
                        <button
                            key={plan.id}
                            type="button"
                            onClick={() => onSelectPlan(plan)}
                            className="w-full text-left bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/10 transition-all group"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{plan.name}</h3>
                                {formattedPrice ? (
                                    <div className="text-right">
                                        <span className="text-lg font-extrabold text-slate-900">{formattedPrice}</span>
                                        <span className="text-slate-400 text-xs font-medium">/mo</span>
                                    </div>
                                ) : (
                                    <span className="text-sm font-bold text-slate-400">Contact Sales</span>
                                )}
                            </div>
                            {plan.description && (
                                <p className="text-slate-500 text-xs mb-3">{plan.description}</p>
                            )}
                            {features.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {features.slice(0, 4).map((f, i) => (
                                        <span key={i} className="text-[10px] font-semibold bg-slate-50 text-slate-500 px-2 py-0.5 rounded-full border border-slate-100">
                                            {f}
                                        </span>
                                    ))}
                                    {features.length > 4 && (
                                        <span className="text-[10px] font-semibold text-blue-500 px-2 py-0.5">
                                            +{features.length - 4} more
                                        </span>
                                    )}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Step 4: Account Details (Phase 1: Password Validation) ─────────────────
function DetailsStep({ formData, onChange, onSubmit, onBack, loading, error, selectedPlan, detectedCountry }) {
    const pw = formData.password;
    const passwordTouched = pw.length > 0;
    const passwordValid = PASSWORD_REGEX.test(pw);

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (!passwordValid) return; // Block client-side
        onSubmit(e);
    };

    return (
        <form onSubmit={handleFormSubmit} className="space-y-5">
            <div className="text-center mb-6">
                <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Set Up Your Clinic</h2>
                {selectedPlan && (
                    <div className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold mt-2">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        {selectedPlan.name} plan • {detectedCountry}
                    </div>
                )}
            </div>

            <Input
                label="Organization Name"
                name="organizationName"
                value={formData.organizationName}
                onChange={onChange}
                required
                placeholder="e.g. Acme Dental Clinic"
            />

            <Input
                label="Your Full Name"
                name="fullName"
                value={formData.fullName}
                onChange={onChange}
                required
                placeholder="Dr. John Doe"
            />

            {/* Phase 1: Password with inline complexity validation */}
            <div>
                <Input
                    label="Password"
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={onChange}
                    required
                    minLength={8}
                    placeholder="••••••••"
                />
                {/* Password strength rules — visible once user starts typing */}
                {passwordTouched && (
                    <div className="mt-2 space-y-1">
                        {PASSWORD_RULES.map((rule, idx) => {
                            const pass = rule.test(pw);
                            return (
                                <div key={idx} className="flex items-center gap-2 text-xs">
                                    {pass ? (
                                        <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    ) : (
                                        <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 flex-shrink-0" />
                                    )}
                                    <span className={pass ? "text-emerald-600 font-medium" : "text-slate-400"}>
                                        {rule.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Verified fields summary */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    <span className="text-slate-600 font-medium">{formData.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    <span className="text-slate-600 font-medium">{formData.phoneNumber}</span>
                    <span className="text-emerald-600 text-xs font-bold">Verified</span>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium border border-red-100">
                    {error}
                </div>
            )}

            <Button type="submit" disabled={loading || !passwordValid}>
                {loading ? "Setting up your clinic…" : "Start Free Trial"}
            </Button>

            <button
                type="button"
                onClick={onBack}
                className="w-full text-sm text-slate-500 font-medium hover:text-slate-700 transition-colors"
            >
                ← Back to plan selection
            </button>
        </form>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Signup Page — 4-Step Wizard
// ═══════════════════════════════════════════════════════════════════════════════
export default function SignupPage() {
    useEffect(() => {
        document.title = "Sign Up | Start Your 14-Day Free Trial | DentalSaaS";
    }, []);

    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // ── Form state ───────────────────────────────────────────────────────────
    const [formData, setFormData] = useState({
        email: "",
        phoneNumber: "",
        otp: "",
        emailOtp: "",
        organizationName: "",
        fullName: "",
        password: "",
    });

    // ── OTP state ────────────────────────────────────────────────────────────
    const [otpExpiresIn, setOtpExpiresIn] = useState(600);
    const [pricingToken, setPricingToken] = useState(null);
    const [detectedCountry, setDetectedCountry] = useState(null);
    const [detectedRegion, setDetectedRegion] = useState(null);

    // ── Plan state ───────────────────────────────────────────────────────────
    const [plans, setPlans] = useState([]);
    const [planCurrency, setPlanCurrency] = useState("USD");
    const [isAnnual, setIsAnnual] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [plansLoading, setPlansLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // ── Step 1 → Request OTP ─────────────────────────────────────────────────
    const handleRequestOtp = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await publicApi.post("/public/request-otp", {
                phone: formData.phoneNumber,
                email: formData.email,
            });
            if (res.data.success) {
                setOtpExpiresIn(res.data.expiresInSeconds || 600);
                setStep(1);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to send verification code.");
        } finally {
            setLoading(false);
        }
    }, [formData.phoneNumber, formData.email]);

    // ── Step 2 → Verify OTP ──────────────────────────────────────────────────
    const handleVerifyOtp = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await publicApi.post("/public/verify-otp", {
                phone: formData.phoneNumber,
                otp: formData.otp,
                email: formData.email,
            });
            if (res.data.success) {
                setPricingToken(res.data.pricingToken);
                setDetectedCountry(res.data.country);
                setDetectedRegion(res.data.region);

                // v30.1: Move to email OTP step (email OTP was sent by backend)
                setStep(2);
                setFormData(prev => ({ ...prev, emailOtp: "" }));
            }
        } catch (err) {
            setError(err.response?.data?.message || "Verification failed.");
        } finally {
            setLoading(false);
        }
    }, [formData.phoneNumber, formData.otp]);

    // ── Step 3 → Verify Email OTP ────────────────────────────────────────────
    const handleVerifyEmailOtp = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await publicApi.post("/public/verify-email-otp", {
                email: formData.email,
                otp: formData.emailOtp,
            });
            if (res.data.success) {
                // Email verified — now fetch plans and move to plan step
                setStep(3);
                setPlansLoading(true);
                try {
                    const planRes = await publicApi.get(`/public/plans?country=${detectedCountry}`, {
                        headers: { "X-Pricing-Token": pricingToken }
                    });
                    if (planRes.data.success) {
                        setPlans(planRes.data.data || []);
                        setPlanCurrency(planRes.data.currency || "USD");
                    }
                } catch {
                    setError("Unable to load plans. Please try again.");
                } finally {
                    setPlansLoading(false);
                }
            }
        } catch (err) {
            setError(err.response?.data?.message || "Email verification failed.");
        } finally {
            setLoading(false);
        }
    }, [formData.email, formData.emailOtp, detectedCountry, pricingToken]);

    // ── Email OTP Resend Handler ────────────────────────────────────────────
    const [emailResendLoading, setEmailResendLoading] = useState(false);
    const handleResendEmailOtp = useCallback(async () => {
        setEmailResendLoading(true);
        setError(null);
        try {
            await publicApi.post("/public/resend-email-otp", { email: formData.email });
            setFormData(prev => ({ ...prev, emailOtp: "" }));
        } catch (err) {
            setError(err.response?.data?.message || "Failed to resend code.");
        } finally {
            setEmailResendLoading(false);
        }
    }, [formData.email]);

    // ── Step 4 → Select Plan ─────────────────────────────────────────────────
    const handleSelectPlan = useCallback((plan) => {
        setSelectedPlan(plan);
        setError(null);
        setStep(4);
    }, []);

    // ── Phase 2: OTP Resend Handler ────────────────────────────────────────────
    const [resendLoading, setResendLoading] = useState(false);
    const handleResendOtp = useCallback(async () => {
        setResendLoading(true);
        setError(null);
        try {
            const res = await publicApi.post("/public/request-otp", {
                phone: formData.phoneNumber,
                email: formData.email,
            });
            if (res.data.success) {
                setOtpExpiresIn(res.data.expiresInSeconds || 600);
                setFormData(prev => ({ ...prev, otp: "" }));
            }
        } catch (err) {
            setError(err.response?.data?.message || "Failed to resend code.");
        } finally {
            setResendLoading(false);
        }
    }, [formData.phoneNumber, formData.email]);

    // ── Step 4 → Submit Signup (Phase 3: Idempotency-Key, Phase 4: Auto-Login) ──
    const [autoLoginStatus, setAutoLoginStatus] = useState(null); // null | "logging_in" | "done" | "fallback"
    const handleSubmit = useCallback(async (e) => {
        e.preventDefault();
        // Phase 1: Client-side password validation
        if (!PASSWORD_REGEX.test(formData.password)) {
            setError("Password must contain at least 8 characters, one uppercase letter, one number, and one special character.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            // Phase 3: Generate Idempotency-Key
            const idempotencyKey = (typeof crypto !== "undefined" && crypto.randomUUID)
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

            const signupPayload = {
                organizationName: formData.organizationName,
                fullName: formData.fullName,
                email: formData.email,
                password: formData.password,
                phoneNumber: formData.phoneNumber,
                pricingToken,
                selectedPlanCode: selectedPlan?.code || null,
            };

            const res = await publicApi.post("/public/signup", signupPayload, {
                headers: { "Idempotency-Key": idempotencyKey },
            });

            if (res.data.success) {
                setSuccess(true);
                setLoading(false);

                // Phase 4: Auto-login — attempt to log the user in immediately
                setAutoLoginStatus("logging_in");
                try {
                    const clinicCode = res.data.data?.slug || res.data.data?.clinicCode || res.data.clinicCode || res.data.slug;
                    if (clinicCode) {
                        const loginRes = await api.post("/auth/login", {
                            clinicCode,
                            email: formData.email,
                            password: formData.password,
                        });
                        const { token: newToken, user: userData, csrfToken } = loginRes.data;
                        setAccessToken(newToken);
                        setCsrfToken(csrfToken);
                        if (userData.regionCode || userData.organization?.regionCode) {
                            localStorage.setItem("regionCode", userData.regionCode || userData.organization.regionCode);
                        }
                        setAutoLoginStatus("done");
                        setTimeout(() => {
                            navigate("/org/dashboard", { replace: true });
                        }, 1500);
                        return;
                    }
                } catch {
                    // Auto-login failed — graceful fallback to login page
                }

                // Fallback: redirect to login page if auto-login fails
                setAutoLoginStatus("fallback");
                setTimeout(() => {
                    navigate("/login", { state: { message: res.data.message } });
                }, 2500);
            }
        } catch (err) {
            setError(err.response?.data?.message || "Signup failed. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [formData, pricingToken, selectedPlan, navigate]);

    // ── Success Screen (Phase 4: Auto-Login aware) ───────────────────────────
    if (success) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12 px-6">
                <div className="max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 mb-2">Account Created!</h2>
                    <p className="text-slate-500 font-medium mb-1">Your 14-day free trial has started.</p>
                    {detectedCountry && (
                        <p className="text-slate-400 text-sm mb-1">
                            Region: <span className="font-bold text-blue-600">{detectedRegion}</span> ({detectedCountry})
                        </p>
                    )}
                    <p className="text-slate-400 text-sm">
                        {autoLoginStatus === "logging_in" && "Logging you in…"}
                        {autoLoginStatus === "done" && "Taking you to your dashboard…"}
                        {autoLoginStatus === "fallback" && "Redirecting to login…"}
                        {!autoLoginStatus && "Setting up…"}
                    </p>
                    <div className="mt-6 flex justify-center">
                        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                </div>
            </div>
        );
    }

    // ── Main Wizard ──────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12 px-6">
            <div className="max-w-lg w-full">
                <Card>
                    {/* Header */}
                    <div className="text-center mb-6">
                        <h1 className="text-3xl font-black text-slate-900 mb-2">Create Your Account</h1>
                        <p className="text-slate-500 font-medium text-sm">
                            Start your 14-day free trial. No credit card required.
                        </p>
                    </div>

                    {/* Step progress */}
                    <StepProgress currentIndex={step} />

                    {/* Step content */}
                    {step === 0 && (
                        <PhoneStep
                            formData={formData}
                            onChange={handleChange}
                            onNext={handleRequestOtp}
                            loading={loading}
                            error={error}
                        />
                    )}

                    {step === 1 && (
                        <OtpStep
                            formData={formData}
                            onChange={handleChange}
                            onNext={handleVerifyOtp}
                            onBack={() => { setStep(0); setError(null); }}
                            onResend={handleResendOtp}
                            loading={loading}
                            error={error}
                            expiresIn={otpExpiresIn}
                            resendLoading={resendLoading}
                        />
                    )}

                    {step === 2 && (
                        <EmailOtpStep
                            formData={formData}
                            onChange={handleChange}
                            onNext={handleVerifyEmailOtp}
                            onResend={handleResendEmailOtp}
                            loading={loading}
                            error={error}
                            resendLoading={emailResendLoading}
                        />
                    )}

                    {step === 3 && (
                        <PlanStep
                            plans={plans}
                            currency={planCurrency}
                            isAnnual={isAnnual}
                            onToggleInterval={() => setIsAnnual(!isAnnual)}
                            onSelectPlan={handleSelectPlan}
                            detectedCountry={detectedCountry}
                            detectedRegion={detectedRegion}
                            loading={plansLoading}
                            error={error}
                        />
                    )}

                    {step === 4 && (
                        <DetailsStep
                            formData={formData}
                            onChange={handleChange}
                            onSubmit={handleSubmit}
                            onBack={() => { setStep(3); setError(null); }}
                            loading={loading}
                            error={error}
                            selectedPlan={selectedPlan}
                            detectedCountry={detectedCountry}
                        />
                    )}

                    {/* Login link */}
                    <p className="text-center mt-6 text-sm text-slate-500 font-medium">
                        Already have an account?{" "}
                        <Link to="/login" className="text-blue-600 font-bold hover:underline">Sign In</Link>
                    </p>
                </Card>
            </div>
        </div>
    );
}
