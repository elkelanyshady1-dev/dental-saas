/**
 * requireEntitlement.js — Module Entitlement Guard
 *
 * Phase 5 — Lean form. Removed:
 *   - SSOT violation detector (dev-only, migration complete)
 *   - denialTracker persistence (non-blocking async log — not a guard)
 *   - ENTITLEMENT_AUDIT_MODE toggle (use ENTITLEMENT_AUDIT_MODE env directly)
 *
 * Kept:
 *   - Core SSOT entitlement check (req.capabilities.modules)
 *   - CORE_MODULES bypass (always entitled)
 *   - Runtime dependency enforcement (Phase B — real business rule)
 *   - Human-readable denial messages
 *   - authTrace integration (no-op if trace not mounted)
 *
 * Resolution order (SINGLE SOURCE OF TRUTH):
 *   1. CORE_MODULES → always allow
 *   2. req.capabilities.modules[key] === true → ALLOW (+ dep check)
 *   3. Otherwise → 403 FEATURE_NOT_ENABLED
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

// ─── Lazy-loaded registry (avoids circular dependency at require time) ────────
let _CORE_MODULES = null;
let _FEATURE_REGISTRY = null;

function getCoreModules() {
    if (!_CORE_MODULES) {
        const registry = require("../platform/featureRegistry");
        _CORE_MODULES = registry.CORE_MODULES;
        _FEATURE_REGISTRY = registry.FEATURE_REGISTRY;
    }
    return _CORE_MODULES;
}

function getFeatureRegistry() {
    if (!_FEATURE_REGISTRY) {
        const registry = require("../platform/featureRegistry");
        _CORE_MODULES = registry.CORE_MODULES;
        _FEATURE_REGISTRY = registry.FEATURE_REGISTRY;
    }
    return _FEATURE_REGISTRY;
}

// ─── Human-Readable Denial Messages ─────────────────────────────────────────
const DENIAL_MESSAGES = {
    orthodontics: "Orthodontics module is not included in your current plan. Contact your administrator to upgrade.",
    analytics: "Analytics module requires a Professional or Enterprise plan.",
    clinical: "Clinical operations module is not enabled for your organization.",
    finance: "Finance module is not enabled for your organization.",
    inventory: "Inventory management is not enabled for your organization.",
    booking: "Online booking is not included in your current plan.",
    labs: "Lab management module requires an Enterprise plan.",
    security: "Security Control Center is not enabled for your organization.",
    users: "User management module is not enabled for your organization.",
    branches: "Branch management module is not enabled for your organization.",
    ai_segmentation: "AI segmentation is not available in your current plan.",
    bulk_operations: "Bulk operations require a Professional or Enterprise plan.",
    api_access: "API access requires an Enterprise plan.",
    white_label: "White-label branding requires an Enterprise plan.",
    _default: "This feature is not included in your current plan. Please contact your administrator.",
};

function getDenialMessage(featureKey) {
    return DENIAL_MESSAGES[featureKey] || DENIAL_MESSAGES._default;
}

/**
 * checkDependencies — Phase B runtime dependency enforcement.
 * If module "booking" depends on "patients", and "patients" is disabled,
 * the request is blocked even if "booking" itself is entitled.
 *
 * @param {string} featureKey
 * @param {Object} capModules — req.capabilities.modules
 * @returns {{ ok: boolean, missing: string[] }}
 */
function checkDependencies(featureKey, capModules) {
    const FEATURE_REGISTRY = getFeatureRegistry();
    const def = FEATURE_REGISTRY[featureKey];
    if (!def?.dependencies?.length) return { ok: true, missing: [] };

    const missing = [];
    for (const depKey of def.dependencies) {
        const depDef = FEATURE_REGISTRY[depKey];
        if (!depDef || depDef.isCore) continue; // unknown or core → always satisfied
        if (!capModules[depDef.module]) missing.push(depKey);
    }
    return { ok: missing.length === 0, missing };
}

/**
 * requireEntitlement(featureKey)
 *
 * Returns an Express middleware that enforces plan-level module access.
 *
 * Resolution order (SINGLE SOURCE OF TRUTH — registry-driven):
 *   1. Resolve featureKey → def.module via FEATURE_REGISTRY
 *   2. CORE_MODULES.has(def.module)           → ALLOW (core bypass)
 *   3. req.capabilities.modules[def.module]   → ALLOW (plan entitled)
 *   4. Otherwise                              → 403 FEATURE_NOT_ENABLED
 *
 * WHY def.module (not featureKey):
 *   registryKey = routing ("orthodontic-cases")
 *   module      = entitlement ("orthodontics")
 *   schemaKey   = billing ("orthodonticsAdv")
 *   NEVER mix them.
 *
 * @param {string} featureKey — Registry key (e.g., "orthodontics", "orthodontic-cases")
 * @returns {import("express").RequestHandler}
 */
function requireEntitlement(featureKey) {
    return function entitlementGuard(req, res, next) {
        // ── Safety: registry must be initialized ──────────────────────────
        const CORE_MODULES = getCoreModules();
        const FEATURE_REGISTRY = getFeatureRegistry();

        if (!CORE_MODULES || typeof CORE_MODULES.has !== "function") {
            return res.status(500).json({
                success: false,
                error: { code: "ENTITLEMENT_ENGINE_INVALID", message: "Feature registry not initialized" },
            });
        }

        // ── Resolve featureKey → canonical module name ─────────────────────
        // REQUIRED: entitlements are keyed by module, NOT registryKey.
        // e.g. featureKey="orthodontic-cases" → def.module="orthodontics"
        const def = FEATURE_REGISTRY[featureKey];
        if (!def) {
            // Unknown featureKey — hard fail to catch misconfiguration early
            logger.error(
                { featureKey, endpoint: `${req.method} ${req.originalUrl}` },
                `[Entitlement] requireEntitlement called with unknown featureKey "${featureKey}" — check featureRegistry`
            );
            return res.status(500).json({
                success: false,
                error: { code: "ENTITLEMENT_CONFIG_ERROR", message: `Unknown feature key: "${featureKey}"` },
            });
        }

        const moduleKey = def.module; // canonical module name — the entitlement key

        // ── Core modules — always entitled (bypass plan check) ────────────
        if (CORE_MODULES.has(moduleKey)) {
            req.addAuthTrace?.({ layer: "ENTITLEMENT", module: moduleKey, featureKey, result: "ALLOW", reason: "Core module" });
            return next();
        }

        // ── Step 6: BYPASS_ENTITLEMENTS=true → skip all plan checks ──────
        // DEV / staging only — NEVER set in production.
        // Set in .env: BYPASS_ENTITLEMENTS=true
        if (process.env.BYPASS_ENTITLEMENTS === "true") {
            logger.warn(
                { event: "ENTITLEMENT_BYPASS", featureKey, moduleKey, endpoint: `${req.method} ${req.originalUrl}` },
                "[Entitlement] BYPASS_ENTITLEMENTS=true — entitlement check skipped (dev only)"
            );
            req.addAuthTrace?.({ layer: "ENTITLEMENT", module: moduleKey, featureKey, result: "ALLOW", reason: "BYPASS_ENTITLEMENTS override" });
            return next();
        }

        // ── Organization context required ─────────────────────────────────
        const orgId = req.context?.organizationId || req.organizationId;
        if (!orgId) {
            logger.warn({ event: "ENTITLEMENT_NO_ORG", featureKey }, "[Entitlement] Organization context missing");
            return res.status(401).json({
                success: false,
                error: { code: "ORG_CONTEXT_MISSING", message: "Organization context is required." },
            });
        }

        // ── SSOT: req.capabilities.modules[moduleKey] ────────────────────
        // Resolve by MODULE NAME (not featureKey) — this is the canonical key
        // that normalizeModules() produces from the PlanVersion schema.
        const capModules = req.capabilities?.modules;
        if (capModules && typeof capModules === "object" && capModules[moduleKey] === true) {
            // Phase B: dependency enforcement (still uses featureKey for dep lookup)
            const depCheck = checkDependencies(featureKey, capModules);
            if (!depCheck.ok) {
                logger.warn({
                    event: "ENTITLEMENT_DEPENDENCY_DENIED",
                    featureKey,
                    moduleKey,
                    missingDeps: depCheck.missing,
                    organizationId: orgId?.toString(),
                    endpoint: `${req.method} ${req.originalUrl}`,
                }, `[Entitlement] "${featureKey}" (module: ${moduleKey}) entitled but dependency check failed: [${depCheck.missing.join(", ")}]`);

                req.addAuthTrace?.({
                    layer: "ENTITLEMENT", module: moduleKey, featureKey, result: "DENY",
                    reason: `Dependency not met: [${depCheck.missing.join(", ")}]`,
                });

                return res.status(403).json({
                    success: false,
                    error: {
                        code: "DEPENDENCY_NOT_MET",
                        feature: featureKey,
                        requiredModule: moduleKey,
                        missingDependencies: depCheck.missing,
                        message: `Module "${featureKey}" requires: ${depCheck.missing.join(", ")}.`,
                    },
                });
            }

            req.addAuthTrace?.({ layer: "ENTITLEMENT", module: moduleKey, featureKey, result: "ALLOW", reason: "Plan capability enabled" });
            return next();
        }

        // ── NOT ENTITLED ──────────────────────────────────────────────────
        logger.warn({
            event: "ENTITLEMENT_DENIED",
            featureKey,
            moduleKey,                           // canonical module name for diagnostics
            organizationId: orgId?.toString(),
            userId: req.user?._id?.toString(),
            endpoint: `${req.method} ${req.originalUrl}`,
            plan: req.plan?.key || "unknown",
        }, `[Entitlement] Feature "${featureKey}" (module: ${moduleKey}) not enabled`);

        req.addAuthTrace?.({
            layer: "ENTITLEMENT", module: moduleKey, featureKey, result: "DENY",
            reason: `Module "${moduleKey}" not in plan capabilities`,
        });

        // ENTITLEMENT_AUDIT_MODE=true → log but allow (dev convenience)
        if (process.env.ENTITLEMENT_AUDIT_MODE === "true") {
            return next();
        }

        return res.status(403).json({
            success: false,
            error: {
                code: "FEATURE_NOT_ENABLED",
                feature: featureKey,
                requiredModule: moduleKey,       // helps frontend & ops diagnose
                message: getDenialMessage(moduleKey) || getDenialMessage(featureKey),
            },
        });
    };
}

// ─── Exports ────────────────────────────────────────────────────────────────
module.exports = requireEntitlement;
module.exports.getDenialMessage = getDenialMessage;
module.exports.DENIAL_MESSAGES = DENIAL_MESSAGES;
// Lazy getter for circular-dep-safe CORE_MODULES access
Object.defineProperty(module.exports, "CORE_MODULES", {
    get: getCoreModules,
    enumerable: true,
});
