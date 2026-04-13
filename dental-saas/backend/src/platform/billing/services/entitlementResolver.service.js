/**
 * entitlementResolver.service.js
 * Sprint 2 — Tenant Entitlement Engine
 *
 * THE central entitlement resolver for the org plane.
 *
 * Architecture:
 *   PlanVersion.modules + limits  →  merge  →  OrganizationEntitlement overrides
 *                                             → capabilities map
 *                                             → addons list
 *
 * Caching:
 *   In-memory Map with 60-second TTL (per orgId string).
 *   Invalidated explicitly by applyEntitlementOverride after every admin mutation.
 *   Safe: never persisted; evicts automatically; failure-safe fallback to plan defaults.
 *
 * Fail-safe contract:
 *   If ANY step of the resolution fails (DB lookup, merge, etc.),
 *   this function NEVER throws. It returns plan defaults silently.
 *   This ensures no billing transaction is ever blocked by entitlement errors.
 *
 * PLANE: Shared — called from org-plane middleware and platform-plane controllers.
 */

"use strict";

const OrganizationEntitlement = require("../models/OrganizationEntitlement.model").default;
const { buildEffectivePlan } = require("../../../core/subscription/effectivePlanBuilder");
const logger = require("@utils/logger");

// Phase 12 — Entitlement Engine: single source of truth for module key normalization
const { normalizeModules } = require("../../featureRegistry");

// ─── In-memory TTL cache (per-process, per-orgId) ─────────────────────────────
// Key: orgId.toString()  Value: { data: resolvedEntitlement, expiry: timestamp }
const CACHE = new Map();
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * invalidateEntitlementCache
 *
 * Immediately evicts the cached entitlement for a given org.
 * Must be called after every admin override mutation.
 *
 * @param {string|ObjectId} orgId
 */
function invalidateEntitlementCache(orgId) {
    CACHE.delete(String(orgId));
}

// ─── Internal: native deep merge ──────────────────────────────────────────────
// Avoids the deepmerge npm dependency.
// Rules:
//   - Plain objects are merged recursively.
//   - Primitives from overrideObj WIN over baseObj (override wins).
//   - null / undefined in overrideObj is IGNORED (no accidental field deletions).
//   - Arrays from overrideObj REPLACE (not concat) base arrays.
function deepMerge(base, override) {
    if (!override || typeof override !== "object" || Array.isArray(override)) {
        return override !== undefined ? override : base;
    }

    const result = Object.assign({}, base);

    for (const key of Object.keys(override)) {
        const overrideVal = override[key];

        // Skip null / undefined overrides — don't wipe plan-derived fields
        if (overrideVal === null || overrideVal === undefined) continue;

        const baseVal = result[key];

        if (
            typeof overrideVal === "object" &&
            !Array.isArray(overrideVal) &&
            typeof baseVal === "object" &&
            baseVal !== null &&
            !Array.isArray(baseVal)
        ) {
            result[key] = deepMerge(baseVal, overrideVal);
        } else {
            result[key] = overrideVal;
        }
    }

    return result;
}

// ─── Capability derivation ─────────────────────────────────────────────────────
/**
 * deriveCapabilities
 *
 * Produces a flat boolean capability map from the merged modules object.
 * Now delegates to featureRegistry.normalizeModules() — single source of truth.
 *
 * @param {object} modules - merged PlanVersion modules (raw schema keys)
 * @returns {object} normalized capability flags (canonical keys)
 */
function deriveCapabilities(modules = {}) {
    return normalizeModules(modules || {});
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * resolveOrganizationEntitlements
 *
 * Resolves the final entitlements for an org by merging:
 *   1. PlanVersion.modules + limits (base / plan defaults)
 *   2. OrganizationEntitlement.modules + limits (org-level overrides)
 *
 * Returns from in-memory cache when available (60s TTL).
 *
 * FAIL-SAFE: On any error, returns plan defaults — never throws.
 *
 * @param {string|ObjectId} orgId
 * @param {object}          planVersion  — PlanVersion lean or Mongoose document
 * @returns {Promise<{
 *   modules: object,
 *   limits:  object,
 *   addons:  string[],
 *   capabilities: object
 * }>}
 */
async function resolveOrganizationEntitlements(orgId, planVersion) {
    const orgIdStr = String(orgId);

    // ── 1. Plan defaults (never null — fail-safe baseline) ────────────────────
    const planModules = planVersion?.modules || {};
    const planLimits = planVersion?.limits || {};
    const planQuotas = planVersion?.quotas || {};

    function planDefaults() {
        return {
            modules: planModules,
            limits: planLimits,
            quotas: planQuotas,
            addons: [],
            capabilities: deriveCapabilities(planModules)
        };
    }

    try {
        // ── 2. Cache hit ───────────────────────────────────────────────────────
        const cached = CACHE.get(orgIdStr);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }

        // ── 3. DB lookup — current entitlement (effectiveUntil = null) ────────
        const override = await OrganizationEntitlement
            .findOne({ organizationId: orgId, effectiveUntil: null })
            .lean()
            .maxTimeMS(3000);      // Hard timeout — never hangs a request

        // ── 4. Merge plan → override ───────────────────────────────────────────
        const modules = deepMerge(planModules, override?.modules || {});
        const limits = deepMerge(planLimits, override?.limits || {});
        const quotas = deepMerge(planQuotas, override?.quotas || {});
        const addons = override?.addons ?? [];
        const capabilities = deriveCapabilities(modules);

        const result = { modules, limits, quotas, addons, capabilities };

        // ── 5. Write cache ────────────────────────────────────────────────────
        CACHE.set(orgIdStr, { data: result, expiry: Date.now() + CACHE_TTL_MS });

        return result;

    } catch (err) {
        // Fail-safe: log but NEVER block the calling middleware
        logger.error(
            { err, orgId: orgIdStr },
            "[EntitlementResolver] Resolution failed — falling back to plan defaults"
        );
        return planDefaults();
    }
}

// ─── Storage Limit Resolution ──────────────────────────────────────────────────
/**
 * getStorageLimit
 *
 * Resolves the effective storage quota (in MB) for an organization.
 * Uses the full plan → add-on → entitlement override pipeline.
 *
 * Returns:
 *   -1  → unlimited (no enforcement)
 *    0  → not configured (treated as unlimited by quotaGuard)
 *   >0  → enforced limit in megabytes
 *
 * FAIL-SAFE: Returns 0 on any error (never blocks uploads).
 *
 * @param {string|ObjectId} orgId
 * @returns {Promise<number>} maxStorageMB
 */
async function getStorageLimit(orgId) {
    try {
        const effectivePlan = await buildEffectivePlan(String(orgId));
        const maxStorageMB = effectivePlan?.limits?.maxStorageMB;

        // Normalize: null, undefined, NaN → 0
        if (maxStorageMB === null || maxStorageMB === undefined || isNaN(maxStorageMB)) {
            return 0;
        }

        return maxStorageMB;
    } catch (err) {
        logger.error(
            { err, orgId: String(orgId) },
            "[EntitlementResolver] getStorageLimit failed — returning 0 (unlimited fallback)"
        );
        return 0;
    }
}

module.exports = {
    resolveOrganizationEntitlements,
    invalidateEntitlementCache,
    deriveCapabilities,      // exported for testing
    getStorageLimit,
    // Expose for integration tests
    _cache: CACHE
};
