/**
 * role.dto.js — Role response DTO (Phase B)
 *
 * Authoritative shape for role data returned from the org plane. Per
 * CLAUDE.md §7, controllers MUST return DTOs — never raw Mongoose docs.
 *
 * The DTO flattens the nested `permissions` sub-document into a dotted
 * string array so the frontend can feed it straight into a permission Set:
 *   { patients: { read: true, create: false } }
 *   → ["patients.read"]
 *
 * This matches what authMiddleware puts on `req.context.permissions` — the
 * frontend gets exactly the same Set shape it will see at runtime.
 */

"use strict";

const { flattenPermissions } = require("@rbac/permissionRegistry");

const ROLE_DTO_VERSION = "1.0.0";

function iso(d) {
    if (!d) return null;
    try { return new Date(d).toISOString(); } catch { return null; }
}

/**
 * Build a Role DTO.
 *
 * @param {Object} role - lean role doc or Mongoose doc
 * @param {number} [userCount=0] - number of active users assigned to this role
 * @returns {Object|null}
 */
function buildRoleDTO(role, userCount = 0) {
    if (!role) return null;

    // flattenPermissions returns Set<string>; the DTO exposes an array so
    // it serializes cleanly over JSON.
    const permSet = flattenPermissions(role.permissions);
    const permissions = Array.from(permSet).sort();

    return {
        id: role._id?.toString() ?? null,
        name: role.name,
        description: role.description ?? null,
        isSystemRole: role.isSystemRole === true,
        permissions,        // dotted-key array, sorted, deterministic
        permissionVersion: role.permissionVersion ?? null,
        userCount: Number.isFinite(userCount) ? userCount : 0,
        createdAt: iso(role.createdAt),
        updatedAt: iso(role.updatedAt),
    };
}

function buildRoleListDTO(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => buildRoleDTO(r, r.userCount || 0));
}

function envelope(data) {
    return {
        success: true,
        version: ROLE_DTO_VERSION,
        data,
    };
}

module.exports = {
    ROLE_DTO_VERSION,
    buildRoleDTO,
    buildRoleListDTO,
    envelope,
};
