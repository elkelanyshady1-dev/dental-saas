/**
 * validateEntitlementSync.js — Entitlement ↔ Permission Module Sync Validator
 *
 * Ensures that every permission module defined in the SSOT (orgPermissions.js)
 * has a corresponding entitlement module in the plan's feature registry.
 *
 * This prevents the scenario where permissions exist for a module but the
 * entitlement layer doesn't know about it (or vice versa).
 *
 * ┌─────────────────────────────┐
 * │  orgPermissions.js (SSOT)   │  → permission modules
 * │  featureRegistry.js         │  → entitlement modules
 * │  validateEntitlementSync.js │  ← THIS FILE (cross-layer check)
 * └─────────────────────────────┘
 *
 * PLANE: Org + Platform (cross-layer validation).
 */

"use strict";

const { deriveModuleMap } = require("../../rbac/permissionRegistry");
const logger = require("../../utils/logger");

/**
 * Known modules that exist in permissions but are NOT entitlement-gated.
 * These are core infrastructure modules that are always available
 * regardless of subscription plan. Adding a module here is an
 * explicit governance decision.
 */
const ENTITLEMENT_EXEMPT_MODULES = new Set([
    "staff",          // org_admin built-in — always available
    "security",       // security control center — always available
    "monitoring",     // remote patient monitoring — always available
    "calendar",       // core scheduling — always available
    "users",          // user management — always available
    "branches",       // branch management — always available
    "recalls",        // recall system — always available
    "families",       // family linking — always available
]);

/**
 * Validate that a plan's module map covers all SSOT permission modules.
 * Logs warnings for any SSOT module missing from the plan.
 *
 * @param {Object} planModules - Plan module map: { patients: true, orthodontics: true, ... }
 * @param {Object} [options]
 * @param {boolean} [options.strict=false] - If true, throw instead of warn
 * @param {string}  [options.planName]     - Plan name for log context
 * @returns {{ valid: boolean, missing: string[], exempt: string[] }}
 */
function validatePlanModuleSync(planModules, options = {}) {
    const { strict = false, planName = "unknown" } = options;
    const moduleMap = deriveModuleMap();
    const splotModules = Object.keys(moduleMap);

    const missing = [];
    const exempt = [];

    for (const mod of splotModules) {
        if (ENTITLEMENT_EXEMPT_MODULES.has(mod)) {
            exempt.push(mod);
            continue;
        }

        if (planModules && !(mod in planModules)) {
            missing.push(mod);
        }
    }

    if (missing.length > 0) {
        const msg = `[entitlementSync] Plan "${planName}" is missing ${missing.length} SSOT module(s): ${missing.join(", ")}`;

        if (strict) {
            throw new Error(`🚨 ENTITLEMENT SYNC FAILURE: ${msg}`);
        }

        logger.warn({
            event: "ENTITLEMENT_MODULE_DESYNC",
            planName,
            missing,
            exempt,
            totalSSOT: splotModules.length,
        }, msg);
    }

    return {
        valid: missing.length === 0,
        missing,
        exempt,
    };
}

/**
 * Derive the list of entitlement-eligible modules from the SSOT.
 * Excludes infrastructure modules that are always available.
 *
 * @returns {string[]} Modules that should appear in subscription plans
 */
function getEntitlementModules() {
    const moduleMap = deriveModuleMap();
    return Object.keys(moduleMap).filter(mod => !ENTITLEMENT_EXEMPT_MODULES.has(mod));
}

/**
 * Derive ALL modules from the SSOT (including exempt ones).
 *
 * @returns {string[]} All permission module names
 */
function deriveModules() {
    return Object.keys(deriveModuleMap());
}

module.exports = {
    validatePlanModuleSync,
    getEntitlementModules,
    deriveModules,
    ENTITLEMENT_EXEMPT_MODULES,
};
