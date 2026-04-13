/**
 * moduleLoader.js — OrgRuntime Module Execution Engine (v2.0)
 * Phase 1 — Authorization Stabilization
 *
 * ── PURPOSE ──────────────────────────────────────────────────────────────────
 * Replaces registerOrgRoutes.js as the single entry point for mounting
 * all org-plane modules. Iterates MODULE_REGISTRY and mounts each module
 * with the appropriate middleware chain.
 *
 * ── DESIGN PRINCIPLES ────────────────────────────────────────────────────────
 *
 * 1. ALL routes are mounted unconditionally at boot time (no DB reads).
 *    Access control is enforced at REQUEST TIME by requireEntitlement() middleware.
 *
 * 2. Self-contained modules (selfContained: true) apply their own
 *    orgProtect + organizationContext + subscriptionGuard internally.
 *    The parent router (/org) also applies orgProtect + organizationContext,
 *    so authMiddleware runs twice for these modules.
 *
 *    BUG-9 FIX (applied in authMiddleware): authMiddleware now short-circuits
 *    with next() when req.user is already hydrated (req._authDone === true),
 *    making the second pass an O(1) no-op with zero DB cost.
 *    The moduleLoader does NOT need to be changed — the guard lives in auth.
 *
 * 3. Non-self-contained modules rely on the parent router's middleware chain.
 *    The moduleLoader adds requireEntitlement() for these modules.
 *
 * 4. Environment-gated modules (debug) are only mounted in dev/staging.
 *
 * ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
 * ✗ Does not dynamically load code from the filesystem or database
 * ✗ Does not conditionally mount based on DB state
 * ✗ Does not modify platform routes (/api/v1/platform)
 * ✗ Does not bypass orgProtect, subscriptionGuard, or requireEntitlement
 * ✗ Does not install or uninstall modules at runtime
 *
 * ── MIGRATION NOTE ───────────────────────────────────────────────────────────
 * registerOrgRoutes.js is retained as a reference but is no longer called.
 * moduleLoader.js is the canonical boot-time mounting engine from Phase B onward.
 */

"use strict";

const { MODULE_REGISTRY, SELF_CONTAINED_KEYS, getRegistryManifest, FEATURE_REGISTRY } = require("../platform/featureRegistry");
const requireEntitlement = require("../middleware/requireEntitlement");
const { validateRegistry } = require("../core/registryValidator");
const logger = require("@utils/logger");

// ─── Boot-time state ─────────────────────────────────────────────────────────

/** @type {{ registryKey: string, mountPath: string, category: string, selfContained: boolean }[]} */
const _mountedModules = [];

/** @type {string[]} */
const _skippedModules = [];

/** @type {boolean} */
let _isLoaded = false;

// ─── Environment Detection ───────────────────────────────────────────────────

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Modules that should only be mounted in development/staging environments.
 * These are gated at MODULE LOAD TIME, not at request time.
 */
const DEV_ONLY_REGISTRY_KEYS = new Set(["debug"]);

// ─── Dependency Validation ───────────────────────────────────────────────────

/**
 * Validates that all module dependencies exist in the registry.
 * Called once at boot time. Throws on invalid dependency references.
 *
 * @throws {Error} if a module references a dependency not in MODULE_REGISTRY
 */
function validateDependencies() {
    const allKeys = new Set(Object.keys(MODULE_REGISTRY));
    const errors = [];

    for (const [registryKey, def] of Object.entries(MODULE_REGISTRY)) {
        if (!def.dependencies || def.dependencies.length === 0) continue;

        for (const dep of def.dependencies) {
            if (!allKeys.has(dep)) {
                errors.push(
                    `Module "${registryKey}" declares dependency "${dep}" which does not exist in MODULE_REGISTRY`
                );
            }
        }
    }

    if (errors.length > 0) {
        const msg = `[moduleLoader] Dependency validation FAILED:\n  ${errors.join("\n  ")}`;
        logger.error({ errors }, msg);
        throw new Error(msg);
    }

    logger.info(
        { service: "moduleLoader", moduleCount: allKeys.size },
        "[moduleLoader] Dependency validation PASSED"
    );
}

/**
 * Validates that no two modules share the same mountPath.
 * Duplicate mountPaths would cause Express routing conflicts.
 *
 * @throws {Error} if duplicate mountPaths are detected
 */
function validateMountPaths() {
    const seen = new Map(); // mountPath → registryKey
    const duplicates = [];

    for (const [registryKey, def] of Object.entries(MODULE_REGISTRY)) {
        if (seen.has(def.mountPath)) {
            duplicates.push(
                `mountPath "/${def.mountPath}" is claimed by both "${seen.get(def.mountPath)}" and "${registryKey}"`
            );
        }
        seen.set(def.mountPath, registryKey);
    }

    if (duplicates.length > 0) {
        const msg = `[moduleLoader] Mount path validation FAILED:\n  ${duplicates.join("\n  ")}`;
        logger.error({ duplicates }, msg);
        throw new Error(msg);
    }
}

// ─── Module Mounting ─────────────────────────────────────────────────────────

/**
 * loadOrgModules(router)
 *
 * Mounts all modules from MODULE_REGISTRY onto the provided Express router.
 * This is the Phase B replacement for registerOrgRoutes().
 *
 * Middleware chain per module:
 *   For ALL modules:
 *     parentRouter applies: orgProtect → organizationContext (from orgV1Routes.js)
 *     moduleLoader adds:   requireEntitlement(registryKey) → moduleRouter
 *
 *   Self-contained modules additionally have their own internal:
 *     orgProtect → organizationContext → subscriptionGuard → requireEntitlement
 *     (applied inside the route file — idempotent with parent middleware)
 *
 * Called once from orgV1Routes.js during app initialization.
 *
 * @param {import('express').Router} router — the /api/v1/org router
 */
function loadOrgModules(router) {
    if (_isLoaded) {
        logger.warn("[moduleLoader] loadOrgModules() called more than once — ignoring duplicate call");
        return;
    }

    // ── Boot-time validation ─────────────────────────────────────────────────
    // Phase B.1: Validate the unified FEATURE_REGISTRY first
    validateRegistry(FEATURE_REGISTRY, { strict: true });

    validateDependencies();
    validateMountPaths();

    // ── Mount each module ────────────────────────────────────────────────────
    for (const [registryKey, moduleDef] of Object.entries(MODULE_REGISTRY)) {
        const {
            mountPath,
            routeFactory,
            selfContained,
            category,
            description,
            isCore,
            allowedPlans,
        } = moduleDef;

        // ── Environment gate ─────────────────────────────────────────────────
        if (DEV_ONLY_REGISTRY_KEYS.has(registryKey) && IS_PRODUCTION) {
            _skippedModules.push(registryKey);
            logger.info(
                { service: "moduleLoader", module: registryKey },
                `[moduleLoader] SKIPPED "${registryKey}" (dev/staging only)`
            );
            continue;
        }

        // ── Build the module's Express router ────────────────────────────────
        const moduleRouter = routeFactory();

        // ── Mount with requireEntitlement middleware ─────────────────────────
        // Parent router (orgV1Routes.js) already applies orgProtect + organizationContext.
        // requireEntitlement() enforces plan-level module access via req.capabilities (SSOT).
        router.use(
            `/${mountPath}`,
            requireEntitlement(registryKey),
            moduleRouter
        );

        // ── Track mounted module ─────────────────────────────────────────────
        _mountedModules.push({
            registryKey,
            mountPath,
            category,
            selfContained: !!selfContained,
        });

        logger.info(
            {
                service: "moduleLoader",
                module: registryKey,
                mountPath: `/org/${mountPath}`,
                plans: allowedPlans.join(", "),
                isCore,
                selfContained: !!selfContained,
                category,
            },
            `[moduleLoader] ✓ Mounted "${registryKey}" → /org/${mountPath} (${category}, core=${isCore})`
        );
    }

    // ── Set global registration flag ─────────────────────────────────────────
    // SovereignGuard reads this to verify module registration without
    // inspecting Express router internals (which are version-fragile).
    global.__ORG_RUNTIME_REGISTERED__ = true;

    _isLoaded = true;

    // ── Boot summary ─────────────────────────────────────────────────────────
    logger.info(
        {
            service: "moduleLoader",
            mounted: _mountedModules.length,
            skipped: _skippedModules.length,
            total: Object.keys(MODULE_REGISTRY).length,
        },
        `[moduleLoader] Boot complete — ${_mountedModules.length} modules mounted, ${_skippedModules.length} skipped`
    );
}

// ─── Health / Diagnostic API ─────────────────────────────────────────────────

/**
 * Returns a boot-time diagnostic snapshot of the module loader.
 * Used by health checks, governance dashboards, and admin APIs.
 *
 * @returns {{ isLoaded: boolean, mountedCount: number, skippedCount: number, mounted: object[], skipped: string[], manifest: object[] }}
 */
function getLoaderHealth() {
    return {
        isLoaded: _isLoaded,
        mountedCount: _mountedModules.length,
        skippedCount: _skippedModules.length,
        totalRegistered: Object.keys(MODULE_REGISTRY).length,
        mounted: _mountedModules.map(m => ({
            registryKey: m.registryKey,
            mountPath: `/org/${m.mountPath}`,
            category: m.category,
            selfContained: m.selfContained,
        })),
        skipped: [..._skippedModules],
        manifest: getRegistryManifest(),
    };
}

/**
 * Returns whether the module loader has completed its boot sequence.
 * @returns {boolean}
 */
function isLoaded() {
    return _isLoaded;
}

module.exports = {
    loadOrgModules,
    getLoaderHealth,
    isLoaded,
};
