/**
 * conflictEngine.service.js — Smart Conflict Detection Engine
 *
 * Detects 4 categories of conflicts:
 *   1. DEPENDENCY   — module enabled but dependency is disabled
 *   2. FLAG_OVERRIDE — module enabled but platform feature flag overrides
 *   3. PERMISSION_GAP — RBAC grants permission for disabled module
 *   4. SHADOW_MODE   — shadow mode drift (policies logged but not enforced)
 *
 * Each conflict includes:
 *   - severity (critical / high / medium / low)
 *   - recommended action
 *   - source (system / flag / admin)
 *
 * PLANE: Org only.
 */

"use strict";

const { P } = require("../../../rbac/orgPermissions");
const { getShadowConfig } = require("../../../rbac/shadowMode");
const { MODULE_DEPS, parseOrgFeatures } = require("./modules.service");
const logger = require("@utils/logger");
const getModel = require("@core/db/getModel");
const RoleDef = require("../../../shared/models/Role");

// ─── Permission → Module Mapping ────────────────────────────────────────────

const MODULE_PERM_MAP = Object.freeze({
    patients:      [P.PATIENTS_READ, P.PATIENTS_CREATE, P.PATIENTS_UPDATE, P.PATIENTS_DELETE],
    appointments:  [P.APPOINTMENTS_READ, P.APPOINTMENTS_CREATE, P.APPOINTMENTS_UPDATE, P.APPOINTMENTS_DELETE],
    treatments:    [P.TREATMENTS_READ, P.TREATMENTS_CREATE, P.TREATMENTS_UPDATE],
    orthodontics:  [P.ORTHO_READ, P.ORTHO_FULL, P.ORTHO_FULL, P.ORTHO_FULL],
    finance:       [P.ACCOUNTING_READ, P.ACCOUNTING_CREATE, P.ACCOUNTING_UPDATE, P.ACCOUNTING_DELETE],
    inventory:     [P.INVENTORY_READ, P.INVENTORY_CREATE, P.INVENTORY_UPDATE, P.INVENTORY_DELETE],
    security:      [P.SECURITY_READ, P.SECURITY_MANAGE],
    users:         [P.USERS_READ, P.USERS_CREATE, P.USERS_UPDATE, P.USERS_DELETE],
    branches:      [P.BRANCHES_READ, P.BRANCHES_CREATE, P.BRANCHES_UPDATE, P.BRANCHES_DELETE],
    lab:           [P.LAB_READ, P.LAB_CREATE, P.LAB_UPDATE, P.LAB_DELETE],
    communication: [P.COMMUNICATION_READ, P.COMMUNICATION_SEND, P.COMMUNICATION_MANAGE],
    analytics:     [P.ANALYTICS_READ, P.ANALYTICS_EXPORT],
    dashboard:     [P.DASHBOARD_READ, P.DASHBOARD_MANAGE],
});

// ─── Conflict Detection Engine ──────────────────────────────────────────────

/**
 * Run full conflict analysis for an organization.
 *
 * @param {Object} params
 * @param {Object} params.org — Organization Mongoose document
 * @param {string} params.orgId — organization ID
 * @returns {Promise<{conflicts: Array, summary: Object}>}
 */
async function detectConflicts({ org, orgId, req }) {
    const orgModules = org.modules || {};
    const orgFeatures = parseOrgFeatures(org.features);
    const conflicts = [];

    // ── 1. Flag Overrides ──────────────────────────────────────────────────────
    for (const modKey of Object.keys(orgModules)) {
        if (
            orgFeatures[`${modKey}.disabled`] === true ||
            orgFeatures[`DISABLE_${modKey.toUpperCase()}`] === true
        ) {
            conflicts.push({
                id: `flag_override_${modKey}`,
                type: "flag_override",
                severity: "high",
                icon: "🚩",
                message: `${modKey} module is disabled by a platform feature flag`,
                source: "flag",
                moduleKey: modKey,
                recommendation: "Contact platform admin to remove the feature flag override.",
            });
        }
    }

    // ── 2. Missing Dependencies ────────────────────────────────────────────────
    for (const [modKey, depKey] of Object.entries(MODULE_DEPS)) {
        const modEnabled = orgModules[modKey] !== false;
        const depEnabled = orgModules[depKey] !== false;
        if (modEnabled && !depEnabled) {
            conflicts.push({
                id: `missing_dep_${modKey}_${depKey}`,
                type: "missing_dependency",
                severity: "critical",
                icon: "🔗",
                message: `${modKey} depends on ${depKey} which is disabled`,
                source: "system",
                moduleKey: modKey,
                dependencyKey: depKey,
                recommendation: `Enable the ${depKey} module or disable ${modKey}.`,
            });
        }
    }

    // ── 3. Permission Gap Analysis ─────────────────────────────────────────────
    let dbRoles = [];
    try {
        const Role = req.dbConnection
            ? getModel(req.dbConnection, RoleDef)
            : RoleDef.default; // fallback for tests only
        dbRoles = await Role.find({}).lean();
    } catch { /* non-critical */ }

    for (const role of dbRoles) {
        const perms = role.permissions || [];
        for (const [modKey, modPerms] of Object.entries(MODULE_PERM_MAP)) {
            if (orgModules[modKey] === false) {
                const grantedInDisabled = modPerms.filter(p => perms.includes(p));
                if (grantedInDisabled.length > 0) {
                    conflicts.push({
                        id: `perm_gap_${role.slug || role.name}_${modKey}`,
                        type: "permission_gap",
                        severity: "medium",
                        icon: "⚠️",
                        message: `Role "${role.name}" has ${grantedInDisabled.length} permission(s) for disabled module "${modKey}"`,
                        source: "admin",
                        roleKey: role.slug || role.name,
                        moduleKey: modKey,
                        permissions: grantedInDisabled,
                        recommendation: `Remove ${modKey} permissions from "${role.name}" or enable the module.`,
                    });
                }
            }
        }
    }

    // ── 4. Shadow Mode Drift ───────────────────────────────────────────────────
    const shadowConfig = getShadowConfig();
    if (shadowConfig.enabled) {
        conflicts.push({
            id: "shadow_mode_active",
            type: "shadow_mode",
            severity: "low",
            icon: "👁️",
            message: "Policy shadow mode is active — denials are logged but not enforced",
            source: "system",
            recommendation: "Review shadow mode logs and transition to enforcement when ready.",
        });
    }

    // ── Summary ────────────────────────────────────────────────────────────────
    const summary = {
        total: conflicts.length,
        critical: conflicts.filter(c => c.severity === "critical").length,
        high: conflicts.filter(c => c.severity === "high").length,
        medium: conflicts.filter(c => c.severity === "medium").length,
        low: conflicts.filter(c => c.severity === "low").length,
    };

    return { conflicts, summary };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    detectConflicts,
    MODULE_PERM_MAP,
};
