/**
 * VerifyEmailPage.jsx
 * Email OTP Verification Screen — v30.0
 *
 * Shown after signup to verify email ownership via a 6-digit OTP.
 * Email comes from query param (?email=...) or navigation state.
 *
 * MODULE: auth
 * PLANE: Organization
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../../services/api";
import "./VerifyEmailPage.css";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

export default function VerifyEmailPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const email = searchParams.get("email") || "";

    const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(""));
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [attemptsRemaining, setAttemptsRemaining] = useState(null);
    const inputRefs = useRef([]);

    // Cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => {
            setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // Auto-focus first input
    useEffect(() => {
        inputRefs.current[0]?.focus();
    }, []);

    const handleChange = useCallback((index, value) => {
        if (!/^\d*$/.test(value)) return; // digits only

        const newDigits = [...digits];
        newDigits[index] = value.slice(-1); // single digit
        setDigits(newDigits);
        setError("");

        // Auto-advance to next
        if (value && index < OTP_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    }, [digits]);

    const handleKeyDown = useCallback((index, e) => {
        if (e.key === "Backspace" && !digits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    }, [digits]);

    const handlePaste = useCallback((e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
        if (!pasted) return;

        const newDigits = Array(OTP_LENGTH).fill("");
        for (let i = 0; i < pasted.length; i++) {
            newDigits[i] = pasted[i];
        }
        setDigits(newDigits);
        setError("");

        // Focus the next empty or the last
        const nextEmpty = newDigits.findIndex((d) => !d);
        inputRefs.current[nextEmpty >= 0 ? nextEmpty : OTP_LENGTH - 1]?.focus();
    }, []);

    const handleVerify = async () => {
        const otp = digits.join("");
        if (otp.length !== OTP_LENGTH) {
            setError("Please enter the complete 6-digit code.");
            return;
        }

        setLoading(true);
        setError("");
        setSuccess("");

        try {
            const res = await api.post("/auth/verify-email-otp", { email, otp });
            if (res.data.success) {
                setSuccess("Email verified successfully! Redirecting to login...");
                setTimeout(() => navigate("/login", { replace: true }), 2000);
            }
        } catch (err) {
            const msg = err.response?.data?.message || "Verification failed. Please try again.";
            setError(msg);
            if (err.response?.data?.attemptsRemaining != null) {
                setAttemptsRemaining(err.response.data.attemptsRemaining);
            }
            // Clear digits on failure
            setDigits(Array(OTP_LENGTH).fill(""));
            inputRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0) return;

        setLoading(true);
        setError("");
        setSuccess("");

        try {
            await api.post("/auth/resend-email-otp", { email });
            setSuccess("A new verification code has been sent to your email.");
            setResendCooldown(RESEND_COOLDOWN_S);
            setDigits(Array(OTP_LENGTH).fill(""));
            setAttemptsRemaining(null);
            inputRefs.current[0]?.focus();
        } catch (err) {
            const msg = err.response?.data?.message || "Failed to resend code.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // Auto-submit when all digits filled
    useEffect(() => {
        if (digits.every((d) => d) && digits.join("").length === OTP_LENGTH && !loading) {
            handleVerify();
        }
    }, [digits]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!email) {
        return (
            <div className="verify-email-page">
                <div className="verify-email-card">
                    <h2>Missing Email</h2>
                    <p>No email address provided. Please start from the signup page.</p>
                    <button onClick={() => navigate("/signup")} className="verify-email-btn">
                        Go to Signup
                    </button>
                </div>
            </div>
        );
    }

    const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, "$1***$3");

    return (
        <div className="verify-email-page">
            <div className="verify-email-card">
                {/* Icon */}
                <div className="verify-email-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                </div>

                <h1 className="verify-email-title">Verify Your Email</h1>
                <p className="verify-email-subtitle">
                    We sent a 6-digit verification code to<br />
                    <strong>{maskedEmail}</strong>
                </p>

                {/* OTP Inputs */}
                <div className="otp-inputs" onPaste={handlePaste}>
                    {digits.map((digit, i) => (
                        <input
                            key={i}
                            ref={(el) => (inputRefs.current[i] = el)}
                            id={`otp-input-${i}`}
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={1}
                            value={digit}
                            onChange={(e) => handleChange(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            className={`otp-input ${digit ? "filled" : ""} ${error ? "error" : ""}`}
                            disabled={loading}
                        />
                    ))}
                </div>

                {/* Status Messages */}
                {error && (
                    <div className="verify-email-error">
                        {error}
                        {attemptsRemaining != null && (
                            <span className="attempts-remaining"> ({attemptsRemaining} attempts remaining)</span>
                        )}
                    </div>
                )}
                {success && <div className="verify-email-success">{success}</div>}

                {/* Verify Button */}
                <button
                    id="verify-email-submit"
                    onClick={handleVerify}
                    disabled={loading || digits.some((d) => !d)}
                    className="verify-email-btn"
                >
                    {loading ? (
                        <span className="btn-spinner" />
                    ) : (
                        "Verify Email"
                    )}
                </button>

                {/* Resend */}
                <div className="verify-email-resend">
                    <span>Didn't receive the code?</span>
                    <button
                        id="resend-email-otp"
                        onClick={handleResend}
                        disabled={loading || resendCooldown > 0}
                        className="resend-btn"
                    >
                        {resendCooldown > 0
                            ? `Resend in ${resendCooldown}s`
                            : "Resend Code"
                        }
                    </button>
                </div>

                {/* Expiry note */}
                <p className="verify-email-expiry">Code expires in 10 minutes</p>
            </div>
        </div>
    );
}
