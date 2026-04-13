/**
 * policyDebugger.js — Policy Simulation & Debug Engine
 *
 * Provides a simulation engine that evaluates ALL policies for a given
 * user context WITHOUT actually performing the request. This enables:
 *
 *   - Real-time policy debugging (why was I denied?)
 *   - Policy simulation (what would happen if user X tried action Y?)
 *   - Complete visibility into the multi-layer authorization chain
 *   - Cross-referencing RBAC × Entitlement × PBAC × Field Guard
 *
 * Unlike the permissionDebug controller (which shows RBAC + Entitlement),
 * this debugger adds PBAC policy resolution and field-level access into
 * the picture.
 *
 * Output example for a single permission:
 *   {
 *     permission: "patients.update",
 *     rbac: { granted: true, source: "permissionSet" },
 *     entitlement: { enabled: true, source: "planModules" },
 *     pbac: {
 *       allowed: true,
 *       effect: "allow",
 *       matchedRule: "Doctors can update their own patients",
 *       evaluatedRules: 3
 *     },
 *     fieldAccess: {
 *       read: ["*"],
 *       write: ["*"],
 *       writeMode: "full_access"
 *     },
 *     final: true
 *   }
 *
 * PLANE: Org only.
 * ACCESS: security.manage permission required.
 * ENVIRONMENT: DEV/STAGING only — disabled in production.
 */

"use strict";

const { resolveAccess } = require("./accessResolver");
const { evaluatePolicy } = require("./policyEvaluator");
const { policies } = require("./policyRegistry");
const { fieldAccess } = require("./fieldAccessRegistry");
const { writeAccess } = require("./fieldWriteGuard");
const { generatePermissionKeys, deriveModuleMap } = require("./permissionRegistry");
const logger = require("@utils/logger");

// ─── Full Permission Simulation ─────────────────────────────────────────────

/**
 * Simulate the complete authorization decision for a single permission.
 *
 * @param {Object} params
 * @param {string} params.permission — dot-notation permission key
 * @param {Object} params.user — the authenticated user
 * @param {Object} params.rolePermissions — nested permissions from Role document
 * @param {Object} [params.planModules] — plan modules map
 * @param {Object} [params.resource] — resource to check policies against
 * @param {string} [params.branchId] — active branch context
 * @param {string} [params.organizationId] — org context from JWT
 * @returns {Object} — complete resolution result
 */
function simulatePermission({
    permission,
    user,
    rolePermissions,
    planModules,
    resource = null,
    branchId = null,
    organizationId = null,
}) {
    const dotIdx = permission.indexOf(".");
    const module = dotIdx > -1 ? permission.substring(0, dotIdx) : permission;
    const action = dotIdx > -1 ? permission.substring(dotIdx + 1) : "";
    const roleName = user?.roleId?.name || user?.role || "unknown";

    // ── 1. RBAC Layer ──
    const rbacResult = resolveAccess({ permission, rolePermissions, planModules });

    // ── 2. Entitlement Layer ──
    // (already included in rbacResult from accessResolver)

    // ── 3. PBAC Layer ──
    let pbacResult;
    const hasPolicies = policies[permission] && policies[permission].length > 0;

    if (hasPolicies) {
        const ctx = {
            user,
            resource,
            branchId,
            organizationId: organizationId || user?.organizationId,
            method: action === "create" ? "POST" : action === "delete" ? "DELETE" : action === "update" ? "PUT" : "GET",
            path: `[simulated]/${module}`,
            timestamp: new Date(),
        };

        pbacResult = evaluatePolicy(permission, ctx);
    } else {
        pbacResult = {
            allowed: true,
            reason: "No policy defined — base RBAC sufficient",
            effect: "no_policy",
            matchedRule: null,
            evaluatedRules: [],
        };
    }

    // ── 4. Field Access Layer ──
    const readFields = fieldAccess[module]?.[roleName] || undefined;
    const writeFields = writeAccess[module]?.[roleName] || undefined;

    let writeMode = "denied";
    if (writeFields && writeFields.length === 1 && writeFields[0] === "*") {
        writeMode = "full_access";
    } else if (writeFields && writeFields.length > 0) {
        writeMode = "whitelist";
    }

    let readMode = "denied";
    if (readFields && readFields.length === 1 && readFields[0] === "*") {
        readMode = "full_access";
    } else if (readFields && readFields.length > 0) {
        readMode = "whitelist";
    }

    // ── 5. Final Decision ──
    // All three layers must pass for the request to succeed
    const finalAllowed = rbacResult.final && pbacResult.allowed;

    return {
        permission,
        module,
        action,
        role: roleName,
        rbac: {
            granted: rbacResult.rbac,
            source: "accessResolver",
        },
        entitlement: {
            enabled: rbacResult.entitlement,
            source: "accessResolver",
        },
        pbac: {
            allowed: pbacResult.allowed,
            effect: pbacResult.effect,
            reason: pbacResult.reason,
            matchedRule: pbacResult.matchedRule,
            evaluatedRules: (pbacResult.evaluatedRules || []).length,
            hasPolicies,
            ruleTrace: (pbacResult.evaluatedRules || []).map(r => ({
                effect: r.effect,
                priority: r.priority,
                description: r.description,
                matched: r.matched,
            })),
        },
        fieldAccess: {
            read: readFields || null,
            readMode,
            write: writeFields || null,
            writeMode,
        },
        final: finalAllowed,
        deniedAt: !finalAllowed
            ? (!rbacResult.rbac ? "RBAC" : !rbacResult.entitlement ? "ENTITLEMENT" : "PBAC")
            : null,
    };
}

// ─── Batch Simulation ───────────────────────────────────────────────────────

/**
 * Simulate all SSOT permissions for a user context.
 *
 * @param {Object} params — same as simulatePermission but without permission
 * @returns {Array<Object>} — array of simulation results
 */
function simulateAllPermissions(params) {
    const allKeys = generatePermissionKeys();
    return allKeys.map(permission => simulatePermission({ ...params, permission }));
}

// ─── Debug Matrix (Enhanced) ────────────────────────────────────────────────

/**
 * Generate the complete authorization debug matrix for a user.
 * Combines RBAC + Entitlement + PBAC + Field Access into a single view.
 *
 * @param {Object} params
 * @param {Object} params.user — authenticated user
 * @param {Object} params.rolePermissions — nested permissions from Role document
 * @param {Object} [params.planModules] — plan modules map
 * @param {Object} [params.resource] — optional resource context
 * @param {string} [params.branchId] — branch context
 * @param {string} [params.organizationId] — org context
 * @returns {Object} — comprehensive debug matrix
 */
function generateDebugMatrix(params) {
    const allResults = simulateAllPermissions(params);
    const moduleMap = deriveModuleMap();
    const roleName = params.user?.roleId?.name || params.user?.role || "unknown";

    // Group by module
    const moduleSummary = {};
    for (const [mod, actions] of Object.entries(moduleMap)) {
        const modResults = allResults.filter(r => r.module === mod);
        moduleSummary[mod] = {
            totalActions: actions.length,
            rbacGranted: modResults.filter(r => r.rbac.granted).length,
            entitlementEnabled: modResults.length > 0 ? modResults[0].entitlement.enabled : false,
            pbacAllowed: modResults.filter(r => r.pbac.allowed).length,
            fullyAccessible: modResults.every(r => r.final),
            deniedPermissions: modResults.filter(r => !r.final).map(r => ({
                permission: r.permission,
                deniedAt: r.deniedAt,
            })),
            fieldAccess: {
                readMode: fieldAccess[mod]?.[roleName]
                    ? (fieldAccess[mod][roleName].length === 1 && fieldAccess[mod][roleName][0] === "*" ? "full" : "filtered")
                    : "denied",
                writeMode: writeAccess[mod]?.[roleName]
                    ? (writeAccess[mod][roleName].length === 1 && writeAccess[mod][roleName][0] === "*" ? "full" : "filtered")
                    : "denied",
            },
        };
    }

    // Global stats
    const totalPermissions = allResults.length;
    const rbacGranted = allResults.filter(r => r.rbac.granted).length;
    const entitlementBlocked = allResults.filter(r => !r.entitlement.enabled).length;
    const pbacDenied = allResults.filter(r => r.rbac.granted && r.entitlement.enabled && !r.pbac.allowed).length;
    const finalGranted = allResults.filter(r => r.final).length;

    return {
        role: roleName,
        totalPermissions,
        rbacGranted,
        entitlementBlocked,
        pbacDenied,
        finalGranted,
        finalDenied: totalPermissions - finalGranted,
        moduleSummary,
        matrix: allResults,
    };
}

// ─── Single Permission Explain ──────────────────────────────────────────────

/**
 * Generate a human-readable explanation of why a permission is allowed or denied.
 *
 * @param {Object} result — output from simulatePermission()
 * @returns {string} — human-readable explanation
 */
function explainPermission(result) {
    const parts = [`Permission: ${result.permission} → ${result.final ? "✅ ALLOWED" : "❌ DENIED"}`];

    parts.push(`  RBAC:        ${result.rbac.granted ? "✅ granted" : "❌ not granted"}`);
    parts.push(`  Entitlement: ${result.entitlement.enabled ? "✅ enabled" : "❌ disabled"}`);
    parts.push(`  PBAC:        ${result.pbac.allowed ? "✅ allowed" : "❌ denied"} (${result.pbac.effect})`);

    if (result.pbac.matchedRule) {
        parts.push(`    Rule: "${result.pbac.matchedRule}"`);
    }

    if (result.pbac.ruleTrace && result.pbac.ruleTrace.length > 0) {
        parts.push(`    Evaluated ${result.pbac.ruleTrace.length} rules:`);
        for (const rule of result.pbac.ruleTrace) {
            const status = rule.matched ? (rule.effect === "allow" ? "✅" : "❌") : "⬜";
            parts.push(`      ${status} [${rule.effect}] P${rule.priority}: ${rule.description}`);
        }
    }

    parts.push(`  Fields:`);
    parts.push(`    Read:  ${result.fieldAccess.readMode}`);
    parts.push(`    Write: ${result.fieldAccess.writeMode}`);

    if (!result.final) {
        parts.push(`  ⛔ Denied at: ${result.deniedAt}`);
    }

    return parts.join("\n");
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    simulatePermission,
    simulateAllPermissions,
    generateDebugMatrix,
    explainPermission,
};
