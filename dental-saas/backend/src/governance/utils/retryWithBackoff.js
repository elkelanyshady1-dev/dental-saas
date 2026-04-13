require("module-alias/register");
/**
 * retryWithBackoff.js
 * Phase 22 — Shared Retry Utility for Governance Validators
 *
 * Exponential backoff with attempt metadata collection.
 * Used by runtime-integrity and auth-flow validators to
 * distinguish INFRASTRUCTURE_UNAVAILABLE from FAILED_FUNCTIONAL.
 *
 * No external dependencies.
 */

/**
 * Retry an async function with exponential backoff.
 *
 * @param {Function} fn - Async function to execute. Must return a value on success, throw on failure.
 * @param {Object}   opts
 * @param {number}   opts.retries - Max retry attempts (default 3)
 * @param {number}   opts.delay   - Base delay in ms (default 500)
 * @returns {{ success: boolean, result: any, attempts: Array }}
 */
async function retryWithBackoff(fn, { retries = 3, delay = 500 } = {}) {
    const attempts = [];

    for (let attempt = 1; attempt <= retries; attempt++) {
        const attemptStart = Date.now();
        try {
            const result = await fn();
            attempts.push({
                attemptNumber: attempt,
                errorCode: null,
                durationMs: Date.now() - attemptStart,
            });
            return { success: true, result, attempts };
        } catch (err) {
            attempts.push({
                attemptNumber: attempt,
                errorCode: err.code || err.message || "UNKNOWN",
                durationMs: Date.now() - attemptStart,
            });

            // Wait before next attempt (exponential: delay * attempt)
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, delay * attempt));
            }
        }
    }

    return { success: false, result: null, attempts };
}

module.exports = { retryWithBackoff };
