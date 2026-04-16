/**
 * ResetPasswordPage.jsx — Submit new password using a reset token
 *
 * Public page (no auth required). Reached via link in reset email:
 *   /reset-password?token=abc123
 *
 * Posts to POST /api/auth/reset-password { token, newPassword }.
 * On success, shows confirmation and links back to /login.
 *
 * Password rules (mirrored from backend User schema):
 *   - Minimum 6 characters
 *   - Client-side confirmation field (confirm === password)
 */
import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { publicApi } from "@/services/api";
import { Button, Input, Card } from "@/design-system";

export default function ResetPasswordPage() {
    const [params] = useSearchParams();
    const token = params.get("token") || "";

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);

    const validations = useMemo(() => ({
        length: password.length >= 6,
        match: password.length > 0 && password === confirm,
    }), [password, confirm]);

    const canSubmit = token && validations.length && validations.match && !loading;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setError(null);
        setLoading(true);

        try {
            await publicApi.post("/auth/reset-password", {
                token,
                newPassword: password,
            });
            setSuccess(true);
        } catch (err) {
            const msg =
                err?.response?.data?.message ||
                "Failed to reset password. The link may have expired.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // Missing or empty token — show error immediately
    if (!token) {
        return (
            <PageShell>
                <Card>
                    <div className="text-center py-8">
                        <ErrorIcon />
                        <h2 className="text-xl font-semibold text-slate-900 mb-2">Invalid Reset Link</h2>
                        <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
                            This password reset link is missing or malformed.
                            Please request a new one.
                        </p>
                        <Link
                            to="/forgot-password"
                            className="inline-flex items-center gap-1 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                            Request New Link
                        </Link>
                    </div>
                </Card>
            </PageShell>
        );
    }

    return (
        <PageShell>
            <Card>
                {/* Logo */}
                <div className="flex justify-center mb-6 mt-1">
                    <Link to="/" className="flex items-center justify-center gap-2 bg-slate-50 px-4 py-2 rounded-full shadow-sm border border-slate-100 hover:bg-slate-100 transition-colors">
                        <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                        <span className="font-extrabold text-slate-800 text-[15px]">DentalSaaS Platform</span>
                    </Link>
                </div>

                {success ? (
                    /* ── Success state ──────────────────── */
                    <div className="text-center py-4">
                        <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                            <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-semibold text-slate-900 mb-2">Password Reset</h2>
                        <p className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">
                            Your password has been changed successfully. You can now sign in with your new password.
                        </p>
                        <Link
                            to="/login"
                            className="inline-flex items-center justify-center w-full h-14 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
                        >
                            Sign In
                        </Link>
                    </div>
                ) : (
                    /* ── Form state ─────────────────────── */
                    <>
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-semibold text-slate-900 mb-1">Set New Password</h2>
                            <p className="text-sm text-slate-500">Choose a strong password for your account</p>
                        </div>

                        <form id="reset-password-form" onSubmit={handleSubmit} className="space-y-5">
                            <Input
                                id="reset-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="New password"
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                }
                            />

                            <Input
                                id="reset-confirm"
                                type="password"
                                value={confirm}
                                onChange={(e) => setConfirm(e.target.value)}
                                required
                                placeholder="Confirm new password"
                                error={confirm && !validations.match ? "Passwords do not match" : undefined}
                                icon={
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                    </svg>
                                }
                            />

                            {/* Strength indicators */}
                            <div className="flex gap-3 text-xs">
                                <Indicator pass={validations.length} label="Min 6 characters" />
                                <Indicator pass={validations.match} label="Passwords match" />
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium text-red-600 flex items-center gap-2 shadow-sm">
                                    <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {error}
                                </div>
                            )}

                            <div className="pt-2">
                                <Button id="reset-submit-btn" type="submit" disabled={!canSubmit}>
                                    {loading ? "Resetting..." : "Reset Password"}
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
        </PageShell>
    );
}

// ── Shared layout shell (matches LoginPage / ForgotPasswordPage) ────────────
function PageShell({ children }) {
    return (
        <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] bg-[#F0F6FF] relative overflow-hidden font-sans">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-300 opacity-20 rounded-full blur-3xl z-0" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-400 opacity-10 rounded-full blur-3xl z-0" />

            {/* Left branding */}
            <div className="hidden md:flex flex-col justify-center px-24 py-16 z-10">
                <Link to="/" className="flex items-center gap-3 mb-4 w-max hover:opacity-80 transition-opacity">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <div className="font-extrabold text-2xl text-slate-800 tracking-tight">DentalSaaS Platform</div>
                </Link>

                <h1 className="text-5xl font-bold leading-tight text-slate-900 mt-2">
                    Create a New<br />
                    <span className="text-blue-600">Password</span>
                </h1>

                <p className="mt-6 text-lg text-slate-600 max-w-md">
                    Choose a strong password that you haven't used before.
                    Your account security is our top priority.
                </p>
            </div>

            {/* Right form */}
            <div className="relative flex items-center justify-center z-10">
                <div className="absolute right-0 top-0 h-full w-[60%] bg-gradient-to-br from-blue-200 to-blue-400 rounded-l-[120px] opacity-20 z-0" />
                <div className="relative z-10 w-full max-w-md px-4">
                    {children}
                </div>
            </div>
        </div>
    );
}

// ── Small helpers ────────────────────────────────────────────────────────────
function Indicator({ pass, label }) {
    return (
        <span className={`flex items-center gap-1 ${pass ? "text-green-600" : "text-slate-400"}`}>
            {pass ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" strokeWidth={2} />
                </svg>
            )}
            {label}
        </span>
    );
}

function ErrorIcon() {
    return (
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
        </div>
    );
}
