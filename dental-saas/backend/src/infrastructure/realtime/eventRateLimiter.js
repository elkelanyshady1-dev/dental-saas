/**
 * eventRateLimiter.js — Real-Time Event Flood Protection (R4)
 * ═══════════════════════════════════════════════════════════════
 *
 * PLANE:     Organization only
 * PURPOSE:   Prevent event storms, infinite loops, and DoS via rapid socket emissions
 *
 * STRATEGY:
 *   Sliding-window rate limit per (orgId + event) key.
 *   If the same event is emitted to the same org faster than the interval,
 *   the emission is suppressed and a warning is logged.
 *
 * TUNING:
 *   DEFAULT_INTERVAL_MS = 500ms per (org+event)
 *   Adjust per-event via overrides if needed.
 *
 * MEMORY MANAGEMENT:
 *   Auto-cleanup via periodic sweep (every 60s) to prevent unbounded Map growth.
 *
 * @module infrastructure/realtime/eventRateLimiter
 */

"use strict";

const logger = require("../../utils/logger");

// ── Configuration ─────────────────────────────────────────────
const DEFAULT_INTERVAL_MS = 500;   // Min time between identical emissions per org
const CLEANUP_INTERVAL_MS = 60000; // Sweep stale entries every 60s
const MAX_AGE_MS = 120000;         // Remove entries older than 2 minutes

// ── State ─────────────────────────────────────────────────────
const _lastEmit = new Map();       // Key: "orgId:event" → Number (timestamp)
const _suppressedCounts = new Map(); // Key: "orgId:event" → Number (count)

// ── Per-event interval overrides ──────────────────────────────
// Some events naturally fire more often (typing indicators, etc.)
// Add overrides here to widen/narrow the window.
const EVENT_INTERVALS = {
    // "typing.start.v1": 100,       // Typing events can fire faster
    // "audit.event.v1": 200,        // Audit events may be bursty
};

/**
 * canEmit
 *
 * Returns true if the event is allowed to fire (not rate-limited).
 * Returns false if the same (orgId+event) fired within the interval.
 *
 * @param {string} orgId    — Organization ID
 * @param {string} event    — Versioned event name
 * @param {number} [intervalMs] — Custom interval override
 * @returns {boolean}
 */
function canEmit(orgId, event, intervalMs) {
    const key = `${orgId}:${event}`;
    const now = Date.now();
    const interval = intervalMs || EVENT_INTERVALS[event] || DEFAULT_INTERVAL_MS;
    const last = _lastEmit.get(key) || 0;

    if (now - last < interval) {
        // Track suppression count for observability
        _suppressedCounts.set(key, (_suppressedCounts.get(key) || 0) + 1);

        // Log periodically (not every suppression — would be its own flood)
        const count = _suppressedCounts.get(key);
        if (count === 1 || count % 50 === 0) {
            logger.warn(
                { event, orgId, suppressedCount: count, intervalMs: interval },
                "[Socket:RateLimit] Event suppressed — too frequent"
            );
        }

        return false;
    }

    _lastEmit.set(key, now);
    // Reset suppression counter on successful emit
    _suppressedCounts.delete(key);
    return true;
}

/**
 * getSuppressionStats
 *
 * Returns current suppression statistics. Useful for observability endpoints.
 *
 * @returns {{ activeKeys: number, totalSuppressed: number, details: Array }}
 */
function getSuppressionStats() {
    const details = [];
    let totalSuppressed = 0;

    for (const [key, count] of _suppressedCounts.entries()) {
        details.push({ key, count });
        totalSuppressed += count;
    }

    return {
        activeKeys: _lastEmit.size,
        totalSuppressed,
        details,
    };
}

// ── Periodic Cleanup ──────────────────────────────────────────
// Prevents unbounded Map growth from dead org+event combos.
// ALLOWED_POLLING: CLEANUP
const _cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, timestamp] of _lastEmit.entries()) {
        if (now - timestamp > MAX_AGE_MS) {
            _lastEmit.delete(key);
            _suppressedCounts.delete(key);
            cleaned++;
        }
    }

    if (cleaned > 0) {
        logger.debug({ cleaned, remaining: _lastEmit.size }, "[Socket:RateLimit] Cleanup sweep");
    }
}, CLEANUP_INTERVAL_MS);

// Don't block process exit
if (_cleanupInterval.unref) {
    _cleanupInterval.unref();
}

module.exports = {
    canEmit,
    getSuppressionStats,
    DEFAULT_INTERVAL_MS,
};
