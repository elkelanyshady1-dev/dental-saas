/**
 * analytics.js — Onboarding-funnel event tracker.
 *
 * A minimal, dependency-free dispatcher. Drops events to:
 *   1. window.dataLayer (if present — Google Tag Manager / Segment shim)
 *   2. window.plausible / posthog.capture / analytics.track (if present)
 *   3. console (dev-only)
 *
 * Every event carries a stable `sessionId` so funnel drop-off can be stitched
 * across steps without any PII. Keep payloads free of emails, phone numbers
 * and OTPs — track WHAT happened, not WHO did it.
 *
 * Usage:
 *   import { track, EVENTS } from "@/modules/onboarding/analytics";
 *   track(EVENTS.SIGNUP_STEP_VIEW, { step: "phoneOtp" });
 */

// ── Event catalog — one constant per funnel event ────────────────────────────
export const EVENTS = Object.freeze({
    // Funnel steps
    SIGNUP_STEP_VIEW:      "signup_step_view",
    SIGNUP_STEP_COMPLETE:  "signup_step_complete",
    SIGNUP_STEP_ERROR:     "signup_step_error",
    SIGNUP_COMPLETED:      "signup_completed",

    // OTP
    OTP_REQUESTED:         "otp_requested",
    OTP_SUBMITTED:         "otp_submitted",
    OTP_VERIFIED:          "otp_verified",
    OTP_FAILED:            "otp_failed",
    OTP_RESENT:            "otp_resent",
    OTP_RESEND_RATE_LIMITED: "otp_resend_rate_limited",

    // Profile
    PROFILE_VIEW:          "profile_view",
    PROFILE_COMPLETED:     "profile_completed",
    PROFILE_SKIPPED:       "profile_skipped",

    // Login
    LOGIN_VIEW:            "login_view",
    LOGIN_SUCCESS:         "login_success",
    LOGIN_FAILURE:         "login_failure",
    SESSION_EXPIRED:       "session_expired",
});

// ── Session ID (stable within the tab) ───────────────────────────────────────
const SESSION_KEY = "onboarding:sessionId";
function getSessionId() {
    try {
        let id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
            id = (typeof crypto !== "undefined" && crypto.randomUUID)
                ? crypto.randomUUID()
                : `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
    } catch {
        return "anonymous";
    }
}

// ── Payload sanitisation — strip common PII fields ───────────────────────────
const SENSITIVE_KEYS = new Set(["email", "phone", "phoneNumber", "otp", "password", "token", "pricingToken", "idempotencyKey"]);

function sanitize(payload) {
    if (!payload || typeof payload !== "object") return {};
    const out = {};
    for (const [k, v] of Object.entries(payload)) {
        if (SENSITIVE_KEYS.has(k)) continue;
        out[k] = typeof v === "object" ? sanitize(v) : v;
    }
    return out;
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
export function track(event, payload = {}) {
    const data = {
        event,
        ...sanitize(payload),
        sessionId: getSessionId(),
        ts: Date.now(),
    };

    // dataLayer (GTM / Segment shim)
    try {
        if (typeof window !== "undefined" && Array.isArray(window.dataLayer)) {
            window.dataLayer.push(data);
        }
    } catch { /* non-blocking */ }

    // Plausible / PostHog / generic
    try {
        if (typeof window !== "undefined") {
            if (typeof window.plausible === "function") {
                window.plausible(event, { props: sanitize(payload) });
            } else if (window.posthog && typeof window.posthog.capture === "function") {
                window.posthog.capture(event, sanitize(payload));
            } else if (window.analytics && typeof window.analytics.track === "function") {
                window.analytics.track(event, sanitize(payload));
            }
        }
    } catch { /* non-blocking */ }

    // Dev console — silent in prod. Vite swaps import.meta.env.DEV at build time.
    try {
        if (import.meta.env && import.meta.env.DEV) {
            // eslint-disable-next-line no-console
            console.debug("[analytics]", event, data);
        }
    } catch { /* non-blocking */ }
}

export default { track, EVENTS };
