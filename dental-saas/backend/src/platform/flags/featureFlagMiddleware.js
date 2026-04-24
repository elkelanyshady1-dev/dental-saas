/**
 * featureFlagMiddleware.js
 * Tenant-Level Feature Flag Middleware
 *
 * PURPOSE:
 * Loads all FeatureFlag documents and resolves per-org overrides.
 * Attaches the resolved flag map to req.featureFlags.
 *
 * Consumed by:
 *   unifiedCapabilityMiddleware.js  (reads req.featureFlags → passes to resolveUnifiedCapabilities)
 *
 * CACHING:
 *   In-memory Map with 60s TTL (shared per process, per-instance).
 *   Invalidate by calling invalidateFeatureFlagCache() after flag mutations.
 *   Phase A++: Cache hit/miss counters exposed via auth-health endpoint.
 *
 * SAFETY:
 *   Never throws. On any error, attaches req.featureFlags = {} and calls next().
 *   This ensures capability resolution gracefully degrades to entitlement-only.
 *
 * PLANE: Platform / Flags
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const FeatureFlagDef = require("../billing/models/FeatureFlag.model");
const FeatureFlag = getPlatformModel(FeatureFlagDef);
const logger = require("@utils/logger");

// ─── In-memory TTL cache ───────────────────────────────────────────────────────
// Key: orgId.toString()   Value: { data: flagMap, expiry: timestamp }
// A single GLOBAL entry ("_global") stores the raw flag documents for all orgs.
let _cache = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

// Phase A++: Global cache performance counters (exposed via auth-health endpoint)
const _cacheStats = {
  hits: 0,
  misses: 0
};

/**
 * invalidateFeatureFlagCache
 * Force-evict the in-memory cache.
 * Must be called after any FeatureFlag create/update via admin API.
 */
function invalidateFeatureFlagCache() {
  _cache = null;
  _cacheExpiry = 0;
  logger.info("[FeatureFlagMiddleware] Cache invalidated");
}

/**
 * _loadFlags
 * Loads all feature flag documents (with cache).
 * Returns an array of FeatureFlag lean documents.
 */
async function _loadFlags() {
  if (_cache && _cacheExpiry > Date.now()) {
    _cacheStats.hits++;
    return _cache;
  }
  _cacheStats.misses++;
  const flags = await FeatureFlag.find({}).lean().maxTimeMS(3000);
  _cache = flags;
  _cacheExpiry = Date.now() + CACHE_TTL_MS;
  return flags;
}

/**
 * resolveFeatureFlags
 *
 * Express middleware.
 * Resolves the per-org feature flag map and attaches to req.featureFlags.
 *
 * Flag resolution priority:
 *   1. orgOverrides[orgId] — if set, this wins
 *   2. flag.defaultValue   — fallback
 *
 * req.featureFlags = { analytics: true, orthodontics: false, ... }
 */
async function resolveFeatureFlags(req, res, next) {
  // Phase 8: Use req.context (set by authMiddleware) — req.organization is deprecated
  const orgId = req.context?.organizationId?.toString() || req.params?.orgId?.toString() || null;
  try {
    const flags = await _loadFlags();
    const resolved = {};
    for (const flag of flags) {
      // Check per-org override
      const orgOverride = orgId ? flag.orgOverrides?.get?.(orgId) : undefined;
      resolved[flag.flagKey] = orgOverride !== undefined ? orgOverride : flag.defaultValue;
    }
    req.featureFlags = resolved;

    // Phase A+: Dev debug — log resolved flags for override debugging
    if (process.env.NODE_ENV !== "production") {
      logger.debug({
        orgId,
        flagCount: Object.keys(resolved).length,
        flags: resolved
      }, "[FeatureFlagMiddleware] Resolved flags");
    }
  } catch (err) {
    // Fail-safe: never block request on flag load failure
    logger.error({
      err: {
        message: err.message
      },
      orgId
    }, "[FeatureFlagMiddleware] Flag load failed — defaulting to empty (no flags gating)");
    req.featureFlags = {};
  }
  next();
}
module.exports = {
  resolveFeatureFlags,
  invalidateFeatureFlagCache,
  // Phase A++: Expose cache stats for auth-health endpoint
  getCacheStats: () => ({
    ..._cacheStats
  }),
  // Exported for tests
  _getCacheExpiry: () => _cacheExpiry
};