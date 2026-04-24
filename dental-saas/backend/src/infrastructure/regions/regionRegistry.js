/**
 * regionRegistry.js
 * v31.1 — In-Memory Region Registry Cache
 *
 * Loads all active regions from the Control Plane DB at startup and provides
 * O(1) region lookup, eliminating per-request MongoDB queries.
 *
 * Lifecycle:
 *   1. loadRegionRegistry() — called during server boot (after DB connect)
 *   2. getRegionConfig(code) — synchronous O(1) lookup (replaces Region.findOne)
 *   3. getActiveRegionCodes() — returns list of active region codes (replaces Region.find)
 *   4. refreshRegionRegistry() — periodic background refresh (optional, every 5 min)
 *
 * SAFETY:
 *   - Throws on empty registry (prevents silent failures)
 *   - Throws on lookup miss (preserves existing error contract)
 *   - Refresh failures are non-fatal (cached data retained)
 */
"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const RegionDef = require("../../platform/domain/models/Region.model");
const Region = getPlatformModel(RegionDef);
const logger = require("../../utils/logger");

/** @type {Record<string, {code: string, name: string, dbUri: string, redisUrl: string, providerKeys: object, status: string}>} */
let regionRegistry = {};

/** @type {NodeJS.Timeout|null} */
let refreshInterval = null;

// ── Load ──────────────────────────────────────────────────────────────────────
/**
 * Loads all ACTIVE regions from the Control Plane database into memory.
 * Must be called after mongoose.connect() during server bootstrap.
 * @throws {Error} If no active regions are found (bootstrap required).
 */
async function loadRegionRegistry() {
  const regions = await Region.find({
    status: "ACTIVE"
  }).lean();
  if (!regions.length) {
    throw new Error("[RegionRegistry] EMPTY — No active regions in Control Plane. " + "Run: node scripts/seedRegions.js");
  }
  const newRegistry = {};
  for (const region of regions) {
    newRegistry[region.code] = {
      code: region.code,
      name: region.name,
      dbUri: region.dbUri,
      redisUrl: region.redisUrl,
      providerKeys: region.providerKeys || {},
      status: region.status
    };
  }
  regionRegistry = newRegistry;
  const codes = Object.keys(regionRegistry);
  logger.info({
    service: "regionRegistry",
    action: "REGION_REGISTRY_LOADED",
    regions: codes,
    count: codes.length
  }, `[RegionRegistry] ✅ Loaded ${codes.length} regions: ${codes.join(", ")}`);
  return regionRegistry;
}

// ── Lookup ────────────────────────────────────────────────────────────────────
/**
 * Synchronous O(1) region config lookup.
 * Replaces Region.findOne({ code }) in regionRouter.
 *
 * @param {string} code — Region code (e.g. "MEA", "EU", "US", "APAC")
 * @returns {{ code: string, name: string, dbUri: string, redisUrl: string, providerKeys: object, status: string }}
 * @throws {Error} If region is not in the registry.
 */
function getRegionConfig(code) {
  const upperCode = (code || "").toUpperCase();
  const region = regionRegistry[upperCode];
  if (!region) {
    logger.error({
      service: "regionRegistry",
      event: "REGION_LOOKUP_FAILED",
      regionCode: upperCode,
      availableRegions: Object.keys(regionRegistry)
    }, `[RegionRegistry] ❌ Region ${upperCode} not found in cache.`);
    throw new Error(`Region ${upperCode} not found in Control Plane registry.`);
  }
  return region;
}

// ── Enumeration ───────────────────────────────────────────────────────────────
/**
 * Returns the full in-memory registry (shallow copy).
 * @returns {Record<string, object>}
 */
function getAllRegions() {
  return {
    ...regionRegistry
  };
}

/**
 * Returns an array of active region codes.
 * Replaces Region.find({ status: "ACTIVE" }) in background jobs.
 * @returns {string[]}
 */
function getActiveRegionCodes() {
  return Object.keys(regionRegistry);
}

// ── Validation ────────────────────────────────────────────────────────────────
/**
 * Validates that the required regions are present in the registry.
 * @param {string[]} [requiredCodes=["EU","US","MEA","APAC"]]
 * @throws {Error} If any required region is missing.
 */
function validateRegionRegistry(requiredCodes = ["EU", "US", "MEA", "APAC"]) {
  const missing = requiredCodes.filter(c => !regionRegistry[c]);
  if (missing.length > 0) {
    throw new Error(`[RegionRegistry] INCOMPLETE — Missing regions: ${missing.join(", ")}. ` + "Run: node scripts/seedRegions.js");
  }
  logger.info({
    service: "regionRegistry",
    action: "REGION_REGISTRY_VALIDATED",
    regions: requiredCodes
  }, `[RegionRegistry] ✅ All ${requiredCodes.length} required regions present.`);
}

// ── Background Refresh ────────────────────────────────────────────────────────
/**
 * Refreshes the region registry from the database.
 * Failures are non-fatal — existing cached data is retained.
 */
async function refreshRegionRegistry() {
  try {
    await loadRegionRegistry();
    logger.debug({
      service: "regionRegistry",
      action: "REGION_REGISTRY_REFRESHED"
    }, "[RegionRegistry] Background refresh complete.");
  } catch (err) {
    // Non-fatal: keep existing cache, log warning
    logger.warn({
      service: "regionRegistry",
      action: "REGION_REGISTRY_REFRESH_FAILED",
      err: err.message
    }, "[RegionRegistry] ⚠️ Background refresh failed — using cached data.");
  }
}

/**
 * Starts a periodic background refresh of the region registry.
 * @param {number} [intervalMs=300000] — Refresh interval in ms (default: 5 min)
 */
function startRegistryRefresh(intervalMs = 300_000) {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  // ALLOWED_POLLING: SCHEDULER
  refreshInterval = setInterval(refreshRegionRegistry, intervalMs);
  // Unref so the interval doesn't prevent graceful shutdown
  refreshInterval.unref();
  logger.info({
    service: "regionRegistry",
    action: "REGION_REGISTRY_REFRESH_STARTED",
    intervalMs
  }, `[RegionRegistry] Background refresh started (every ${intervalMs / 1000}s).`);
}

/**
 * Stops the periodic background refresh.
 */
function stopRegistryRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    logger.info({
      service: "regionRegistry"
    }, "[RegionRegistry] Background refresh stopped.");
  }
}
module.exports = {
  loadRegionRegistry,
  getRegionConfig,
  getAllRegions,
  getActiveRegionCodes,
  validateRegionRegistry,
  refreshRegionRegistry,
  startRegistryRefresh,
  stopRegistryRefresh
};