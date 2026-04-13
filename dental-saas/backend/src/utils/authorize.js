/**
 * authorize.js — Controller-Level Authorization (Phase 30 FINAL)
 *
 * Reads from req.context.permissions (Set<string>) built from JWT.
 *
 * PERMISSION MODEL (Phase 30 FINAL):
 *   Orthodontics domain is fully migrated to a two-permission model.
 *   Controllers use orthodontics.full (mutations) or orthodontics.read (reads) directly.
 *   No engine-level inheritance is required for the ortho domain.
 *
 *   For non-ortho modules, manage→read derivations are handled by PERMISSION_HIERARCHY
 *   in permissionHierarchy.js (accounting.manage, security.manage, etc.).
 *
 * PERMISSION REGISTRY (Phase 30 FINAL — Phase 7: Drift Elimination):
 *   PERMISSION_REGISTRY is the definitive whitelist of all valid permission strings.
 *   Any authorize() call with a string NOT in this registry throws INVALID_PERMISSION_CONFIG
 *   at runtime, surfacing configuration drift immediately.
 *
 *   Registry is built from:
 *     1. All P enum values from orgPermissions.js (SSOT)
 *     2. PERMISSION_HIERARCHY keys (manage-level permissions)
 *   No manual additions. If it's not in P, it does not exist.
 *
 * USAGE:
 *   const { can, authorize } = require("@utils/authorize");
 *   authorize(req, "orthodontics.full");   // mutations
 *   authorize(req, "orthodontics.read");   // reads
 *
 * PLANE: Org-plane only.
 */

"use strict";

const logger = require("@utils/logger");
const { PERMISSION_HIERARCHY, buildInheritanceMap } = require("../rbac/permissionHierarchy");

// ─── PERMISSION_INHERITANCE (Phase 30 FINAL) ─────────────────────────────────
// Engine-specific inheritance entries have been REMOVED because all orthodontic
// controllers now use orthodontics.full / orthodontics.read directly.
//
// Only non-ortho cross-permission mappings remain (none currently needed at the
// flat-map level — PERMISSION_HIERARCHY covers all manage→read derivations).
const PERMISSION_INHERITANCE = Object.freeze({});

// ─── Merged Inheritance Map ───────────────────────────────────────────────────
// Built once at require() time. Combines PERMISSION_INHERITANCE (empty for now)
// with hierarchy-derived manage→read derivations from permissionHierarchy.js.
const INHERITANCE_MAP = buildInheritanceMap(PERMISSION_INHERITANCE);

// ─── Permission Registry (Boot-Time Drift Elimination — Phase 7) ─────────────
// Definitive whitelist of ALL valid permission strings.
// Built exclusively from the P enum — no manual additions allowed.
// Any controller calling authorize() with an unregistered string gets a 500 immediately.
const { P } = require("../rbac/orgPermissions");

const PERMISSION_REGISTRY = new Set([
    ...Object.values(P),
    ...Object.keys(PERMISSION_HIERARCHY),
]);

// ─── Boot-Time Validation ─────────────────────────────────────────────────────
// Verify all hierarchy keys exist in P enum (catch typos at startup).
for (const key of Object.keys(PERMISSION_HIERARCHY)) {
    if (!PERMISSION_REGISTRY.has(key)) {
        throw new Error(
            `[authorize] BOOT FAIL: PERMISSION_HIERARCHY key "${key}" is not in the P enum. ` +
            `Update orgPermissions.js or remove the hierarchy entry.`
        );
    }
}

/**
 * can — Check if a user has a permission (direct or inherited).
 *
 * Resolution order:
 *   1. Direct:    user's permission set contains the exact string       O(1)
 *   2. Inherited: any parent permission in INHERITANCE_MAP grants it    O(parents)
 *
 * @param {Object} req        — Express request (req.context.permissions must be Set<string>)
 * @param {string} permission — Permission string to check
 * @returns {boolean}
 */
function can(req, permission) {
    const perms = req.context?.permissions;
    if (!perms) return false;

    // 1. Direct check
    if (perms.has(permission)) return true;

    // 2. Inherited check
    const parents = INHERITANCE_MAP.get(permission);
    if (parents) {
        for (const parent of parents) {
            if (perms.has(parent)) {
                logger.debug({
                    permission,
                    hasDirect: false,
                    hasParent: true,
                    parent,
                    roleName:  req.context?.roleName ?? "unknown",
                    userId:    req.context?.userId?.toString() ?? "unknown",
                }, `[authorize] "${permission}" granted via hierarchy from "${parent}"`);
                return true;
            }
        }
    }

    return false;
}

/**
 * authorize — Enforce a permission or throw 403.
 *
 * Phase 7 Drift Guard: throws 500 immediately if permission is not in PERMISSION_REGISTRY.
 * This surfaces configuration errors (typos, deleted permissions still in code) at runtime
 * rather than silently granting or denying access.
 *
 * @param {Object} req        — Express request
 * @param {string} permission — Required permission string (must be in P enum)
 * @throws {Error} 500 if permission not in registry; 403 if user lacks permission
 */
function authorize(req, permission) {
    // ── Phase 7: Drift Elimination Guard ────────────────────────────────────
    if (!PERMISSION_REGISTRY.has(permission)) {
        logger.error({
            event:      "INVALID_PERMISSION_CONFIG",
            permission,
            endpoint:   `${req.method} ${req.originalUrl}`,
            roleName:   req.context?.roleName   ?? "unknown",
        }, `[authorize] FATAL: Unknown permission "${permission}" — not in PERMISSION_REGISTRY. Fix the controller.`);
        const err = new Error(`INVALID_PERMISSION_CONFIG: "${permission}" is not a registered permission`);
        err.status     = 500;
        err.statusCode = 500;
        err.code       = "INVALID_PERMISSION_CONFIG";
        throw err;
    }

    logger.warn({
        event:           "RBAC_CHECK",
        required:        permission,
        hasDirect:       req.context?.permissions?.has(permission) ?? false,
        parents:         INHERITANCE_MAP.get(permission) ?? [],
        roleName:        req.context?.roleName         ?? "unknown",
        userId:          req.context?.userId?.toString() ?? "unknown",
        organizationId:  req.context?.organizationId?.toString() ?? "unknown",
        endpoint:        `${req.method} ${req.originalUrl}`,
        permissionCount: req.context?.permissions?.size ?? 0,
    }, `[authorize] RBAC check for "${permission}"`);

    if (can(req, permission)) return;

    logger.warn({
        event:           "PERMISSION_DENIED",
        required:        permission,
        inherited:       INHERITANCE_MAP.get(permission) ?? [],
        roleName:        req.context?.roleName         ?? "unknown",
        userId:          req.context?.userId?.toString() ?? "unknown",
        organizationId:  req.context?.organizationId?.toString() ?? "unknown",
        endpoint:        `${req.method} ${req.originalUrl}`,
    }, `[authorize] Access denied — "${permission}" not in role`);

    const err = new Error("Forbidden");
    err.status     = 403;
    err.statusCode = 403;
    err.code       = "PERMISSION_DENIED";
    throw err;
}

module.exports = { can, authorize, PERMISSION_INHERITANCE, INHERITANCE_MAP, PERMISSION_REGISTRY };
