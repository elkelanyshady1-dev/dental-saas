/**
 * accessResolver.js — Centralized RBAC × Entitlement Access Resolution Engine
 *
 * Computes the FINAL access decision by combining:
 *   1. RBAC (Role-based) — is the permission granted to this role?
 *   2. Entitlement (Plan-based) — is the module enabled in the subscription?
 *
 * The formula is:  FINAL = RBAC && ENTITLEMENT
 *
 * ┌─────────┐  ┌──────────────┐
 * │  RBAC   │  │ Entitlement  │
 * │ (Role)  │  │   (Plan)     │
 * └────┬────┘  └──────┬───────┘
 *      │              │
 *      ▼              ▼
 *   ┌────────────────────────┐
 *   │    accessResolver      │  ← THIS FILE
 *   │    resolveAccess()     │
 *   └────────────────────────┘
 *           │
 *           ▼
 *     { rbac, entitlement, final }
 *
 * USAGE:
 *   const { resolveAccess } = require("@rbac/accessResolver");
 *   const result = resolveAccess({
 *       permission: "patients.create",
 *       rolePermissions: user.roleId.permissions,
 *       planModules: organization.features,
 *   });
 *   // result = { rbac: true, entitlement: true, final: true, module: "patients", action: "create" }
 *
 * WHY THIS EXISTS:
 *   Without centralized resolution, RBAC and Entitlement decisions are
 *   computed ad-hoc in middleware, debug panels, and frontend hooks.
 *   If future logic changes (e.g. ABAC policy overrides), having a single
 *   resolution function means ONE place to update — not 5+ scattered checks.
 *
 * PLANE: Org only.
 */

"use strict";

const { ENTITLEMENT_EXEMPT_MODULES } = require("../core/entitlements/validateEntitlementSync");

/**
 * Resolve access for a single permission key.
 *
 * @param {Object} params
 * @param {string} params.permission      - Dot-notation permission key (e.g. "patients.create")
 * @param {Object} params.rolePermissions - Nested permissions object from Role document
 * @param {Object} [params.planModules]   - Plan modules map: { patients: true, orthodontics: true }
 * @returns {{ rbac: boolean, entitlement: boolean, final: boolean, module: string, action: string }}
 */
function resolveAccess({ permission, rolePermissions, planModules }) {
    const dotIdx = permission.indexOf(".");
    if (dotIdx === -1) {
        return { rbac: false, entitlement: false, final: false, module: permission, action: "" };
    }

    const module = permission.substring(0, dotIdx);
    const action = permission.substring(dotIdx + 1);

    // ─── RBAC Layer ──────────────────────────────────────────────────────
    // Check the Role document's nested permissions object.
    const rbac = !!(
        rolePermissions &&
        rolePermissions[module] &&
        rolePermissions[module][action] === true
    );

    // ─── Entitlement Layer ───────────────────────────────────────────────
    // Exempt modules (core infrastructure) are always entitled.
    // If no plan data is available, default to entitled (fail-open for
    // entitlement layer — RBAC still gates access).
    let entitlement;
    if (ENTITLEMENT_EXEMPT_MODULES.has(module)) {
        entitlement = true;
    } else if (!planModules) {
        entitlement = true;
    } else {
        entitlement = !!planModules[module];
    }

    // ─── Final Decision ──────────────────────────────────────────────────
    // Both layers must grant access. This is the AND gate.
    return {
        rbac,
        entitlement,
        final: rbac && entitlement,
        module,
        action,
    };
}

/**
 * Resolve access for ALL SSOT permission keys.
 * Used by the debug panel and batch permission checks.
 *
 * @param {Object} params
 * @param {Object} params.rolePermissions - Nested permissions object from Role document
 * @param {Object} [params.planModules]   - Plan modules map
 * @returns {Array<{ permission: string, rbac: boolean, entitlement: boolean, final: boolean, module: string, action: string }>}
 */
function resolveAllAccess({ rolePermissions, planModules }) {
    const { generatePermissionKeys } = require("./permissionRegistry");
    const allKeys = generatePermissionKeys();

    return allKeys.map(permission => ({
        permission,
        ...resolveAccess({ permission, rolePermissions, planModules }),
    }));
}

/**
 * Build a flat Set of FINAL granted permissions.
 * Provides a drop-in replacement for the ad-hoc permissionSet construction
 * currently done in authMiddleware.
 *
 * @param {Object} params
 * @param {Object} params.rolePermissions - Nested permissions object from Role document
 * @param {Object} [params.planModules]   - Plan modules map
 * @returns {Set<string>} Set of finally-granted permission keys
 */
function resolvePermissionSet({ rolePermissions, planModules }) {
    const { generatePermissionKeys } = require("./permissionRegistry");
    const allKeys = generatePermissionKeys();
    const granted = new Set();

    for (const key of allKeys) {
        const result = resolveAccess({ permission: key, rolePermissions, planModules });
        if (result.final) {
            granted.add(key);
        }
    }

    return granted;
}

module.exports = {
    resolveAccess,
    resolveAllAccess,
    resolvePermissionSet,
};
