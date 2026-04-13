/**
 * PortalLoginPage.jsx — Patient Portal Login (Phase 6: Access System Integration)
 *
 * Rebuilt to support 3 login modes:
 *   1. Password login (existing)
 *   2. OTP login (existing)
 *   3. Magic link login (NEW — Phase 6)
 *
 * Uses @/design-system Button component.
 * Route:  /portal/login (public, no guard)
 * Plane isolation: does NOT import any modules/org/* or platform/*
 */
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/design-system";
import { portalAuthApi } from "../services/portalAuth.api";

/* ═══════════════════════════════════════════════════════════════════════════
   ICONS
   ═══════════════════════════════════════════════════════════════════════════ */

const BrandIcon = () => (
    <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" rx="3" width="18" height="18" />
        <path d="M8 12h8M12 8v8" />
    </svg>
);

const ChartIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M7 16l4-8 4 4 4-6" />
    </svg>
);

const CalendarIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
);

const ClipboardIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 14l2 2 4-4" />
    </svg>
);

const GlobeIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
);

const EyeIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
    </svg>
);

const EyeOffIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
);

const AlertCircleIcon = () => (
    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4m0 4h.01" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
    </svg>
);

const LinkIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
);

const MailIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M22 7l-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
    </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   FEATURE CARD (glassmorphic)
   ═══════════════════════════════════════════════════════════════════════════ */

function FeatureCard({ icon, title }) {
    return (
        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md rounded-2xl px-5 py-4 border border-white/10 hover:bg-white/15 transition-all duration-300 group cursor-default">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white shrink-0 group-hover:bg-white/20 transition-colors">
                {icon}
            </div>
            <span className="text-white font-semibold text-[15px]">{title}</span>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export default function PortalLoginPage() {
    const [email,       setEmail]       = useState("");
    const [password,    setPassword]    = useState("");
    const [showPwd,     setShowPwd]     = useState(false);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState(null);
    const [success,     setSuccess]     = useState(null);
    const [mode,        setMode]        = useState("password"); // "password" | "otp" | "magic_link"
    const [otpSent,     setOtpSent]     = useState(false);
    const [otp,         setOtp]         = useState("");
    const [linkSent,    setLinkSent]    = useState(false);
    const navigate = useNavigate();

    // ── Password login ──────────────────────────────────────────────────────
    const handlePasswordLogin = async (e) => {
        e.preventDefault();
        setLoading(true); setError(null); setSuccess(null);
        try {
            const res = await portalAuthApi.login({ email, password });
            const token = res.token || res.accessToken || res.data?.token;
            if (!token) throw new Error("No token returned");
            localStorage.setItem("patientToken", token);
            navigate("/portal/dashboard", { replace: true });
        } catch (err) {
            setError(err?.message || err?.error || "Invalid email or password");
        } finally {
            setLoading(false);
        }
    };

    // ── OTP flow ────────────────────────────────────────────────────────────
    const handleRequestOtp = async (e) => {
        e.preventDefault();
        if (!email) { setError("Enter your email first"); return; }
        setLoading(true); setError(null); setSuccess(null);
        try {
            await portalAuthApi.requestOtp({ email });
            setOtpSent(true);
        } catch (err) {
            setError(err?.message || "Failed to send OTP");
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const res = await portalAuthApi.verifyOtp({ email, otp });
            const token = res.token || res.accessToken || res.data?.token;
            if (!token) throw new Error("No token returned");
            localStorage.setItem("patientToken", token);
            navigate("/portal/dashboard", { replace: true });
        } catch (err) {
            setError(err?.message || "Invalid OTP");
        } finally {
            setLoading(false);
        }
    };

    // ── Magic Link flow (NEW) ───────────────────────────────────────────────
    const handleRequestMagicLink = async (e) => {
        e.preventDefault();
        if (!email) { setError("Enter your email first"); return; }
        setLoading(true); setError(null); setSuccess(null);
        try {
            await portalAuthApi.requestMagicLink({ email });
            setLinkSent(true);
            setSuccess("Magic link sent! Check your email inbox.");
        } catch (err) {
            setError(err?.message || "Failed to send magic link");
        } finally {
            setLoading(false);
        }
    };

    /* ═══════════════════════════════════════════════════════════════════════ */

    const inputBase = "w-full h-[52px] rounded-lg border border-slate-200 px-4 text-slate-900 text-sm bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

    const TABS = [
        ["password", "Password"],
        ["magic_link", "Magic Link"],
        ["otp", "OTP Code"],
    ];

    return (
        <div className="min-h-screen flex flex-col font-sans">
            {/* ═══════════════════════════════════════════════════════════════
                MAIN TWO-COLUMN LAYOUT
                ═══════════════════════════════════════════════════════════ */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1fr]">

                {/* ── LEFT COLUMN: Blue gradient branding ──────────────── */}
                <div className="hidden lg:flex flex-col relative overflow-hidden"
                     style={{ background: "linear-gradient(160deg, #1e40af 0%, #2563eb 35%, #1d4ed8 70%, #1e3a8a 100%)" }}>

                    {/* Decorative overlay shapes */}
                    <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-2xl" />
                    <div className="absolute top-20 left-10 w-[200px] h-[200px] bg-blue-400/10 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-full h-[280px] bg-gradient-to-t from-blue-950/40 to-transparent" />

                    {/* Content */}
                    <div className="relative z-10 flex flex-col justify-between h-full px-12 xl:px-16 py-10">

                        {/* Logo */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                                <BrandIcon />
                            </div>
                            <span className="text-white font-bold text-xl tracking-tight">DentalSaaS</span>
                        </div>

                        {/* Headline + features */}
                        <div className="mt-auto mb-auto -translate-y-4">
                            <h1 className="text-[44px] xl:text-5xl font-bold text-white leading-[1.15] tracking-tight">
                                Transforming Smiles<br />
                                with Precision
                            </h1>
                            <p className="mt-5 text-blue-100/80 text-base leading-relaxed max-w-[420px]">
                                Your personalized orthodontic journey, powered by expert care and digital innovation.
                            </p>

                            <div className="mt-10 space-y-3 max-w-[420px]">
                                <FeatureCard icon={<ChartIcon />}     title="Treatment Progress Tracking" />
                                <FeatureCard icon={<CalendarIcon />}   title="Smart Appointment Scheduling" />
                                <FeatureCard icon={<ClipboardIcon />}  title="Personalized Care Plans" />
                            </div>
                        </div>

                        {/* Left footer */}
                        <div className="flex items-center justify-between text-blue-200/60 text-xs mt-8">
                            <span>© {new Date().getFullYear()} DentalSaaS Systems</span>
                            <div className="flex gap-5">
                                <a href="#" className="hover:text-white transition">Support</a>
                                <a href="#" className="hover:text-white transition">Privacy</a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── RIGHT COLUMN: Login form ─────────────────────────── */}
                <div className="flex flex-col bg-[#f5f6f8]">

                    {/* Form area */}
                    <div className="flex-1 flex items-center justify-center px-6 py-12">
                        <div className="w-full max-w-[420px]">

                            {/* Language selector */}
                            <div className="flex justify-end mb-6">
                                <button
                                    id="portal-language-selector"
                                    className="flex items-center gap-1.5 text-sm text-slate-600 bg-white border border-slate-200 rounded-full px-3.5 py-1.5 hover:bg-slate-50 transition shadow-sm"
                                >
                                    <GlobeIcon />
                                    <span className="font-medium">English</span>
                                    <ChevronDownIcon />
                                </button>
                            </div>

                            {/* Login card */}
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 xl:p-10">

                                {/* Header */}
                                <h2 id="portal-login-heading" className="text-2xl font-bold text-slate-900">
                                    Welcome Back
                                </h2>
                                <p className="text-sm text-slate-500 mt-1 mb-7">
                                    Access your orthodontic care portal
                                </p>

                                {/* ── Mode tabs (pill style) ───────────────── */}
                                <div
                                    role="tablist"
                                    aria-label="Login method"
                                    className="flex items-center border border-slate-200 rounded-full p-1 mb-7"
                                >
                                    {TABS.map(([m, label]) => (
                                        <button
                                            key={m}
                                            role="tab"
                                            id={`portal-tab-${m}`}
                                            aria-selected={mode === m}
                                            aria-controls={`portal-panel-${m}`}
                                            onClick={() => { setMode(m); setError(null); setSuccess(null); setOtpSent(false); setOtp(""); setLinkSent(false); }}
                                            className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
                                                mode === m
                                                    ? "bg-slate-900 text-white shadow-sm"
                                                    : "text-slate-500 hover:text-slate-700"
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                {/* ── Password form ────────────────────────── */}
                                {mode === "password" && (
                                    <form
                                        id="portal-panel-password"
                                        role="tabpanel"
                                        aria-labelledby="portal-tab-password"
                                        onSubmit={handlePasswordLogin}
                                        className="space-y-4"
                                    >
                                        <div>
                                            <input
                                                id="portal-email"
                                                type="text"
                                                required
                                                autoComplete="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                placeholder="Email or Phone Number"
                                                className={inputBase}
                                                aria-invalid={!!error}
                                            />
                                        </div>

                                        <div className="relative">
                                            <input
                                                id="portal-password"
                                                type={showPwd ? "text" : "password"}
                                                required
                                                autoComplete="current-password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                placeholder="Password"
                                                className={`${inputBase} pr-12`}
                                                aria-invalid={!!error}
                                            />
                                            <button
                                                type="button"
                                                id="portal-toggle-password"
                                                onClick={() => setShowPwd(!showPwd)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1"
                                                aria-label={showPwd ? "Hide password" : "Show password"}
                                            >
                                                {showPwd ? <EyeOffIcon /> : <EyeIcon />}
                                            </button>
                                        </div>

                                        <div className="flex items-center justify-between pt-1">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    id="portal-remember"
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-slate-600">Remember me</span>
                                            </label>
                                            <a
                                                id="portal-forgot-password"
                                                href="#"
                                                className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition"
                                            >
                                                Forgot Password?
                                            </a>
                                        </div>

                                        {error && (
                                            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2">
                                                <AlertCircleIcon />
                                                {error}
                                            </div>
                                        )}

                                        <Button
                                            id="portal-submit-password"
                                            type="submit"
                                            size="lg"
                                            loading={loading}
                                            disabled={loading}
                                            className="w-full !rounded-lg !py-3 !text-base !font-semibold mt-2"
                                        >
                                            {loading ? "Signing in..." : "Sign In to Portal"}
                                        </Button>
                                    </form>
                                )}

                                {/* ── Magic Link form (NEW) ──────────────────── */}
                                {mode === "magic_link" && (
                                    <form
                                        id="portal-panel-magic_link"
                                        role="tabpanel"
                                        aria-labelledby="portal-tab-magic_link"
                                        onSubmit={handleRequestMagicLink}
                                        className="space-y-4"
                                    >
                                        {!linkSent ? (
                                            <>
                                                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                                                    <LinkIcon />
                                                    <div>
                                                        <p className="text-sm font-semibold text-blue-800">Passwordless Login</p>
                                                        <p className="text-xs text-blue-600 mt-0.5">
                                                            We'll send a secure login link to your email. Just click it to sign in — no password needed.
                                                        </p>
                                                    </div>
                                                </div>

                                                <div>
                                                    <input
                                                        id="portal-magic-email"
                                                        type="email"
                                                        required
                                                        value={email}
                                                        onChange={(e) => setEmail(e.target.value)}
                                                        placeholder="Enter your email address"
                                                        className={inputBase}
                                                    />
                                                </div>

                                                {error && (
                                                    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2">
                                                        <AlertCircleIcon />
                                                        {error}
                                                    </div>
                                                )}

                                                <Button
                                                    id="portal-submit-magic"
                                                    type="submit"
                                                    size="lg"
                                                    loading={loading}
                                                    disabled={loading}
                                                    className="w-full !rounded-lg !py-3 !text-base !font-semibold mt-2"
                                                >
                                                    {loading ? "Sending..." : "Send Login Link"}
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="text-center py-4">
                                                    <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                                                        <MailIcon />
                                                    </div>
                                                    <h3 className="text-lg font-bold text-slate-900 mb-1">Check your email</h3>
                                                    <p className="text-sm text-slate-500">
                                                        We sent a login link to <strong>{email}</strong>
                                                    </p>
                                                    <p className="text-xs text-slate-400 mt-2">
                                                        The link expires in 15 minutes.
                                                    </p>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => { setLinkSent(false); setSuccess(null); }}
                                                    className="w-full text-sm text-slate-400 hover:text-slate-600 font-medium transition mt-2"
                                                >
                                                    Didn't receive it? Send again
                                                </button>
                                            </>
                                        )}
                                    </form>
                                )}

                                {/* ── OTP form ─────────────────────────────── */}
                                {mode === "otp" && (
                                    <form
                                        id="portal-panel-otp"
                                        role="tabpanel"
                                        aria-labelledby="portal-tab-otp"
                                        onSubmit={otpSent ? handleVerifyOtp : handleRequestOtp}
                                        className="space-y-4"
                                    >
                                        <div>
                                            <input
                                                id="portal-otp-email"
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                disabled={otpSent}
                                                placeholder="Email or Phone Number"
                                                className={inputBase}
                                            />
                                        </div>

                                        {otpSent && (
                                            <>
                                                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-sm text-blue-700 font-medium flex items-center gap-2">
                                                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    Code sent to {email}. Check your inbox.
                                                </div>

                                                <div>
                                                    <input
                                                        id="portal-otp-code"
                                                        type="text"
                                                        required
                                                        maxLength={8}
                                                        value={otp}
                                                        onChange={(e) => setOtp(e.target.value)}
                                                        placeholder="Enter OTP Code"
                                                        className={`${inputBase} text-center text-xl tracking-[0.3em] font-bold`}
                                                    />
                                                </div>
                                            </>
                                        )}

                                        {error && (
                                            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2">
                                                <AlertCircleIcon />
                                                {error}
                                            </div>
                                        )}

                                        <Button
                                            id="portal-submit-otp"
                                            type="submit"
                                            size="lg"
                                            loading={loading}
                                            disabled={loading}
                                            className="w-full !rounded-lg !py-3 !text-base !font-semibold mt-2"
                                        >
                                            {loading
                                                ? (otpSent ? "Verifying..." : "Sending Code...")
                                                : (otpSent ? "Verify Code" : "Send OTP Code")}
                                        </Button>

                                        {otpSent && (
                                            <button
                                                id="portal-resend-otp"
                                                type="button"
                                                onClick={() => { setOtpSent(false); setOtp(""); setError(null); }}
                                                className="w-full text-sm text-slate-400 hover:text-slate-600 font-medium transition"
                                            >
                                                Didn't receive it? Try again
                                            </button>
                                        )}
                                    </form>
                                )}

                                {/* ── Request Access ────────────────────────── */}
                                <div className="mt-8">
                                    <p className="text-center text-sm text-slate-500 mb-3">
                                        Don't have an account yet?
                                    </p>
                                    <button
                                        id="portal-request-access"
                                        className="w-full h-[48px] rounded-lg border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 hover:border-slate-300 transition-all"
                                        onClick={() => {/* future: navigate to request access */}}
                                    >
                                        Request Access
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════
                BOTTOM FOOTER BAR
                ═══════════════════════════════════════════════════════════ */}
            <footer className="bg-[#f5f6f8] border-t border-slate-200 px-6 lg:px-12 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
                <span>© {new Date().getFullYear()} DentalSaaS Systems. Clinical Precision and Digital Innovation.</span>
                <div className="flex items-center gap-5">
                    <a href="#" className="hover:text-slate-600 transition">HIPAA Compliant</a>
                    <a href="#" className="hover:text-slate-600 transition">Privacy Policy</a>
                    <a href="#" className="hover:text-slate-600 transition">Security Standards</a>
                    <a href="#" className="hover:text-slate-600 transition">Support</a>
                </div>
            </footer>
        </div>
    );
}
