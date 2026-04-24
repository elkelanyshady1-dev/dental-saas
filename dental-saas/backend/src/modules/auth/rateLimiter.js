"use strict";

/**
 * rateLimiter.js
 * DB-backed rate limiter for auth-critical endpoints.
 *
 * Provides per-identifier sliding-window limits without Redis.
 * Uses MongoDB atomics ($inc, upsert) — safe under concurrency.
 *
 * Usage:
 *   const { checkRateLimit } = require("./rateLimiter");
 *
 *   // In OTP handler:
 *   await checkRateLimit("otp", email, { maxAttempts: 3, windowMs: 5 * 60 * 1000 });
 *
 *   // In magic link handler:
 *   await checkRateLimit("magic", email, { maxAttempts: 5, windowMs: 10 * 60 * 1000 });
 *
 *   // In password reset handler:
 *   await checkRateLimit("reset", email, { maxAttempts: 3, windowMs: 10 * 60 * 1000 });
 *
 * Throws 429 with structured error if limit exceeded.
 */

const getSharedModel = require("@core/db/getSharedModel");
const RateLimitEntryDef = require("./rateLimiter.model");
let _RateLimitEntry_cache = null;
function RateLimitEntry() {
    return _RateLimitEntry_cache || (_RateLimitEntry_cache = getSharedModel(RateLimitEntryDef));
}
const logger = require("@utils/logger");

// ── Default limits per action type ───────────────────────────────────────────
const DEFAULT_LIMITS = {
    otp:   { maxAttempts: 3, windowMs: 5 * 60 * 1000 },    // 3 per 5 min
    magic: { maxAttempts: 5, windowMs: 10 * 60 * 1000 },   // 5 per 10 min
    reset: { maxAttempts: 3, windowMs: 10 * 60 * 1000 },   // 3 per 10 min
};

/**
 * checkRateLimit
 * Enforces per-identifier rate limiting for auth flows.
 *
 * @param {string} action     — Action type ("otp" | "magic" | "reset")
 * @param {string} identifier — Email, phone, or IP
 * @param {{ maxAttempts?: number, windowMs?: number }} [overrides]
 * @throws {Error} 429 if rate limit exceeded
 */
async function checkRateLimit(action, identifier, overrides = {}) {
    const { maxAttempts, windowMs } = {
        ...DEFAULT_LIMITS[action],
        ...overrides,
    };

    if (!maxAttempts || !windowMs) {
        throw new Error(`[RateLimiter] Unknown action type: "${action}"`);
    }

    const key = `${action}:${identifier.toLowerCase().trim()}`;
    const now = new Date();
    const windowStart = new Date(now.getTime() - windowMs);

    // Try to find an active entry within the current window
    const entry = await RateLimitEntry().findOne({
        key,
        windowStart: { $gte: windowStart },
    });

    if (entry) {
        if (entry.count >= maxAttempts) {
            const retryAfterMs = entry.windowStart.getTime() + windowMs - now.getTime();
            const retryAfterSec = Math.ceil(retryAfterMs / 1000);

            logger.warn(
                { action, identifier: _mask(identifier), count: entry.count, retryAfterSec },
                "[RateLimiter] Rate limit exceeded"
            );

            const err = new Error(
                `Too many ${action} requests. Please wait ${retryAfterSec} seconds before trying again.`
            );
            err.statusCode = 429;
            err.errorCode = "RATE_LIMIT_EXCEEDED";
            err.retryAfterSec = retryAfterSec;
            throw err;
        }

        // Increment count atomically
        await RateLimitEntry().updateOne({ _id: entry._id }, { $inc: { count: 1 } });
    } else {
        // Start a new window — upsert to handle race conditions
        try {
            await RateLimitEntry().findOneAndUpdate(
                { key },
                {
                    $set: {
                        count: 1,
                        windowStart: now,
                        expiresAt: new Date(now.getTime() + windowMs + 60_000), // TTL = window + 1 min buffer
                    },
                },
                { upsert: true, new: true }
            );
        } catch (err) {
            // Duplicate key on concurrent upsert — benign, ignore
            if (err.code !== 11000) throw err;
        }
    }
}

/**
 * resetRateLimit — Clear all rate limit entries for a given key.
 * Useful after successful verification (e.g. after OTP verify succeeds,
 * clear the otp rate limit for that email).
 *
 * @param {string} action
 * @param {string} identifier
 */
async function resetRateLimit(action, identifier) {
    const key = `${action}:${identifier.toLowerCase().trim()}`;
    await RateLimitEntry().deleteMany({ key });
}

// ── Internal helpers ─────────────────────────────────────────────────────────
function _mask(identifier) {
    if (identifier.includes("@")) {
        const [local, domain] = identifier.split("@");
        return `${local.slice(0, 2)}***@${domain}`;
    }
    // Phone: mask all but last 2
    return identifier.slice(0, -2).replace(/\d/g, "*") + identifier.slice(-2);
}

module.exports = { checkRateLimit, resetRateLimit, DEFAULT_LIMITS };
