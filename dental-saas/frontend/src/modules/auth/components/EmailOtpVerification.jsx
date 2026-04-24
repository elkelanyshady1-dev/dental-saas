/**
 * EmailOtpVerification.jsx — Shared 6-digit email-OTP surface.
 * v1.1 — Centralized error copy, analytics, network retry, memoization,
 *        dev-only duplication guard.
 *
 * Used by:
 *   - SignupPage (inline wizard step 3)   → publicApi + /public endpoints
 *   - VerifyEmailPage (standalone page)   → authenticated /auth endpoints
 *
 * The component owns: digit inputs, paste, auto-advance, auto-submit,
 * cooldown timer, error → structured-code mapping, a11y labels, funnel
 * analytics. The caller owns: endpoint selection (via `onVerify` /
 * `onResend`) and post-success navigation (via `onSuccess`).
 */

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { maskEmail } from "@/utils/emailMask";
import { resolveErrorMessage } from "@/modules/onboarding/errorMessages";
import { track, EVENTS } from "@/modules/onboarding/analytics";
import { withRetry } from "@/modules/onboarding/withRetry";

const OTP_LENGTH = 6;
const DEFAULT_COOLDOWN_S = 60;

/**
 * @param {Object}   props
 * @param {string}   props.email                  — target email (required for masking + resend).
 * @param {Function} props.onVerify               — async (otp) => Promise<AxiosResponse>. Throws AxiosError on failure.
 * @param {Function} props.onResend               — async () => Promise<AxiosResponse>. Throws on failure.
 * @param {Function} props.onSuccess              — called after a successful verification.
 * @param {Function} [props.onChangeEmail]        — if provided, renders a "Change email" link.
 * @param {number}   [props.resendCooldownS]      — cooldown seconds (default 60).
 * @param {string}   [props.expiresInCopy]        — expiry copy under the input (default "Code expires in 10 minutes").
 * @param {"card"|"bare"} [props.chrome]          — wrap in a card (standalone pages) or not (wizard steps).
 * @param {string}   [props.surface]              — analytics label for where this is mounted (e.g. "signup", "verify-email"). Default "verify-email".
 */
function EmailOtpVerificationImpl({
    email,
    onVerify,
    onResend,
    onSuccess,
    onChangeEmail,
    resendCooldownS = DEFAULT_COOLDOWN_S,
    expiresInCopy = "Code expires in 10 minutes",
    chrome = "card",
    surface = "verify-email",
}) {
    const [digits, setDigits] = useState(() => Array(OTP_LENGTH).fill(""));
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [attemptsRemaining, setAttemptsRemaining] = useState(null);
    const inputRefs = useRef([]);

    // Dev-time duplication guard. If two <EmailOtpVerification /> components
    // are live at once, something is wrong (a regression reintroduced the
    // parallel flow). Never a runtime error — just a console signal.
    useEffect(() => {
        if (!(import.meta.env && import.meta.env.DEV)) return undefined;
        if (typeof window === "undefined") return undefined;
        if (window.__OTP_FLOW_ACTIVE__) {
            // eslint-disable-next-line no-console
            console.warn(
                "[EmailOtpVerification] Duplicate OTP surface mounted. " +
                "Investigate regression — this component should be the only OTP flow."
            );
        }
        window.__OTP_FLOW_ACTIVE__ = true;
        return () => { window.__OTP_FLOW_ACTIVE__ = false; };
    }, []);

    // Mount-time funnel view event
    useEffect(() => {
        track(EVENTS.SIGNUP_STEP_VIEW, { step: "emailOtp", surface });
    }, [surface]);

    // Cooldown tick
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // Auto-focus first box
    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = useCallback((index, value) => {
        if (!/^\d*$/.test(value)) return;
        setDigits((prev) => {
            const next = [...prev];
            next[index] = value.slice(-1);
            return next;
        });
        setError("");
        if (value && index < OTP_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    }, []);

    const handleKeyDown = useCallback((index, e) => {
        if (e.key === "Backspace") {
            setDigits((prev) => {
                const next = [...prev];
                if (next[index]) {
                    next[index] = "";
                } else if (index > 0) {
                    inputRefs.current[index - 1]?.focus();
                    next[index - 1] = "";
                }
                return next;
            });
        }
    }, []);

    const handlePaste = useCallback((e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (!pasted) return;
        const next = Array(OTP_LENGTH).fill("");
        for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
        setDigits(next);
        setError("");
        const nextEmpty = next.findIndex((d) => !d);
        inputRefs.current[nextEmpty >= 0 ? nextEmpty : OTP_LENGTH - 1]?.focus();
    }, []);

    const attemptVerify = useCallback(async () => {
        const otp = digits.join("");
        if (otp.length !== OTP_LENGTH || loading) return;
        setLoading(true);
        setError("");
        setSuccess("");
        track(EVENTS.OTP_SUBMITTED, { surface });
        try {
            // withRetry: retries only on transient failures (network, 5xx).
            // Wrong-OTP 400s are surfaced immediately — retrying wouldn't help.
            const res = await withRetry(() => onVerify(otp), {
                toastOnFail: null, // surface inline instead of a toast
            });
            track(EVENTS.OTP_VERIFIED, { surface });
            setSuccess("Verified! Redirecting…");
            if (onSuccess) onSuccess(res);
        } catch (err) {
            const payload = err?.response?.data;
            const msg = resolveErrorMessage(payload);
            setError(msg);
            if (payload?.attemptsRemaining != null) {
                setAttemptsRemaining(payload.attemptsRemaining);
            }
            track(EVENTS.OTP_FAILED, {
                surface,
                reason: payload?.code || "UNKNOWN",
                attemptsRemaining: payload?.attemptsRemaining ?? null,
            });
            setDigits(Array(OTP_LENGTH).fill(""));
            inputRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    }, [digits, loading, onVerify, onSuccess, surface]);

    // Auto-submit when all digits filled (browser SMS autofill + paste)
    useEffect(() => {
        if (digits.every((d) => d) && digits.join("").length === OTP_LENGTH && !loading) {
            attemptVerify();
        }
    }, [digits, loading, attemptVerify]);

    const handleResend = useCallback(async () => {
        if (resendCooldown > 0 || loading) return;
        setLoading(true);
        setError("");
        setSuccess("");
        track(EVENTS.OTP_RESENT, { surface });
        try {
            await withRetry(() => onResend(), { toastOnFail: null });
            setSuccess("A new verification code has been sent to your email.");
            setResendCooldown(resendCooldownS);
            setDigits(Array(OTP_LENGTH).fill(""));
            setAttemptsRemaining(null);
            inputRefs.current[0]?.focus();
        } catch (err) {
            const payload = err?.response?.data;
            const msg = resolveErrorMessage(payload);
            setError(msg);
            if (payload?.code === "OTP_RESEND_RATE_LIMITED") {
                track(EVENTS.OTP_RESEND_RATE_LIMITED, { surface });
            }
        } finally {
            setLoading(false);
        }
    }, [resendCooldown, loading, onResend, resendCooldownS, surface]);

    const maskedEmail = maskEmail(email);

    const body = (
        <>
            <div className="flex justify-center mb-4">
                <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-blue-600" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                </div>
            </div>

            <h1 className="text-xl font-bold text-slate-900 text-center mb-1">Verify Your Email</h1>
            <p className="text-sm text-slate-500 text-center mb-5">
                We sent a 6-digit code to<br />
                <strong className="text-slate-700">{maskedEmail}</strong>
            </p>

            <fieldset className="mb-3" onPaste={handlePaste} aria-label="6-digit verification code">
                <legend className="sr-only">Enter your 6-digit verification code</legend>
                <div className="flex justify-center gap-2">
                    {digits.map((digit, i) => (
                        <input
                            key={i}
                            ref={(el) => (inputRefs.current[i] = el)}
                            id={`otp-digit-${i}`}
                            aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleChange(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            className={`w-12 h-14 text-center text-2xl font-mono font-bold rounded-xl border-2 transition
                                ${digit ? "border-blue-500 bg-blue-50/30 text-slate-900" : "border-slate-200 text-slate-900"}
                                ${error ? "border-red-400 bg-red-50/40" : ""}
                                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                                disabled:bg-slate-100 disabled:cursor-not-allowed`}
                            disabled={loading}
                        />
                    ))}
                </div>
                <p className="text-center text-xs text-slate-400 mt-2">Paste or type your 6-digit code</p>
            </fieldset>

            {error && (
                <div role="alert" className="bg-red-50 border border-red-100 text-red-600 px-3 py-2.5 rounded-xl text-sm font-medium mb-3">
                    {error}
                    {attemptsRemaining != null && attemptsRemaining > 0 && !error.includes("attempts remaining") && (
                        <span className="block text-xs mt-0.5 text-red-500/80">{attemptsRemaining} attempts remaining</span>
                    )}
                </div>
            )}
            {success && !error && (
                <div role="status" className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-2.5 rounded-xl text-sm font-medium mb-3">
                    {success}
                </div>
            )}

            <button
                type="button"
                onClick={attemptVerify}
                disabled={loading || digits.some((d) => !d)}
                className="w-full h-12 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {loading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : "Verify Email"}
            </button>

            <div className="mt-4 text-center text-sm text-slate-500">
                <span>Didn't receive the code? </span>
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={loading || resendCooldown > 0}
                    className="font-bold text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                </button>
            </div>

            {onChangeEmail && (
                <button
                    type="button"
                    onClick={onChangeEmail}
                    className="mt-3 w-full text-center text-sm text-slate-500 font-medium hover:text-slate-700 transition-colors"
                >
                    ← Change email
                </button>
            )}

            <p className="text-center text-xs text-slate-400 mt-4">{expiresInCopy}</p>
        </>
    );

    if (chrome === "bare") return <div>{body}</div>;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-100 p-8">
                {body}
            </div>
        </div>
    );
}

// React.memo — callers that keep handler references stable (useCallback)
// avoid re-renders on parent unrelated state changes (e.g. plan loading).
const EmailOtpVerification = memo(EmailOtpVerificationImpl);

export default EmailOtpVerification;
