/**
 * securityCache.js — Security Control Center Redis Cache
 *
 * Provides tiered caching for security endpoints:
 *   - overview (30s TTL — includes live audit counts)
 *   - coverage (5min TTL — rarely changes at runtime)
 *   - policies (5min TTL — only changes on deploy)
 *   - logs (10s TTL — keyed by org + page + filters)
 *
 * Falls back gracefully when Redis is unavailable — endpoints
 * compute from DB directly (no error, just slower).
 *
 * PLANE: Org only (keys namespaced by organizationId).
 */

"use strict";

const logger = require("@utils/logger");

// ─── Redis Client (lazy, non-blocking) ────────────────────────────────────────

let redis;
let _hasRedis = false;

try {
    redis = require("@infra/redis/redisClient");
    if (redis) {
        _hasRedis = redis.status === "ready";
        redis.on("ready", () => { _hasRedis = true; });
        redis.on("error", () => { _hasRedis = false; });
        redis.on("close", () => { _hasRedis = false; });
    }
} catch {
    logger.warn("[SecurityCache] Redis unavailable — caching disabled");
}

// ─── TTL Constants ──────────────────────────────────────────────────────────

const TTL = {
    OVERVIEW:  30,    // 30 seconds — includes live counts
    COVERAGE:  300,   // 5 minutes — rarely changes
    POLICIES:  300,   // 5 minutes — only changes on deploy
    LOGS:      10,    // 10 seconds — keyed per page/filter
    FIELDS:    300,   // 5 minutes — config-level
    MATRIX:    300,   // 5 minutes — static structure
};

// ─── Key Builders ──────────────────────────────────────────────────────────

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

// ─── Core Operations ───────────────────────────────────────────────────────

/**
 * Get a cached value (JSON-parsed). Returns null on miss or Redis failure.
 */
async function getCache(key) {
    if (!_hasRedis) return null;
    try {
        const raw = await redis.get(key);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        logger.warn({ err: err.message, key }, "[SecurityCache] GET failed");
        return null;
    }
}

/**
 * Set a cached value with TTL. Swallows errors — never blocks the request.
 */
async function setCache(key, value, ttl) {
    if (!_hasRedis) return;
    try {
        await redis.set(key, JSON.stringify(value), "EX", ttl);
    } catch (err) {
        logger.warn({ err: err.message, key }, "[SecurityCache] SET failed");
    }
}

/**
 * Invalidate one or more cache keys. Fire-and-forget.
 */
async function invalidate(...keys) {
    if (!_hasRedis || keys.length === 0) return;
    try {
        await redis.del(...keys);
    } catch (err) {
        logger.warn({ err: err.message }, "[SecurityCache] DEL failed");
    }
}

/**
 * Invalidate ALL security cache keys for an organization.
 * Uses SCAN to find matching keys (safe for production — no KEYS command).
 */
async function invalidateOrg(orgId) {
    if (!_hasRedis) return;
    try {
        const pattern = `security:*${orgId}*`;
        let cursor = "0";
        const keysToDelete = [];
        do {
            const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
            cursor = nextCursor;
            keysToDelete.push(...keys);
        } while (cursor !== "0");

        // Also invalidate global keys
        keysToDelete.push(policiesKey(), fieldsKey(), matrixKey());

        if (keysToDelete.length > 0) {
            await redis.del(...keysToDelete);
        }
    } catch (err) {
        logger.warn({ err: err.message, orgId }, "[SecurityCache] invalidateOrg failed");
    }
}

// ─── Phase 3: Event-Driven Cache Invalidation ──────────────────────────────
// Semantic invalidation hooks — services call these when data changes.
// No need for callers to know internal cache key structures.

/**
 * Called when policy definitions change.
 * Invalidates: policies, coverage, overview (all orgs).
 * @param {string} [orgId] — optional org scope
 */
async function onPolicyChange(orgId) {
    if (!_hasRedis) return;
    try {
        const keysToDelete = [policiesKey(), matrixKey()];
        if (orgId) {
            keysToDelete.push(overviewKey(orgId), coverageKey(orgId));
        }
        await invalidate(...keysToDelete);
        logger.info({ orgId }, "[SecurityCache] Policy change — cache invalidated");
    } catch (err) {
        logger.warn({ err: err.message }, "[SecurityCache] onPolicyChange failed");
    }
}

/**
 * Called when field access rules change.
 * Invalidates: fields, overview (field coverage is part of overview KPIs).
 * @param {string} [orgId] — optional org scope
 */
async function onFieldChange(orgId) {
    if (!_hasRedis) return;
    try {
        const keysToDelete = [fieldsKey()];
        if (orgId) {
            keysToDelete.push(overviewKey(orgId));
        }
        await invalidate(...keysToDelete);
        logger.info({ orgId }, "[SecurityCache] Field change — cache invalidated");
    } catch (err) {
        logger.warn({ err: err.message }, "[SecurityCache] onFieldChange failed");
    }
}

/**
 * Called when role/permission assignments change.
 * Invalidates: overview, coverage, matrix (role-permission relationships).
 * @param {string} [orgId] — optional org scope
 */
async function onRoleChange(orgId) {
    if (!_hasRedis) return;
    try {
        const keysToDelete = [matrixKey()];
        if (orgId) {
            keysToDelete.push(overviewKey(orgId), coverageKey(orgId));
        }
        await invalidate(...keysToDelete);
        logger.info({ orgId }, "[SecurityCache] Role change — cache invalidated");
    } catch (err) {
        logger.warn({ err: err.message }, "[SecurityCache] onRoleChange failed");
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

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
