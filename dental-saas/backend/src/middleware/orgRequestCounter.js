/**
 * orgRequestCounter.js — Per-org in-flight request counter
 *
 * Counts requests that have entered the org middleware chain and are
 * still being processed. Used by the downtime migration drain phase to
 * deterministically wait for in-flight requests to finish before
 * touching the source DB — replaces the blind `sleep(3000)` heuristic.
 *
 * Scope: per-process in-memory Map. In multi-instance deploys, each
 * instance maintains its own count; `maintenanceMode=true` on the
 * platform-side Organization doc prevents *new* requests from any
 * instance from entering (they're rejected at the maintenance guard),
 * so the counter only needs to drain THIS instance's in-flight work.
 *
 * Overhead: O(1) Map read/write per request. Safe under load.
 *
 * PLANE: Middleware (org chain).
 */

"use strict";

const counts = new Map(); // Map<orgId, number>

function _key(orgId) {
    return orgId ? String(orgId) : null;
}

function inc(orgId) {
    const k = _key(orgId);
    if (!k) return;
    counts.set(k, (counts.get(k) || 0) + 1);
}

function dec(orgId) {
    const k = _key(orgId);
    if (!k) return;
    const current = counts.get(k) || 0;
    if (current <= 1) counts.delete(k);
    else counts.set(k, current - 1);
}

function active(orgId) {
    const k = _key(orgId);
    if (!k) return 0;
    return counts.get(k) || 0;
}

/**
 * Wait until the in-flight count for `orgId` hits 0 OR the timeout
 * elapses. Returns { drained: true, waitedMs } on success or
 * { drained: false, remaining, waitedMs } on timeout (caller decides
 * whether to proceed anyway — typically yes, because maintenanceMode
 * is already true and stuck long-runners shouldn't block indefinitely).
 */
async function waitForDrain(orgId, { timeoutMs = 10_000, pollMs = 100 } = {}) {
    const startedAt = Date.now();
    let remaining = active(orgId);
    while (remaining > 0 && (Date.now() - startedAt) < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollMs));
        remaining = active(orgId);
    }
    return {
        drained: remaining === 0,
        remaining,
        waitedMs: Date.now() - startedAt,
    };
}

/**
 * Express middleware. Mounts on the org chain.
 * Increments on entry, decrements on response close (or error).
 */
function orgRequestCounter(req, res, next) {
    const orgId = req?.context?.organizationId || req?.context?.organization?._id;
    if (!orgId) return next();

    inc(orgId);
    let decremented = false;
    const done = () => {
        if (decremented) return;
        decremented = true;
        dec(orgId);
    };
    res.on("close", done);
    res.on("finish", done);
    next();
}

module.exports = orgRequestCounter;
module.exports.inc = inc;
module.exports.dec = dec;
module.exports.active = active;
module.exports.waitForDrain = waitForDrain;
module.exports._countsForTest = counts;
