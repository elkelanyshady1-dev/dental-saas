/**
 * DistributedLock.js
 * Phase B — Mongo-backed distributed coordination (multi-instance safe).
 *
 * Replaces the former Redis-backed implementation (ioredis was removed in
 * Phase 6) and the Phase 6.1 in-process EventEmitter shim that worked only
 * inside a single Node process. This version uses MongoDB exclusively and
 * is safe across horizontally-scaled replicas — both in-process and cross-
 * process acquire/release collapse to the same documents in the same
 * collection, so the atomic findOneAndUpdate is the single source of truth.
 *
 * API (preserved verbatim — callers must not be touched):
 *   acquire(key, ttlMs)          → token string on success, null on contention
 *   release(key, token)          → boolean (true = released, false = no-op)
 *   publish(channel, payload)    → number (dispatch count, best-effort)
 *   subscribeWithTimeout(channel, timeoutMs)
 *                                → payload | null (null on timeout)
 *
 * Semantics:
 *   - acquire is compare-and-swap: stale or absent → take with an opaque
 *     token; fresh → null. Concurrent callers who race on the same key
 *     serialize on the unique index — at most one wins the lock.
 *   - release is token-verified (matches the Redis Lua compare-and-delete).
 *     A stale or spoofed token cannot free a lock it doesn't own.
 *   - publish writes a DistributedEvent row with 60s TTL. Any instance
 *     calling subscribeWithTimeout on the same channel that runs during
 *     that window sees it once.
 *   - subscribeWithTimeout polls (200 ms) until the timeout. Not the most
 *     efficient long-term approach — Change Streams are the intended
 *     follow-up — but it's simple, bounded, and works under mixed-version
 *     rollouts where some instances may not yet have Change Streams
 *     support.
 *
 * Boot order:
 *   The schema and model are registered at require() time. Mongoose doesn't
 *   need an active connection to register a model — actual operations
 *   (findOneAndUpdate, create, findOne) are deferred until a caller invokes
 *   one of these methods, which happens from request handlers after the
 *   DB is up. No module-level side effects block boot.
 *
 * PLANE: Infrastructure / shared utility. Not tied to any one plane.
 */

"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");
const logger = require("./logger");

// ─── Schemas ─────────────────────────────────────────────────────────────────
// Inlined because they're implementation detail of this utility — no other
// caller should touch these collections directly. If that assumption changes,
// extract to src/shared/models/ at that time.

const lockSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true },
        token: { type: String, required: true },
        expiresAt: { type: Date, required: true },
    },
    { versionKey: false, timestamps: false }
);

// TTL index: Mongo auto-removes documents past expiresAt. expireAfterSeconds:0
// means "remove as soon as expiresAt < now" (the sweep runs every ~60s by
// default, so a released-but-not-deleted row survives briefly — that's fine
// because acquire() already reclaims stale locks via the filter below).
lockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const DistributedLockModel =
    mongoose.models.DistributedLock ||
    mongoose.model("DistributedLock", lockSchema);

const eventSchema = new mongoose.Schema(
    {
        channel: { type: String, required: true },
        // Mixed because callers pass whatever they want (strings, JSON blobs,
        // small objects). Kept permissive to preserve API — we do NOT parse
        // or validate, the same way Redis publish/subscribe didn't.
        payload: { type: mongoose.Schema.Types.Mixed },
        createdAt: { type: Date, default: Date.now, required: true },
        expiresAt: { type: Date, required: true },
    },
    { versionKey: false, timestamps: false }
);

// Hot-path index for subscribeWithTimeout's filter
// `{ channel, createdAt: { $gte: subscribeStart } }`.
eventSchema.index({ channel: 1, createdAt: 1 });
eventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const DistributedEventModel =
    mongoose.models.DistributedEvent ||
    mongoose.model("DistributedEvent", eventSchema);

// ─── Config ──────────────────────────────────────────────────────────────────

// Default TTL for publish() events. Consumers that haven't polled within the
// window will never see the event — same trade-off as the old Redis pub/sub
// where late subscribers missed messages entirely.
const EVENT_TTL_MS = 60 * 1000;

// subscribeWithTimeout poll cadence. 200 ms balances latency against DB load:
// at 10 concurrent subscribers per instance this is 50 qps — negligible.
const SUBSCRIBE_POLL_INTERVAL_MS = 200;

function _instanceId() {
    return global.INSTANCE_ID || "unknown-instance";
}

function _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * acquire
 * Attempts to take the lock for `key`, valid for `ttlMs` milliseconds.
 *
 * Implementation: single findOneAndUpdate with upsert. The filter matches
 * when no lock exists OR the current lock is expired. The $set writes our
 * token and a fresh expiresAt. `new: true` returns the updated document so
 * we can verify the token we read back is ours.
 *
 * Concurrent callers racing on the same key serialize at the document level
 * inside Mongo. The winner's $set runs first; the loser's filter no longer
 * matches (lock is now fresh, not expired) and upsert trips the unique
 * index → E11000 → null return.
 *
 * @param   {string} key
 * @param   {number} [ttlMs=15000]
 * @returns {Promise<string|null>} opaque token on success, null on contention
 */
async function acquire(key, ttlMs = 15000) {
    const token = crypto.randomBytes(16).toString("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    try {
        const lock = await DistributedLockModel.findOneAndUpdate(
            {
                key,
                $or: [
                    { expiresAt: { $lt: now } },
                    { expiresAt: { $exists: false } },
                ],
            },
            {
                $set: { key, token, expiresAt },
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
            }
        );

        // Defensive — with `new: true` after a successful write this should
        // always be our token. If it isn't, someone else beat us to the write
        // and our update was applied to a different document state than
        // expected; treat as contention.
        if (!lock || lock.token !== token) {
            return null;
        }

        logger.debug(
            { event: "LOCK_ACQUIRE", key, instanceId: _instanceId(), ttlMs },
            "[DistributedLock] acquired"
        );
        return token;
    } catch (err) {
        if (err && err.code === 11000) {
            // Duplicate key — a fresh (non-stale) lock exists. This is the
            // normal contention path and MUST NOT log at error level.
            logger.debug(
                { event: "LOCK_CONTENTION", key, instanceId: _instanceId() },
                "[DistributedLock] contention — lock held"
            );
            return null;
        }
        logger.error(
            { event: "LOCK_ACQUIRE_FAILED", key, err: err.message },
            "[DistributedLock] acquire failed"
        );
        return null;
    }
}

/**
 * release
 * Releases the lock for `key` ONLY if `token` matches the current holder.
 * Matches the Redis Lua "compare and delete" semantics so a stale token
 * can't free someone else's lock.
 *
 * @param   {string} key
 * @param   {string} token
 * @returns {Promise<boolean>} true if released, false if token mismatch /
 *                             already expired / not held
 */
async function release(key, token) {
    if (!token) return false;

    try {
        const result = await DistributedLockModel.deleteOne({ key, token });
        const released = result.deletedCount === 1;
        if (released) {
            logger.debug(
                { event: "LOCK_RELEASE", key, instanceId: _instanceId() },
                "[DistributedLock] released"
            );
        } else {
            // Not fatal — the TTL index (or another release) already removed
            // the row, or the caller passed a stale token.
            logger.warn(
                { event: "LOCK_RELEASE_MISMATCH", key, instanceId: _instanceId() },
                "[DistributedLock] release() no-op — token mismatch or already released"
            );
        }
        return released;
    } catch (err) {
        logger.error(
            { event: "LOCK_RELEASE_FAILED", key, err: err.message },
            "[DistributedLock] release failed"
        );
        return false;
    }
}

/**
 * publish
 * Writes a DistributedEvent row. Consumers calling subscribeWithTimeout on
 * the same channel within EVENT_TTL_MS will observe it.
 *
 * @param   {string} channel
 * @param   {string|object|Buffer} payload
 * @returns {Promise<number>}  — dispatch count (best-effort; we write one
 *                               row, consumers observe independently)
 */
async function publish(channel, payload) {
    try {
        await DistributedEventModel.create({
            channel,
            payload,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + EVENT_TTL_MS),
        });
        logger.debug(
            { event: "DIST_EVENT_PUBLISH", channel, instanceId: _instanceId() },
            "[DistributedLock] publish"
        );
        return 1;
    } catch (err) {
        logger.error(
            { event: "DIST_EVENT_PUBLISH_FAILED", channel, err: err.message },
            "[DistributedLock] publish failed"
        );
        return 0;
    }
}

/**
 * subscribeWithTimeout
 * Polls for the next event on `channel` published AFTER this call started.
 * Resolves with the payload of the first matching row, or null on timeout.
 *
 * ⚠️ ONE-SHOT ONLY. This is NOT a queue or a stream — it returns the FIRST
 * matching event and stops. Do NOT use as a continuous consumer; looping on
 * it in a setInterval would duplicate every event back as many times as
 * instances subscribed. If you need durable multi-event fan-out, write to
 * the outbox and subscribe on eventBus instead.
 *
 * Intentionally NOT returning all matching events — this preserves the
 * single-message semantics of the old Redis subscriber, so callers like
 * platformSubscriptionService.waitForMutation get exactly the same shape
 * of result (payload-or-null).
 *
 * @param   {string} channel
 * @param   {number} [timeoutMs=10000]
 * @returns {Promise<any|null>} payload on match, null on timeout
 */
async function subscribeWithTimeout(channel, timeoutMs = 10000) {
    const startTime = new Date();
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        try {
            const event = await DistributedEventModel
                .findOne({
                    channel,
                    createdAt: { $gte: startTime },
                })
                .sort({ createdAt: 1 })
                .lean();

            if (event) {
                logger.debug(
                    {
                        event: "DIST_EVENT_CONSUME",
                        channel,
                        instanceId: _instanceId(),
                    },
                    "[DistributedLock] consumed"
                );
                return event.payload;
            }
        } catch (err) {
            // Swallow transient DB errors and keep polling until the deadline
            // — matches the old Redis version which resolved null on any
            // subscribe error rather than rejecting.
            logger.warn(
                { event: "DIST_EVENT_POLL_FAILED", channel, err: err.message },
                "[DistributedLock] subscribeWithTimeout poll error"
            );
        }

        // Sleep unless we'd overshoot the deadline.
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await _sleep(Math.min(SUBSCRIBE_POLL_INTERVAL_MS, remaining));
    }

    // Visibility: timeouts are a legitimate path (callers treat null as "fall
    // through to direct DB read"), but a sudden spike in timeouts usually
    // means a publisher crashed or a channel name typo — log at debug so ops
    // can correlate without drowning normal traffic.
    logger.debug(
        { event: "DIST_EVENT_TIMEOUT", channel, timeoutMs, instanceId: _instanceId() },
        "[DistributedLock] subscribeWithTimeout timed out"
    );
    return null;
}

module.exports = {
    acquire,
    release,
    publish,
    subscribeWithTimeout,
};
