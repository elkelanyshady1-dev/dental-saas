/**
 * unifiedCapabilityResolver.service.js
 * Sprint 3 — Unified Capability Resolver
 *
 * PURPOSE:
 * Computes the final `capabilities` object seen by org-plane controllers
 * and consumed by the frontend via GET /api/v1/org/capabilities.
 *
 * Merges:
 *   1. Organization Entitlements (modules + limits + addons)   ← Sprint 2 layer
 *   2. Feature Flags  (optional per-org flag map)              ← future SSE layer
 *
 * Merge semantics for `modules`:
 *   capabilities.modules[key] = entitlement[key] && (featureFlags[key] ?? true)
 *   → Feature flag = false → module KILLED even if entitlement says true
 *   → Feature flag = undefined → OPEN (entitlement wins; open by default)
 *   → Feature flag = true → module allowed if entitlement also true
 *
 * Caching:
 *   In-memory Map with 60s TTL, keyed by orgId.
 *   Invalidated by invalidateUnifiedCapabilityCache() — must be called after:
 *     • entitlement override (POST /api/platform/org-entitlements/:orgId/override)
 *     • contract activation (auto-invalidated by entitlementResolver already)
 *     • feature flag toggle (when tenant-level flags are implemented)
 *
 * Fail-safe:
 *   ANY error during resolution falls back to returning entitlement modules
 *   as-is (without feature flag gating). NEVER throws. NEVER blocks a request.
 *
 * NOT MODIFIED: OrgContract, PlanVersion, pricingEngine, invoiceEngine, BillingLedger.
 * PLANE: Shared — used by org-plane middleware and tests.
 */

"use strict";

const logger = require("@utils/logger");
const { normalizeModules, buildFeatureCapabilities } = require("../../featureRegistry");

// ─── In-memory TTL cache ───────────────────────────────────────────────────────
// Key: orgId.toString()   Value: { data: capabilitiesObject, expiry: timestamp }
const UNIFIED_CACHE = new Map();
const UNIFIED_CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * invalidateUnifiedCapabilityCache
 *
 * Evicts the cached capabilities snapshot for an org immediately.
 * Must be called after any mutation that changes an org's capabilities:
 *   - entitlement override
 *   - plan change
 *   - feature flag toggle
 *
 * @param {string|ObjectId} orgId
 */
function invalidateUnifiedCapabilityCache(orgId) {
    UNIFIED_CACHE.delete(String(orgId));
}

/**
 * resolveUnifiedCapabilities
 *
 * Computes the final unified capabilities object for an org request.
 *
 * This is a pure synchronous computation — no DB calls.
 * The caller (unifiedCapabilityMiddleware) is responsible for providing
 * all input data from req.planCapabilities (set by entitlementResolver).
 *
 * For caching: pass `orgId` to enable TTL cache. Omit `orgId` for uncached
 * resolution (e.g. unit tests).
 *
 * @param {object} params
 * @param {object} params.modules       - Entitlement modules map
 * @param {object} params.limits        - Entitlement limits map
 * @param {string[]} params.addons      - Entitlement addons list
 * @param {object} params.featureFlags  - Feature flags map (key → boolean)
 * @param {string} [params.orgId]       - Optional: enables in-memory cache
 *
 * @returns {{ modules: object, limits: object, features: object, addons: string[] }}
 */
function resolveUnifiedCapabilities(params) {
    // null-guard: ensure we always destructure a plain object
    const { modules = {}, limits = {}, addons = [], featureFlags = {}, orgId } = params || {};

    const orgKey = orgId ? String(orgId) : null;

    // ── Cache hit ──────────────────────────────────────────────────────────────
    if (orgKey) {
        const cached = UNIFIED_CACHE.get(orgKey);
        if (cached && cached.expiry > Date.now()) {
            return cached.data;
        }
    }

    try {
        // ── Safety net: normalize schema keys → canonical keys ─────────────
        // If planCapabilityBuilder already normalized, this is idempotent.
        // Catches raw schema keys leaking through entitlementResolver path.
        const normalizedModules = normalizeModules(modules);

        // ── Merge modules: entitlement × feature flags ─────────────────────────
        // Rule: flag=undefined → open (true); flag=false → killed (false)
        const resolvedModules = {};
        for (const [key, entitlementValue] of Object.entries(normalizedModules)) {
            const flagValue = featureFlags[key];
            const flagGate = flagValue === undefined ? true : Boolean(flagValue);
            resolvedModules[key] = Boolean(entitlementValue) && flagGate;
        }

        // ── Sub-feature capabilities derived from module state ──────────────
        const subFeatures = buildFeatureCapabilities(resolvedModules);

        // ── Any feature flags not in entitlement modules (forward-compat) ──────
        // These are pure flag-gated features not tied to a module entitlement.
        // They pass through directly into the features map.
        const resolvedFeatures = { ...featureFlags, ...subFeatures };

        const result = {
            modules: resolvedModules,
            limits: { ...limits },
            features: resolvedFeatures,
            addons: [...addons]
        };


        // ── Write cache ────────────────────────────────────────────────────────
        if (orgKey) {
            UNIFIED_CACHE.set(orgKey, {
                data: result,
                expiry: Date.now() + UNIFIED_CACHE_TTL_MS
            });
        }

        return result;

    } catch (err) {
        // Fail-safe: return entitlement modules as-is (no flag gating applied)
        logger.error(
            { err, orgId: orgKey },
            "[UnifiedCapabilityResolver] Resolution failed — falling back to raw entitlements"
        );
        return {
            modules: { ...modules },
            limits: { ...limits },
            features: {},
            addons: [...addons]
        };
    }
}

module.exports = {
    resolveUnifiedCapabilities,
    invalidateUnifiedCapabilityCache,
    // Exported for tests
    _unifiedCache: UNIFIED_CACHE
};
