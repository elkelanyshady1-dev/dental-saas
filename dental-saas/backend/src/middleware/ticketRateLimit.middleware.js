/**
 * ticketRateLimit.middleware.js — Ticket/message rate limiting (Plan E8)
 *
 * Two-axis fixed-window enforcement, in-memory per-process:
 *
 *   1. PER-USER (short window — burst control)
 *        - tickets:   5 per minute
 *        - messages:  20 per minute
 *
 *   2. PER-ORG (long window — daily cap)
 *        - tickets:   100 per rolling 24h (configurable via
 *                     TICKET_DAILY_CAP_PER_ORG)
 *
 * Implementation:
 *   - Two `lru-cache` instances (user window + org window). Counter is an
 *     integer keyed by `rl:ticket:{action}:user:{id}` / `rl:ticket:create:org:{id}`.
 *   - `updateAgeOnGet: false` so a read never extends the window.
 *   - `noUpdateTTL: true` when incrementing an existing key so subsequent
 *     writes within the same window don't slide the expiration forward.
 *     This preserves fixed-window semantics matching the previous Redis
 *     INCR+EXPIRE behavior.
 *   - 429 response carries `Retry-After` header + JSON body with
 *     { scope, limit, windowSeconds, retryAfter } so FE can disable the
 *     submit button until the window rolls over.
 *
 * Phase 6 note: Redis has been removed from the system. This limiter is
 * per-process; multi-instance deployments must re-introduce a shared
 * backend (see server.js:112 [LOCK_MODE] banner).
 *
 * Usage:
 *   router.post("/tickets",   ticketCreateRateLimit,  createTicketHandler);
 *   router.post("/messages",  ticketMessageRateLimit, addMessageHandler);
 *
 * Dev bypass: honored when `DEV_AUTH_MODE` is set, same as signup limiter.
 */

"use strict";

const { LRUCache } = require("lru-cache");
const logger = require("@utils/logger");

// ─── Configuration ───────────────────────────────────────────────────

const USER_TICKET_LIMIT = parseInt(process.env.TICKET_USER_LIMIT_PER_MIN, 10) || 5;
const USER_MESSAGE_LIMIT = parseInt(process.env.TICKET_MESSAGE_LIMIT_PER_MIN, 10) || 20;
const USER_WINDOW_SECONDS = 60;

const ORG_TICKET_DAILY_LIMIT = parseInt(process.env.TICKET_DAILY_CAP_PER_ORG, 10) || 100;
const ORG_WINDOW_SECONDS = 60 * 60 * 24;

// ─── In-memory counters (fixed window, primitive counts) ─────────────

const userCache = new LRUCache({
    max: 10_000,
    ttl: USER_WINDOW_SECONDS * 1000,
    updateAgeOnGet: false,
});

const orgCache = new LRUCache({
    max: 10_000,
    ttl: ORG_WINDOW_SECONDS * 1000,
    updateAgeOnGet: false,
});

/**
 * Atomically increment a counter in the given cache and return the new
 * count plus remaining TTL (in whole seconds). Node's single-threaded
 * event loop guarantees this block runs without interleaving, so the
 * `get → +1 → set` sequence is race-free in-process.
 *
 * @param {LRUCache} cache
 * @param {string}   key
 * @param {number}   windowSeconds — used only if the key is fresh
 */
function _incrementCounter(cache, key, windowSeconds) {
    const prev = cache.get(key) || 0;
    const count = prev + 1;
    cache.set(key, count, { noUpdateTTL: prev > 0 });

    const remainingMs = cache.getRemainingTTL(key);
    const remainingTtl = remainingMs > 0
        ? Math.ceil(remainingMs / 1000)
        : windowSeconds;

    return { count, remainingTtl };
}

// ─── 429 response helper ─────────────────────────────────────────────

function _reject(res, { scope, limit, windowSeconds, retryAfter, correlationId }) {
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({
        success: false,
        error: {
            code: "RATE_LIMITED",
            message: `Rate limit exceeded (${scope}). Try again in ${retryAfter}s.`,
            scope,
            limit,
            windowSeconds,
            retryAfter,
            correlationId: correlationId || null,
        },
    });
}

// ─── Core enforcer ───────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {"ticket_create"|"ticket_message"} opts.action
 * @param {number} opts.userLimit
 * @param {boolean} opts.enforceOrgDaily — whether to ALSO apply the per-org daily cap
 */
function _makeLimiter({ action, userLimit, enforceOrgDaily }) {
    return async function ticketRateLimit(req, res, next) {
        // Dev bypass mirrors signupRateLimit
        try {
            const { DEV_AUTH_MODE } = require("@config/authConfig");
            if (DEV_AUTH_MODE) return next();
        } catch (_) { /* config missing — proceed */ }

        const userId = req.user?._id?.toString?.() || req.context?.userId;
        const orgId = req.organizationId?.toString?.() || req.context?.organizationId;

        if (!userId) {
            // Without identity we cannot rate-limit safely — let downstream auth handle it.
            return next();
        }

        const userKey = `rl:ticket:${action}:user:${userId}`;

        // 1. Per-user short window
        const userResult = _incrementCounter(userCache, userKey, USER_WINDOW_SECONDS);
        if (userResult.count > userLimit) {
            logger.warn(
                { userId, action, count: userResult.count, limit: userLimit },
                "[ticketRateLimit] per-user limit exceeded"
            );
            return _reject(res, {
                scope: "user",
                limit: userLimit,
                windowSeconds: USER_WINDOW_SECONDS,
                retryAfter: userResult.remainingTtl,
                correlationId: req.correlationId,
            });
        }

        // 2. Per-org daily cap (tickets only)
        if (enforceOrgDaily && orgId) {
            const orgKey = `rl:ticket:create:org:${orgId}`;
            const orgResult = _incrementCounter(orgCache, orgKey, ORG_WINDOW_SECONDS);
            if (orgResult.count > ORG_TICKET_DAILY_LIMIT) {
                logger.warn(
                    { orgId, count: orgResult.count, limit: ORG_TICKET_DAILY_LIMIT },
                    "[ticketRateLimit] per-org daily cap exceeded"
                );
                return _reject(res, {
                    scope: "org_daily",
                    limit: ORG_TICKET_DAILY_LIMIT,
                    windowSeconds: ORG_WINDOW_SECONDS,
                    retryAfter: orgResult.remainingTtl,
                    correlationId: req.correlationId,
                });
            }
        }

        return next();
    };
}

// ─── Exported middleware instances ───────────────────────────────────

const ticketCreateRateLimit = _makeLimiter({
    action: "ticket_create",
    userLimit: USER_TICKET_LIMIT,
    enforceOrgDaily: true,
});

const ticketMessageRateLimit = _makeLimiter({
    action: "ticket_message",
    userLimit: USER_MESSAGE_LIMIT,
    enforceOrgDaily: false,
});

module.exports = {
    ticketCreateRateLimit,
    ticketMessageRateLimit,
    // Exposed for tests + dynamic overrides
    _config: {
        USER_TICKET_LIMIT,
        USER_MESSAGE_LIMIT,
        USER_WINDOW_SECONDS,
        ORG_TICKET_DAILY_LIMIT,
        ORG_WINDOW_SECONDS,
    },
    _incrementCounter,
    _reset: () => {
        userCache.clear();
        orgCache.clear();
    },
    _caches: {
        user: userCache,
        org: orgCache,
    },
};
