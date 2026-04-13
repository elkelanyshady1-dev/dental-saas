/**
 * inspector.service.js — Auth Decision Simulation (Feature Inspector)
 *
 * Simulates the full 4-layer authorization decision for a given permission:
 *   1. Entitlement (plan → module)
 *   2. Feature Flag
 *   3. RBAC
 *   4. PBAC (policy evaluation)
 *
 * This is the "X-ray" for any permission — directly powers the
 * FeatureInspectorDrawer in the frontend.
 *
 * PLANE: Org only.
 */

"use strict";

const { policies } = require("../../../rbac/policyRegistry");
const { evaluatePolicy } = require("../../../rbac/policyEvaluator");
const { parseOrgFeatures } = require("./modules.service");
const logger = require("@utils/logger");

// ─── Permission → Module Key Mapping ────────────────────────────────────────

const PERM_MODULE_MAP = Object.freeze({
    patients: "patients", appointments: "appointments", treatments: "treatments",
    orthodontics: "orthodontics", accounting: "finance", inventory: "inventory",
    security: "security", users: "users", branches: "branches", lab: "lab",
    analytics: "analytics", communication: "communication", dashboard: "dashboard",
    invoices: "finance", payments: "finance", recalls: "patients",
    families: "patients", procedures: "treatments", portal: "portal",
    calendar: "calendar", monitoring: "portal",
});

// ─── Auth Simulation ────────────────────────────────────────────────────────

/**
 * Simulate a full authorization decision for a permission.
 *
 * @param {Object} params
 * @param {string} params.permission — the RBAC permission string (e.g., "patients.update")
 * @param {string} [params.resourceId] — optional resource ID for PBAC evaluation
 * @param {Object} params.org — Organization document
 * @param {Object} params.user — req.user (authenticated user)
 * @returns {Object} — simulation result with decision steps
 */
function simulateDecision({ permission, resourceId, org, user }) {
    const orgModules = org?.modules || {};
    const orgFeatures = parseOrgFeatures(org?.features);

    // ── Step 1: Entitlement (Plan → Module) ────────────────────────────────
    const permModule = permission.split(".")[0];
    const moduleKey = PERM_MODULE_MAP[permModule] || permModule;
    const entitlementPassed = orgModules[moduleKey] !== false;

    // ── Step 2: Feature Flag ───────────────────────────────────────────────
    const flagPassed =
        orgFeatures[`${moduleKey}.disabled`] !== true &&
        orgFeatures[`DISABLE_${moduleKey.toUpperCase()}`] !== true;

    // ── Step 3: RBAC (Role Permission) ─────────────────────────────────────
    const userPerms = user?.permissions || [];
    const rbacPassed = userPerms.includes(permission);

    // ── Step 4: PBAC (Policy Evaluation) ───────────────────────────────────
    let policyResult = { allowed: true, reason: "no policy rules", effect: "no_policy", evaluatedRules: [] };
    try {
        if (policies[permission] && policies[permission].length > 0) {
            policyResult = evaluatePolicy(
                permission,
                {
                    user,
                    userId: user?._id,
                    role: user?.roleId?.slug || user?.roleId?.name || user?.role,
                    branchId: user?.activeBranchId || user?.branchId,
                    organizationId: org?._id?.toString(),
                    method: "SIMULATE",
                    path: "/features-control/inspect",
                    timestamp: new Date(),
                },
                resourceId ? { _id: resourceId } : null
            );
        }
    } catch (err) {
        logger.warn({ err: err.message, permission }, "[InspectorService] Policy evaluation error");
        policyResult = { allowed: true, reason: "policy evaluation skipped (error)", effect: "no_policy", evaluatedRules: [] };
    }

    // ── Decision Steps ─────────────────────────────────────────────────────
    const steps = [
        {
            layer: "Entitlement",
            passed: entitlementPassed,
            detail: entitlementPassed
                ? `Module "${moduleKey}" is enabled`
                : `Module "${moduleKey}" is locked by plan`,
        },
        {
            layer: "Feature Flag",
            passed: flagPassed,
            detail: flagPassed
                ? "No flag override"
                : "Disabled by platform feature flag",
        },
        {
            layer: "RBAC",
            passed: rbacPassed,
            detail: rbacPassed
                ? `Permission "${permission}" granted to role`
                : `Permission "${permission}" not in role`,
        },
        {
            layer: "Policy (PBAC)",
            passed: policyResult.allowed !== false,
            detail: policyResult.reason || (policyResult.allowed ? "allowed" : "denied"),
            evaluatedRules: policyResult.evaluatedRules || [],
        },
    ];

    const finalAllowed = steps.every(s => s.passed);

    return {
        permission,
        allowed: finalAllowed,
        steps,
        moduleKey,
        policyEffect: policyResult.effect,
        user: {
            id: user?._id,
            name: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.email,
            role: user?.roleId?.name || user?.role,
        },
        evaluatedAt: new Date().toISOString(),
    };
}

// ─── Batch Simulation ───────────────────────────────────────────────────────

/**
 * Simulate multiple permissions at once.
 *
 * @param {Object} params
 * @param {string[]} params.permissions — array of permission strings
 * @param {Object} params.org
 * @param {Object} params.user
 * @returns {Object<string, Object>} — keyed by permission string
 */
function simulateBatch({ permissions, org, user }) {
    const results = {};
    for (const perm of permissions) {
        results[perm] = simulateDecision({ permission: perm, org, user });
    }
    return results;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    simulateDecision,
    simulateBatch,
    PERM_MODULE_MAP,
};
