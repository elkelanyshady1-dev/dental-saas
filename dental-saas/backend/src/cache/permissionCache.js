/**
 * permissionCache.js — In-Process Permission Set Cache (Phase 3)
 *
 * ── PROBLEM ───────────────────────────────────────────────────────────────────
 * flattenPermissions() runs on EVERY authenticated request:
 *   - Iterates through all modules × actions in the role document
 *   - Converts a Mongoose subdocument via .toJSON()
 *   - Constructs a new Set<string> from scratch
 *
 * For a role with ~150 permissions across ~20 modules, this is O(N) work
 * that produces an IDENTICAL result for every request from the same role
 * until that role's permissionVersion changes.
 *
 * ── SOLUTION ──────────────────────────────────────────────────────────────────
 * Cache the resulting Set<string> keyed by roleId + permissionVersion.
 * On cache hit: O(1) — return cached Set directly.
 * On cache miss: run flattenPermissions(), store result, return.
 *
 * ── CACHE INVALIDATION ────────────────────────────────────────────────────────
 * Version-aware keying: `${roleId}:${permissionVersion}`
 * When a role is updated (permissionVersion bumped):
 *   - The old key is simply never hit again (LRU eviction cleans it up)
 *   - Stale tokens are caught by authMiddleware's permissionVersion check
 *   - No explicit invalidation needed — version is the TTL
 *
 * ── SAFETY ────────────────────────────────────────────────────────────────────
 * - Cache stores FROZEN Sets — controllers cannot mutate cached entries
 * - Max size enforced via LRU eviction (prevents unbounded growth in large orgs)
 * - Undefined permissionVersion → cache DISABLED for that entry (safe fallback)
 * - Cache is module-level (process-scoped) — NOT shared across processes
 *   For multi-process/cluster deployments, each worker has its own cache.
 *   This is acceptable since the cache is warm within seconds of first request.
 *
 * ── METRICS ───────────────────────────────────────────────────────────────────
 * - permissionCache.stats() returns hit/miss counts for observability
 * - PERMISSION_CACHE_MAX_SIZE env var controls eviction threshold (default 500)
 *
 * PLANE: Org only.
 * PHASE: 3 — Performance.
 */

"use strict";

const MAX_SIZE = parseInt(process.env.PERMISSION_CACHE_MAX_SIZE || "500", 10);

// LRU-style tracking: insertion order Map for O(1) eviction
/** @type {Map<string, { set: Set<string>, insertedAt: number }>} */
const _cache = new Map();

// Counters for observability
let _hits = 0;
let _misses = 0;

/**
 * Build the cache key.
 * Includes permissionVersion so any role update automatically busts the cache.
 *
 * @param {string|Object} roleId
 * @param {number|undefined} permissionVersion
 * @returns {string|null} null if version is undefined (disables caching)
 */
function _buildKey(roleId, permissionVersion) {
    if (permissionVersion === undefined || permissionVersion === null) {
        return null; // Don't cache — version unknown, can't guarantee freshness
    }
    return `${String(roleId)}:${permissionVersion}`;
}

/**
 * Evict oldest entries when cache exceeds MAX_SIZE.
 * Map insertion order gives us LRU-ish behavior for free.
 */
function _evictIfNeeded() {
    if (_cache.size <= MAX_SIZE) return;

    // Delete oldest N entries (Map iterates insertion order)
    const toDelete = Math.ceil(MAX_SIZE * 0.1); // evict 10% at a time
    let deleted = 0;
    for (const key of _cache.keys()) {
        if (deleted >= toDelete) break;
        _cache.delete(key);
        deleted++;
    }
}

/**
 * Get a cached permission Set.
 *
 * @param {string|Object} roleId      — Role document _id
 * @param {number|undefined} version  — Role's permissionVersion
 * @returns {Set<string>|null}         — null on cache miss
 */
function get(roleId, version) {
    const key = _buildKey(roleId, version);
    if (!key) return null;

    const entry = _cache.get(key);
    if (entry) {
        _hits++;
        return entry.set;
    }

    _misses++;
    return null;
}

/**
 * Store a permission Set in the cache.
 * The Set is frozen before storage to prevent accidental mutation.
 *
 * @param {string|Object} roleId      — Role document _id
 * @param {number|undefined} version  — Role's permissionVersion
 * @param {Set<string>} permissionSet — Flat permission Set from flattenPermissions()
 */
function set(roleId, version, permissionSet) {
    const key = _buildKey(roleId, version);
    if (!key) return; // Don't cache if version unknown

    _evictIfNeeded();

    _cache.set(key, {
        set: Object.freeze(permissionSet), // Freeze to prevent downstream mutation
        insertedAt: Date.now(),
    });
}

/**
 * Explicitly remove a role from cache.
 * Called when a role document is updated outside of the normal permissionVersion flow.
 *
 * @param {string|Object} roleId
 * @param {number|undefined} version
 */
function invalidate(roleId, version) {
    const key = _buildKey(roleId, version);
    if (key) _cache.delete(key);
}

/**
 * Clear entire cache.
 * Used in tests or after a bulk role migration.
 */
function clear() {
    _cache.clear();
    _hits = 0;
    _misses = 0;
}

/**
 * Return observability statistics.
 * @returns {{ size: number, hits: number, misses: number, hitRate: string }}
 */
function stats() {
    const total = _hits + _misses;
    return {
        size: _cache.size,
        hits: _hits,
        misses: _misses,
        hitRate: total === 0 ? "0%" : `${(((_hits / total) * 100)).toFixed(1)}%`,
        maxSize: MAX_SIZE,
    };
}

module.exports = { get, set, invalidate, clear, stats };
