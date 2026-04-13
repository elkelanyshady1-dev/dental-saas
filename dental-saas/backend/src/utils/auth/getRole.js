/**
 * getRole.js — JWT-Authoritative Auth Helpers
 * DentalSaaS — Org Plane
 *
 * RULE: NEVER read req.user.roleId or req.user.role during a request.
 *   - req.user.roleId is a raw (unpopulated) ObjectId after Phase 6.
 *   - req.user.role does not exist on org-plane User documents.
 *
 * ALWAYS use these helpers instead.
 * They read exclusively from req.context, which is built from the JWT
 * by authMiddleware and is stateless, DB-free, and always consistent.
 *
 * PLANE: Org only.
 * USAGE: const { getRole, getPermissions, hasPermission, getOrgId, getBranchId } = require("@utils/auth/getRole");
 */

"use strict";

/**
 * Returns the authenticated user's role name from the JWT context.
 *
 * @param {import("express").Request} req
 * @returns {string|null} e.g. "org_admin", "doctor" — or null if not authenticated
 */
function getRole(req) {
    return req?.context?.roleName || null;
}

/**
 * Returns the authenticated user's permission Set from the JWT context.
 *
 * @param {import("express").Request} req
 * @returns {Set<string>} — empty Set if not authenticated
 */
function getPermissions(req) {
    return req?.context?.permissions || new Set();
}

/**
 * Checks if the authenticated user has a specific permission.
 *
 * @param {import("express").Request} req
 * @param {string} permission — dot-notation permission string, e.g. "patients.read"
 * @returns {boolean}
 */
function hasPermission(req, permission) {
    return getPermissions(req).has(permission);
}

/**
 * Returns the authenticated organization ID from JWT context.
 *
 * @param {import("express").Request} req
 * @returns {import("mongoose").Types.ObjectId|null}
 */
function getOrgId(req) {
    return req?.context?.organizationId || null;
}

/**
 * Returns the active branch ID for this request (set by branchContext middleware).
 *
 * @param {import("express").Request} req
 * @returns {import("mongoose").Types.ObjectId|null}
 */
function getBranchId(req) {
    return req?.context?.branchId || null;
}

module.exports = {
    getRole,
    getPermissions,
    hasPermission,
    getOrgId,
    getBranchId,
};
