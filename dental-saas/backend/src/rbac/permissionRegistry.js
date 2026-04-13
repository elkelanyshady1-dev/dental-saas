/**
 * permissionRegistry.js — Permission Module Registry (SSOT Derivative)
 *
 * Derives the module→actions structure from the P enum in orgPermissions.js.
 * This is the SINGLE computational source for all schema generation,
 * seed building, drift detection, and frontend type exports.
 *
 * ┌──────────────────────────┐
 * │   orgPermissions.js      │  ← SSOT (P enum + ORG_ROLE_PERMISSIONS)
 * │        ↓                 │
 * │   permissionRegistry.js  │  ← THIS FILE (derived structures)
 * │        ↓                 │
 * │   Schema / Seeds / Types │  ← Generated outputs
 * └──────────────────────────┘
 *
 * PLANE: Org only.
 * RULE: NEVER edit this file to add permissions. Edit orgPermissions.js instead.
 */

"use strict";

const { P, ORG_ROLE_PERMISSIONS, ORG_ROLES } = require("./orgPermissions");

// ─── Permission Version ─────────────────────────────────────────────────────
// Bump this version when the SSOT shape changes (new modules, renamed actions).
// On server boot, autoFixPermissions() upgrades any Role document whose
// permissionVersion < PERMISSION_VERSION.
//
// v4 — Phase 13: Added bonding.read / bonding.manage / bonding.settings
//      to Role documents for doctor, org_admin, assistant, lab_technician.
//      Force re-heal so existing roles pinned at v3 receive the new fields.
// v5 — Phase 13: Added tads.read / tads.manage / tads.settings
//      to Role documents for org_admin, doctor, assistant, lab_technician.
//      Force re-heal so existing roles pinned at v4 receive TADs permissions.
// v6 — Phase 14: Added orthodontics.manage / orthodontics.settings /
//      sequence.read / sequence.manage. Enables permission inheritance so
//      engine permissions (bonding/tads/sequence) cascade from orthodontics.manage.
// v7 — Phase H: Added permission hierarchy (manage ⊃ create/update/read/delete).
//      Role documents with version < 7 will be auto-healed to include
//      all orthodontics permissions based on the hierarchy.
//      Hierarchy is enforced at runtime by authorize.js — no duplication in DB.
// v8 — Phase 30 (RBAC Simplification): Replaced all granular orthodontic engine
//      permissions with 2 domain-level permissions:
//        orthodontics.full → doctor, org_admin  (resolves all engine perms via hierarchy)
//        orthodontics.read → assistant, lab_technician (resolves engine reads via hierarchy)
//      Removed from roles: orthodontics.create/update/delete/manage/settings,
//        bonding.*, tads.*, sequence.* (all now internal, hierarchy-resolved).
const PERMISSION_VERSION = 8;

// ─── Module Structure Derivation ────────────────────────────────────────────
// Parses P enum values ("module.action") into { module: Set<action> }

/**
 * Derive the module→actions map from the P enum.
 * Handles aliases (e.g. FINANCE_READ → "accounting.read") by deduplication.
 * @returns {Record<string, string[]>} e.g. { patients: ["read","create","update","delete"] }
 */
function deriveModuleMap() {
    const map = {};
    const seen = new Set();

    for (const [constName, permString] of Object.entries(P)) {
        if (seen.has(permString)) continue; // skip aliases (FINANCE_READ → accounting.read)
        seen.add(permString);

        const dotIdx = permString.indexOf(".");
        if (dotIdx === -1) continue;

        const mod = permString.substring(0, dotIdx);
        const action = permString.substring(dotIdx + 1);

        if (!map[mod]) map[mod] = [];
        if (!map[mod].includes(action)) {
            map[mod].push(action);
        }
    }

    return map;
}

/**
 * Build a Mongoose-compatible schema fragment for the `permissions` field.
 * Each module becomes a sub-object with Boolean fields per action.
 *
 * @returns {Object} Mongoose schema definition for `permissions`
 */
function generateSchemaDefinition() {
    const moduleMap = deriveModuleMap();
    const schema = {};

    for (const [mod, actions] of Object.entries(moduleMap)) {
        schema[mod] = {};
        for (const action of actions) {
            schema[mod][action] = { type: Boolean, default: false };
        }
    }

    return schema;
}

/**
 * Build permission seed for a specific role from ORG_ROLE_PERMISSIONS.
 * Produces the complete nested object with true/false for every module.action.
 *
 * @param {string} roleName - e.g. "org_admin"
 * @returns {Object} Permission seed object matching schema shape
 */
function generateRoleSeed(roleName) {
    const moduleMap = deriveModuleMap();
    const rolePerms = ORG_ROLE_PERMISSIONS[roleName];

    if (!rolePerms) {
        throw new Error(`[permissionRegistry] Unknown role: "${roleName}". Valid roles: ${ORG_ROLES.join(", ")}`);
    }

    const rolePermSet = new Set(rolePerms);
    const seed = {};

    for (const [mod, actions] of Object.entries(moduleMap)) {
        seed[mod] = {};
        for (const action of actions) {
            seed[mod][action] = rolePermSet.has(`${mod}.${action}`);
        }
    }

    return seed;
}

/**
 * Build seeds for ALL system roles.
 * @returns {Record<string, Object>} { org_admin: {...}, doctor: {...}, ... }
 */
function generateAllRoleSeeds() {
    const seeds = {};
    for (const roleName of ORG_ROLES) {
        seeds[roleName] = generateRoleSeed(roleName);
    }
    return seeds;
}

/**
 * Flatten role permissions into dot-notation string set.
 * Used by authMiddleware for O(1) permissionSet construction.
 *
 * @param {Object} permissions - Nested permissions object from Role document
 * @returns {Set<string>} e.g. Set { "patients.read", "patients.create", ... }
 */
function flattenPermissions(permissions) {
    const flat = new Set();
    if (!permissions || typeof permissions !== "object") return flat;

    // Convert Mongoose subdocument to plain object to avoid iterating
    // over internal Mongoose properties ($__, _doc, isNew, etc.)
    const plain = typeof permissions.toJSON === "function"
        ? permissions.toJSON()
        : permissions;

    for (const mod in plain) {
        if (typeof plain[mod] === "object" && plain[mod] !== null) {
            for (const action in plain[mod]) {
                if (plain[mod][action] === true) {
                    flat.add(`${mod}.${action}`);
                }
            }
        }
    }

    return flat;
}

/**
 * Flatten to plain object (for frontend API responses).
 * @param {Object} permissions - Nested permissions object
 * @returns {Object} e.g. { "patients.read": true, "patients.create": true, ... }
 */
function flattenPermissionsToObject(permissions) {
    const flat = {};
    if (!permissions || typeof permissions !== "object") return flat;

    for (const mod in permissions) {
        if (typeof permissions[mod] === "object" && permissions[mod] !== null) {
            for (const action in permissions[mod]) {
                if (permissions[mod][action] === true) {
                    flat[`${mod}.${action}`] = true;
                }
            }
        }
    }

    return flat;
}

/**
 * Generate flat permission key array for frontend consumption.
 * @returns {string[]} e.g. ["patients.read", "patients.create", ...]
 */
function generatePermissionKeys() {
    const moduleMap = deriveModuleMap();
    const keys = [];

    for (const [mod, actions] of Object.entries(moduleMap)) {
        for (const action of actions) {
            keys.push(`${mod}.${action}`);
        }
    }

    return keys;
}

/**
 * Get the derived module map (cached per process).
 * @returns {Record<string, string[]>}
 */
function getModuleMap() {
    return deriveModuleMap();
}

/**
 * Derive the list of all permission module names from the SSOT.
 * @returns {string[]} e.g. ["patients", "appointments", ...]
 */
function deriveModules() {
    return Object.keys(deriveModuleMap());
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    PERMISSION_VERSION,
    deriveModuleMap,
    deriveModules,
    generateSchemaDefinition,
    generateRoleSeed,
    generateAllRoleSeeds,
    flattenPermissions,
    flattenPermissionsToObject,
    generatePermissionKeys,
    getModuleMap,
};
