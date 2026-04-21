/**
 * securityCache.js — Security Control Center Cache Facade
 * v2.0 — Phase 6 cleanup (Redis backing removed)
 *
 * Previously a Redis cache with graceful degradation. Redis was removed
 * in Phase 6, and no in-process cache replacement was added — every
 * security endpoint now reads directly from Mongo on each request. The
 * cost is acceptable because the security-dashboard endpoints are
 * rarely hit, and the queries already project narrow indexed slices.
 *
 * This file remains as a no-op facade so callers (security controllers,
 * policy-change listeners) don't need to rewire. Every function has the
 * same shape as before; the implementations are pass-throughs:
 *   - getCache()       → always returns null (miss → caller reads DB)
 *   - setCache()       → no-op
 *   - invalidate*()    → no-op
 *   - on*Change()      → no-op (listeners still call these; we just
 *                        don't need to do anything here)
 *
 * If caching becomes a hot-path concern again, swap the implementation
 * for lru-cache (per-process) without touching any caller.
 *
 * PLANE: Org only (keys namespaced by organizationId).
 */

"use strict";

// ─── TTL Constants (kept for caller API stability) ─────────────────────────

const TTL = {
    OVERVIEW:  30,
    COVERAGE:  300,
    POLICIES:  300,
    LOGS:      10,
    FIELDS:    300,
    MATRIX:    300,
};

// ─── Key Builders (kept for caller API stability) ──────────────────────────

function overviewKey(orgId) { return `security:overview:${orgId}`; }
function coverageKey(orgId) { return `security:coverage:${orgId}`; }
function policiesKey()      { return `security:policies`; }
function fieldsKey()        { return `security:fields`; }
function matrixKey()        { return `security:matrix`; }
function logsKey(orgId, params = {}) {
    const { page = 1, limit = 25, result, search, action, entityType, startDate, endDate } = params;
    const parts = [orgId, page, limit, result || "_", search || "_", action || "_", entityType || "_", startDate || "_", endDate || "_"];
    return `security:logs:${parts.join(":")}`;
}

// ─── Core Operations (no-ops post-Phase-6) ─────────────────────────────────

// Returns null so callers fall through to their DB read path.
async function getCache(/* key */) {
    return null;
}

async function setCache(/* key, value, ttl */) {
    // no-op
}

async function invalidate(/* ...keys */) {
    // no-op
}

async function invalidateOrg(/* orgId */) {
    // no-op
}

// ─── Event-Driven Invalidation Hooks (kept for listener API) ──────────────
// Services call these when underlying data changes so the cache can
// evict stale entries. With the cache gone these are no-ops, but the
// listeners still fire them — no caller change required.

async function onPolicyChange(/* orgId */) {
    // no-op
}

async function onFieldChange(/* orgId */) {
    // no-op
}

async function onRoleChange(/* orgId */) {
    // no-op
}

module.exports = {
    getCache,
    setCache,
    invalidate,
    invalidateOrg,
    onPolicyChange,
    onFieldChange,
    onRoleChange,
    TTL,
    keys: {
        overview: overviewKey,
        coverage: coverageKey,
        policies: policiesKey,
        fields: fieldsKey,
        matrix: matrixKey,
        logs: logsKey,
    },
};
