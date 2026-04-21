/**
 * signupRateLimit.middleware.js
 * Public Plane — Signup Abuse Protection
 * v25.0 — Phase 6 cleanup (Redis path removed)
 *
 * PURPOSE:
 * Rate-limits signup attempts to prevent automated abuse.
 * Single-instance per-process counters (in-memory Map) — Redis was
 * removed in Phase 6. For multi-instance deployments the counter is
 * per-process, so an attacker distributing requests across instances
 * gets N× the limit; this is an acceptable degradation at the signup
 * rate vs. a DB round-trip per request.
 *
 * LIMITS:
 *   - 5 signup attempts per IP per hour
 *   - 3 OTP verification attempts per phone per 10 minutes
 *     (already handled by VerificationEngine.verifyToken() rate limiting, this is the IP layer)
 *
 * DESIGN:
 *   - Non-blocking: counter failures fall through (signup proceeds)
 *   - Transparent: returns 429 with human-readable message
 *   - Does not affect legitimate users (generous limits)
 *
 * PLANE: Public (no auth required)
 */

"use strict";

const logger = require("@utils/logger");
const { normalizeIP } = require("../core/security/ipNormalizer");

// ─── In-memory counter store ──────────────────────────────────────────────────
const _memCounters = new Map();
// ALLOWED_POLLING: CLEANUP
const _memCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, data] of _memCounters) {
        if (data.expiresAt < now) _memCounters.delete(key);
    }
}, 60_000);
_memCleanup.unref();

// ─── Configuration ────────────────────────────────────────────────────────────
const SIGNUP_MAX_PER_IP = parseInt(process.env.SIGNUP_RATE_LIMIT_PER_IP, 10) || 5;
const SIGNUP_WINDOW_SECONDS = parseInt(process.env.SIGNUP_RATE_WINDOW_SECONDS, 10) || 3600; // 1 hour

/**
 * _incrementCounter
 * Increments the counter for a given key. Returns the current count.
 *
 * @param {string} key
 * @param {number} ttlSeconds
 * @returns {Promise<number>} Current count after increment
 */
async function _incrementCounter(key, ttlSeconds) {
    const now = Date.now();
    const existing = _memCounters.get(key);
    if (existing && existing.expiresAt > now) {
        existing.count++;
        return existing.count;
    }

    _memCounters.set(key, { count: 1, expiresAt: now + (ttlSeconds * 1000) });
    return 1;
}

/**
 * signupRateLimit
 * Express middleware that enforces per-IP signup rate limits.
 */
function signupRateLimit(req, res, next) {
    // Dev bypass
    const { DEV_AUTH_MODE } = require("@config/authConfig");
    if (DEV_AUTH_MODE) return next();

    const ip = normalizeIP(req.ip || req.connection.remoteAddress);
    const key = `signup_rate:${ip}`;

    _incrementCounter(key, SIGNUP_WINDOW_SECONDS)
        .then(count => {
            if (count > SIGNUP_MAX_PER_IP) {
                logger.warn(
                    { ip, count, max: SIGNUP_MAX_PER_IP },
                    "[SignupRateLimit] Rate limit exceeded"
                );
                return res.status(429).json({
                    success: false,
                    message: "Too many signup attempts. Please try again later.",
                    retryAfterSeconds: SIGNUP_WINDOW_SECONDS,
                });
            }
            next();
        })
        .catch(err => {
            // Rate limit failures must NEVER block signups
            logger.error({ err: err.message }, "[SignupRateLimit] Counter failed — allowing request");
            next();
        });
}

module.exports = { signupRateLimit };
