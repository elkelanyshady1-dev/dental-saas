/**
 * unifiedCapabilityMiddleware.js
 * Sprint 3 — Unified Capability Resolver
 *
 * Phase A: Corrected to properly consume req.featureFlags from featureFlagMiddleware.
 * Phase A++: Injects req.capabilityHash (SHA-256) + req.capabilitiesVersion for
 *            consistency checking, trace logging, and cache invalidation.
 *
 * Attaches req.capabilities to every org-plane request.
 *
 * MUST BE POSITIONED:
 *   AFTER  → subscriptionGuard     (sets req.planCapabilities via entitlementResolver)
 *   AFTER  → featureFlagMiddleware (sets req.featureFlags via FeatureFlag documents)
 *   BEFORE → orgV1Routes           (controllers read req.capabilities)
 *
 * Input sources (gracefully handled if missing):
 *   req.planCapabilities.modules   → entitlement modules (Sprint 2)
 *   req.planCapabilities.limits    → entitlement limits
 *   req.planCapabilities.addons    → entitlement addons
 *   req.featureFlags               → per-org feature flag overrides (from featureFlagMiddleware)
 *   req.context.organizationId     → enables TTL cache
 *
 * Output:
 *   req.capabilities = { modules, limits, features, addons }
 *
 * FAIL-SAFE: Any error → req.capabilities = {} and calls next().
 * Never blocks a request. Never throws.
 *
 * Backwards compat:
 *   Does NOT modify req.planCapabilities, req.plan, or req.moduleAccess.
 *   All existing guards continue to work unchanged.
 *
 * PLANE: Org-plane only (mounted on /org route group in app.js)
 */

"use strict";

const { resolveUnifiedCapabilities } = require("../platform/billing/services/unifiedCapabilityResolver.service");
const { syncModuleState } = require("../orgRuntime/moduleStateSync.service");
const logger = require("../utils/logger");
const hashCapabilities = require("../utils/capabilityHash");

/**
 * unifiedCapabilityMiddleware
 *
 * Express middleware.
 * Reads req.planCapabilities, req.featureFlags, and req.context.organizationId,
 * calls resolveUnifiedCapabilities(), and attaches result to req.capabilities.
 *
 * Phase A FIX: Previously passed planCaps.features (always {}) as featureFlags.
 * Now correctly reads req.featureFlags from featureFlagMiddleware.
 */
async function unifiedCapabilityMiddleware(req, res, next) {
    try {
        const planCaps = req.planCapabilities || {};
        const orgId = req.context?.organizationId ?? null;

        // Phase A: req.featureFlags is set by featureFlagMiddleware (mounted before this).
        // Fall back to planCaps.features for backward compat, then to empty object.
        const featureFlags = req.featureFlags || planCaps.features || {};

        req.capabilities = resolveUnifiedCapabilities({
            modules: planCaps.modules || {},
            limits: planCaps.limits || {},
            addons: planCaps.addons || [],
            featureFlags,
            orgId
        });

        // Phase A++: Capability fingerprint + version for tracing and cache invalidation
        req.capabilityHash = hashCapabilities(req.capabilities);
        req.capabilitiesVersion = 1;

        // Phase B.2: Async module state sync (fire-and-forget, TTL-gated)
        if (orgId && req.capabilities.modules) {
            syncModuleState(orgId, req.capabilities.modules).catch(() => {});
        }

        // ── Option A: Dev module injection ────────────────────────────────────
        // When NODE_ENV !== "production" AND BYPASS_ENTITLEMENTS=true,
        // force-enable orthodontics so the full visit lifecycle works locally
        // without a seeded plan. This is additive — does NOT kill other modules.
        //
        // To activate:  BYPASS_ENTITLEMENTS=true in .env
        // To deactivate: remove or set BYPASS_ENTITLEMENTS=false
        if (process.env.NODE_ENV !== "production" && process.env.BYPASS_ENTITLEMENTS === "true") {
            if (req.capabilities && typeof req.capabilities === "object") {
                req.capabilities.modules = {
                    ...(req.capabilities.modules || {}),
                    orthodontics: true,
                };
            }
        }

    } catch (err) {
        // Never block a request — capabilities simply unavailable
        logger.warn(
            { err },
            "[UnifiedCapabilityMiddleware] Failed to resolve capabilities — setting empty"
        );
        req.capabilities = {};
    }

    return next();
}

module.exports = unifiedCapabilityMiddleware;

