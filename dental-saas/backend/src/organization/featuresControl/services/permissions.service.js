/**
 * permissions.service.js — Live Role × Permission Matrix Builder
 *
 * Builds the full role × permission matrix from the database:
 *   - Reads all roles for the organization from MongoDB
 *   - Cross-references against the P enum (SSOT)
 *   - Returns a matrix showing which role has which permission
 *
 * PLANE: Org only.
 */

"use strict";

const { P } = require("../../../rbac/orgPermissions");
const logger = require("@utils/logger");
const getModel = require("@core/db/getModel");
const RoleDef = require("../../../shared/models/Role");

/**
 * Build the live role × permission matrix for an organization.
 *
 * @param {string} orgId — organization ID (from JWT)
 * @param {Object} req — express request (used for RLS and dbConnection)
 * @returns {Promise<{roles: Array, permissions: Array, matrix: Object}>}
 */
async function buildPermissionMatrix(orgId, req) {
    if (!req.dbConnection) {
        throw new Error("[PermissionsService] req.dbConnection is required for per-org Role resolution");
    }
    const Role = getModel(req.dbConnection, RoleDef);
    const dbRoles = await Role.find({}).lean();

    const roles = [];
    const matrix = {};

    for (const role of dbRoles) {
        const roleName = role.name;
        const roleKey = role.slug || roleName.toLowerCase().replace(/\s+/g, "_");
        roles.push({
            key: roleKey,
            name: roleName,
            id: role._id.toString(),
            isSystem: role.isSystem || false,
            permissionCount: (role.permissions || []).length,
        });

        const perms = role.permissions || [];
        matrix[roleKey] = {};

        for (const perm of Object.values(P)) {
            if (perms.includes(perm)) {
                matrix[roleKey][perm] = "granted";
            } else {
                matrix[roleKey][perm] = false;
            }
        }
    }

    // Build deduplicated permissions list
    const seen = new Set();
    const permissions = Object.entries(P)
        .map(([_constName, permStr]) => ({
            key: permStr,
            label: permStr.replace(".", " — ").replace(/^\w/, c => c.toUpperCase()),
            module: permStr.split(".")[0],
        }))
        .filter(p => {
            if (seen.has(p.key)) return false;
            seen.add(p.key);
            return true;
        });

    return { roles, permissions, matrix };
}

/**
 * Get the permission coverage summary.
 * Shows how many permissions are covered per role and total coverage.
 *
 * @param {Object} matrixData — output from buildPermissionMatrix
 * @returns {Object}
 */
function computeCoverageSummary(matrixData) {
    const { roles, permissions, matrix } = matrixData;
    const totalPerms = permissions.length;

    const roleCoverage = {};

    for (const role of roles) {
        const roleMatrix = matrix[role.key] || {};
        const granted = Object.values(roleMatrix).filter(v => v === "granted").length;
        roleCoverage[role.key] = {
            name: role.name,
            granted,
            total: totalPerms,
            percentage: totalPerms > 0 ? Math.round((granted / totalPerms) * 100) : 0,
        };
    }

    return {
        totalPermissions: totalPerms,
        totalRoles: roles.length,
        roleCoverage,
    };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    buildPermissionMatrix,
    computeCoverageSummary,
};
