/**
 * ForgotPasswordPage.jsx — Request password reset link
 *
 * Public page (no auth required). Posts to POST /api/auth/forgot-password.
 * Backend always returns success (to avoid email enumeration), so we show
 * a generic "check your email" message regardless.
 *
 * Requires both email AND clinicCode because the system is multi-tenant —
 * the same email can exist across orgs, so the backend needs the org slug
 * to resolve the correct user.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { publicApi } from "@/services/api";
import { Button, Input, Card } from "@/design-system";
import { BRAND } from "@/config/brand";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [clinicCode, setClinicCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await publicApi.post("/auth/forgot-password", {
                email: email.trim().toLowerCase(),
                clinicCode: clinicCode.trim().toLowerCase(),
            });
            setSent(true);
        } catch (err) {
            if (err?.response?.status === 429) {
                setError("Too many requests. Please wait a few minutes before trying again.");
            } else {
                // Backend intentionally returns 200 even for unknown emails,
                // so a real error here is a network/server issue.
                setError("Something went wrong. Please try again later.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] bg-[#F0F6FF] relative overflow-hidden font-sans">
            {/* Background layers */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-300 opacity-20 rounded-full blur-3xl z-0" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-400 opacity-10 rounded-full blur-3xl z-0" />

            {/* LEFT — branding (hidden on mobile) */}
            <div className="hidden md:flex flex-col justify-center px-24 py-16 z-10">
                <Link to="/" className="flex items-center gap-3 mb-4 w-max hover:opacity-80 transition-opacity">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="font-extrabold text-2xl text-slate-800 tracking-tight">{BRAND.name}</div>
                </Link>

                <h1 className="text-5xl font-bold leading-tight text-slate-900 mt-2">
                    Reset Your<br />
                    <span className="text-blue-600">Password</span>
                </h1>

                <p className="mt-6 text-lg text-slate-600 max-w-md">
                    Enter your clinic code and email address. If an account exists,
                    we'll send a secure reset link to your inbox.
                </p>

                <div className="mt-12 flex items-center gap-3 text-sm text-slate-500">
                    <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    Reset links expire in 10 minutes for your security
                </div>
            </div>

            {/* RIGHT — form */}
            <div className="relative flex items-center justify-center z-10">
                <div className="absolute right-0 top-0 h-full w-[60%] bg-gradient-to-br from-blue-200 to-blue-400 rounded-l-[120px] opacity-20 z-0" />

                <div className="relative z-10 w-full max-w-md px-4">
                    <Card>
                        {/* Logo */}
                        <div className="flex justify-center mb-6 mt-1">
                            <Link to="/" className="flex items-center justify-center gap-2 bg-slate-50 px-4 py-2 rounded-full shadow-sm border border-slate-100 hover:bg-slate-100 transition-colors">
                                <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <span className="font-extrabold text-slate-800 text-[15px]">{BRAND.name}</span>
                            </Link>
                        </div>

                        {sent ? (
                            /* ── Success state ──────────────────── */
                            <div className="text-center py-4">
                                <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-semibold text-slate-900 mb-2">Check Your Email</h2>
                                <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
                                    If an account with that email exists in the specified clinic,
                                    you'll receive a password reset link shortly.
                                </p>
                                <p className="text-xs text-slate-400 mb-6">
                                    The link will expire in 10 minutes. Check your spam folder if you don't see it.
                                </p>
                                <Link
                                    to="/login"
                                    className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                                    </svg>
                                    Back to Sign In
                                </Link>
                            </div>
                        ) : (
                            /* ── Form state ─────────────────────── */
                            <>
                                <div className="text-center mb-8">
                                    <h2 className="text-2xl font-semibold text-slate-900 mb-1">Forgot Password?</h2>
                                    <p className="text-sm text-slate-500">We'll email you a secure reset link</p>
                                </div>

                                <form id="forgot-password-form" onSubmit={handleSubmit} className="space-y-5">
                                    <Input
                                        id="forgot-clinic-code"
                                        type="text"
                                        value={clinicCode}
                                        onChange={(e) => setClinicCode(e.target.value)}
                                        required
                                        placeholder="Clinic Code (e.g. apex)"
                                        icon={
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                            </svg>
                                        }
                                    />

                                    <Input
                                        id="forgot-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        placeholder="Your clinic email address"
                                        icon={
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                        }
                                    />

                                    {error && (
                                        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2 shadow-sm">
                                            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            {error}
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        <Button id="forgot-submit-btn" type="submit" disabled={loading}>
                                            {loading ? "Sending..." : "Send Reset Link"}
                                        </Button>
                                    </div>
                                </form>

                                <p className="text-center mt-8 text-sm text-slate-500 font-medium">
                                    Remember your password?{" "}
                                    <Link to="/login" className="text-blue-600 hover:text-blue-700 font-bold ml-1">
                                        Sign In
                                    </Link>
                                </p>
                            </>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
