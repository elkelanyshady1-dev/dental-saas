/**
 * entitlementCache.js — In-Process Entitlement Cache
 *
 * ── PROBLEM ───────────────────────────────────────────────────────────────────
 * resolveOrganizationEntitlements() runs on EVERY authenticated org request:
 *   - Loads PlanVersion from DB
 *   - Merges plan defaults with org-level overrides
 *   - Produces the same result for every request from the same org + plan version
 *
 * ── SOLUTION ──────────────────────────────────────────────────────────────────
 * TTL-based in-process cache keyed by orgId + planVersionId.
 * On cache hit: O(1) — return cached entitlements.
 * On cache miss: resolve, store, return.
 *
 * ── CACHE INVALIDATION ────────────────────────────────────────────────────────
 * TTL-based (default 60s). Also busted when:
 *   - Plan version changes (key includes planVersionId)
 *   - Explicit invalidateOrg() call (e.g., after add-on purchase)
 *
 * ── SAFETY ────────────────────────────────────────────────────────────────────
 * - Entries are deep-frozen to prevent mutation
 * - Max size enforced via LRU eviction
 * - Process-scoped (not shared across workers)
 *
 * PLANE: Org only.
 */

"use strict";

const MAX_SIZE = parseInt(process.env.ENTITLEMENT_CACHE_MAX_SIZE || "500", 10);
const DEFAULT_TTL_MS = parseInt(process.env.ENTITLEMENT_CACHE_TTL_MS || "60000", 10);

/** @type {Map<string, { value: Object, expiresAt: number }>} */
const _cache = new Map();

let _hits = 0;
let _misses = 0;

/**
 * Build cache key from orgId + planVersionId.
 * Returns null if either is missing (disables caching).
 */
function _buildKey(orgId, planVersionId) {
    if (!orgId || !planVersionId) return null;
    return `${String(orgId)}:${String(planVersionId)}`;
}

/**
 * Evict oldest entries when cache exceeds MAX_SIZE.
 */
function _evictIfNeeded() {
    if (_cache.size <= MAX_SIZE) return;
    const toDelete = Math.ceil(MAX_SIZE * 0.1);
    let deleted = 0;
    for (const key of _cache.keys()) {
        if (deleted >= toDelete) break;
        _cache.delete(key);
        deleted++;
    }
}

/**
 * Get cached entitlements.
 * @param {string} orgId
 * @param {string} planVersionId
 * @returns {Object|null} — null on cache miss or expired entry
 */
function get(orgId, planVersionId) {
    const key = _buildKey(orgId, planVersionId);
    if (!key) return null;

    const entry = _cache.get(key);
    if (!entry) {
        _misses++;
        return null;
    }

    if (Date.now() > entry.expiresAt) {
        _cache.delete(key);
        _misses++;
        return null;
    }

    _hits++;
    return entry.value;
}

/**
 * Store resolved entitlements in cache.
 * The value is deep-frozen to prevent downstream mutation.
 * @param {string} orgId
 * @param {string} planVersionId
 * @param {Object} entitlements — resolved plan capabilities
 */
function set(orgId, planVersionId, entitlements) {
    const key = _buildKey(orgId, planVersionId);
    if (!key) return;

    _evictIfNeeded();

    // Deep-freeze to prevent accidental mutation
    const frozen = JSON.parse(JSON.stringify(entitlements));
    Object.freeze(frozen);

    _cache.set(key, {
        value: frozen,
        expiresAt: Date.now() + DEFAULT_TTL_MS,
    });
}

/**
 * Invalidate all cached entitlements for a specific org.
 * Called after add-on purchases, plan changes, etc.
 * @param {string} orgId
 */
function invalidateOrg(orgId) {
    const prefix = `${String(orgId)}:`;
    for (const key of _cache.keys()) {
        if (key.startsWith(prefix)) {
            _cache.delete(key);
        }
    }
}

/**
 * Clear entire cache. Used in tests.
 */
function clear() {
    _cache.clear();
    _hits = 0;
    _misses = 0;
}

/**
 * Return observability statistics.
 */
function stats() {
    const total = _hits + _misses;
    return {
        size: _cache.size,
        hits: _hits,
        misses: _misses,
        hitRate: total === 0 ? "0%" : `${((_hits / total) * 100).toFixed(1)}%`,
        maxSize: MAX_SIZE,
        ttlMs: DEFAULT_TTL_MS,
    };
}

module.exports = { get, set, invalidateOrg, clear, stats };
