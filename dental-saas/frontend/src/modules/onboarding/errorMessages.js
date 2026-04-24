/**
 * errorMessages.js — Single source of truth for backend auth/onboarding
 * error-code → friendly copy mappings.
 *
 * Backend handlers return { code, message, attemptsRemaining? }. The `code`
 * is stable and machine-readable; the `message` is a developer-friendly
 * fallback. This map lets the UI show copy that is tuned for the funnel
 * (e.g. points the user at the Resend button for expired codes).
 */

export const OTP_ERROR_COPY = Object.freeze({
    OTP_EXPIRED_OR_MISSING: "That code has expired. Tap Resend to get a new one.",
    OTP_INVALID:            "That code doesn't match. Please check and try again.",
    OTP_RATE_LIMITED:       "Too many failed attempts. Request a new code and try again.",
    OTP_RESEND_RATE_LIMITED:"You've requested too many codes. Please wait an hour before trying again.",
});

export const AUTH_ERROR_COPY = Object.freeze({
    INVALID_CREDENTIALS:    "Email or password is incorrect.",
    ACCOUNT_LOCKED:         "Account temporarily locked after repeated failures. Try again later.",
    SESSION_EXPIRED:        "Your session expired. Please sign in again.",
    EMAIL_NOT_VERIFIED:     "Please verify your email before signing in.",
});

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

/**
 * Resolve a friendly message from a backend error payload.
 * @param {object} payload — axios err.response.data (or thrown object).
 * @param {{ map?: object, fallback?: string }} [opts]
 */
export function resolveErrorMessage(payload, opts = {}) {
    const { map = { ...OTP_ERROR_COPY, ...AUTH_ERROR_COPY }, fallback = DEFAULT_FALLBACK } = opts;
    if (!payload) return fallback;

    const code = payload.code || payload.errorCode;
    if (code && map[code]) {
        if (code === "OTP_INVALID" && payload.attemptsRemaining != null) {
            return `${map[code]} ${payload.attemptsRemaining} attempts remaining.`;
        }
        return map[code];
    }
    return payload.message || fallback;
}

export default { OTP_ERROR_COPY, AUTH_ERROR_COPY, resolveErrorMessage };
