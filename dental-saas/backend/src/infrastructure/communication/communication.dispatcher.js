/**
 * communication.dispatcher.js
 * Hybrid Execution Model — routing entry point.
 *
 * Decides per-message whether to deliver synchronously (user-waiting flows
 * like OTP / magic link / password reset) or asynchronously (system flows
 * like bulk notifications).
 *
 * @per-plane Infrastructure
 *
 * ⚠️ Phase 1: The idempotency cache is an in-memory Map — it is NOT safe
 * across multiple instances. A late-arriving retry on a different node can
 * still produce a duplicate send. Cross-process idempotency (Redis SETNX)
 * is planned for Phase 2. Provider-level idempotency tokens are the only
 * true at-most-once guarantee and belong with the adapter work.
 */

"use strict";

const logger = require("@utils/logger");
const config = require("@config/communication.config");
const { deliverSync } = require("./handlers/sync.handler");
const { deliverAsync } = require("./handlers/async.handler");

// ─── SYNC routing table ───────────────────────────────────────────────────────
// Membership is the single source of truth for "should go SYNC by default".
// Listeners/callers may override via options.hint.
const SYNC_TYPES = new Set([
    "OTP",
    "EMAIL_OTP",
    "PASSWORD_RESET",
    "MAGIC_LINK",
    "MAGIC_LOGIN",
]);

// ─── In-memory idempotency cache ──────────────────────────────────────────────
// Map<key, expiresAtMs>
const _idempotencyCache = new Map();

function _gcIdempotency() {
    const now = Date.now();
    for (const [k, exp] of _idempotencyCache) {
        if (exp <= now) _idempotencyCache.delete(k);
    }
}
// ALLOWED_POLLING: CLEANUP
const _gcTimer = setInterval(_gcIdempotency, 60_000);
if (_gcTimer.unref) _gcTimer.unref();

/**
 * Compute a stable idempotency key for a given send.
 * Subject fallback chain tolerates the common listener payload shapes:
 * userId → email → phone → to.
 */
function getIdempotencyKey({ channel, type, payload }) {
    const subject =
        payload?.userId ||
        payload?.email ||
        payload?.phone ||
        payload?.to ||
        null;
    if (!subject) return null;
    return `${channel}:${type}:${subject}`;
}

function _checkAndMarkIdempotent(key) {
    if (!key) return false;
    const now = Date.now();
    const existing = _idempotencyCache.get(key);
    if (existing && existing > now) return true;
    _idempotencyCache.set(key, now + config.IDEMPOTENCY_TTL_MS);
    return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * dispatch({ channel, type, payload }, options?)
 *
 * options.hint: "sync" | "async" — override routing table.
 *
 * Returns a provider/handler-shaped result. Callers SHOULD NOT branch on
 * the `mode` field — it is for observability only. The internal
 * `{ mode: "duplicate" }` value is an idempotency short-circuit and must
 * not be exposed to user-facing responses.
 */
async function dispatch({ channel, type, payload }, options = {}) {
    if (!channel || !type) {
        throw new Error("[dispatcher] channel and type are required");
    }

    const key = getIdempotencyKey({ channel, type, payload });
    if (_checkAndMarkIdempotent(key)) {
        logger.warn(
            { channel, type, key },
            "[dispatcher] Duplicate within idempotency window — suppressed"
        );
        return { mode: "duplicate", suppressed: true };
    }

    const hint = options.hint;
    const wantSync = hint === "sync" || (hint !== "async" && SYNC_TYPES.has(type));

    if (wantSync) {
        return deliverSync({ channel, type, payload });
    }
    return deliverAsync({ channel, type, payload });
}

module.exports = {
    dispatch,
    SYNC_TYPES,
    getIdempotencyKey,
    _idempotencyCache, // test hook
};
