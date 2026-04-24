/**
 * withRetry.js — Network resilience wrapper for onboarding calls.
 *
 * Behaviour:
 *   - Retries on transient errors (network error, 5xx, timeout).
 *   - Exponential backoff, capped.
 *   - Re-throws 4xx (client-side) immediately — these won't change on retry
 *     (e.g. OTP_INVALID, validation error) and the caller owns the UX.
 *   - Emits an optional toast on the final failure. Never uses alert().
 *
 * Intentional scope:
 *   Only for IDEMPOTENT calls (OTP verify, OTP resend, plan fetch).
 *   Do NOT wrap non-idempotent mutations (e.g. signup submit) without an
 *   Idempotency-Key header — a retry after a server-seen request can create
 *   duplicates. SignupPage already passes Idempotency-Key, so it's safe.
 */
import { showToast } from "@/utils/toast";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 400;   // 0.4s, 0.8s, 1.6s …
const DEFAULT_BACKOFF_CAP_MS = 3000;

function isTransient(err) {
    // Axios: no response → network/timeout → transient
    if (err && !err.response) return true;
    const status = err?.response?.status;
    // 5xx and 408 (request timeout) / 429 with Retry-After → transient
    if (status >= 500 && status < 600) return true;
    if (status === 408) return true;
    return false;
}

/**
 * @param {() => Promise<any>} fn                 - Call to invoke.
 * @param {object}             [opts]
 * @param {number}             [opts.maxAttempts] - Default 3.
 * @param {number}             [opts.baseBackoffMs]
 * @param {string}             [opts.toastOnFail] - Message to show if all retries fail (falsy to suppress).
 * @param {(err, attempt) => boolean} [opts.shouldRetry] - Custom predicate; default = isTransient.
 */
export async function withRetry(fn, opts = {}) {
    const {
        maxAttempts = DEFAULT_MAX_ATTEMPTS,
        baseBackoffMs = DEFAULT_BASE_BACKOFF_MS,
        toastOnFail = "Network hiccup — please try again.",
        shouldRetry = isTransient,
    } = opts;

    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            // Client errors (400/401/403/404/422) = user-correctable, don't retry.
            if (!shouldRetry(err, attempt)) throw err;
            if (attempt >= maxAttempts) break;
            const delay = Math.min(baseBackoffMs * 2 ** (attempt - 1), DEFAULT_BACKOFF_CAP_MS);
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    if (toastOnFail) showToast.error(toastOnFail);
    throw lastErr;
}

export default withRetry;
