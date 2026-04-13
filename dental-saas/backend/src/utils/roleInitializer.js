/**
 * roleInitializer.js — Organization Role Seeder (Auto-Synced from SSOT)
 *
 * Seeds system roles for a new organization during tenant provisioning.
 *
 * Permission values are AUTO-GENERATED from orgPermissions.js
 * via permissionRegistry.generateRoleSeed().
 *
 * ┌───────────────────────────┐
 * │  orgPermissions.js (SSOT) │
 * │  P enum + ORG_ROLE_PERMS  │
 * │          ↓                │
 * │  permissionRegistry.js    │
 * │          ↓                │
 * │  roleInitializer.js       │  ← Seeds derived, never hardcoded
 * └───────────────────────────┘
 *
 * RULE: Do NOT manually define permission objects here.
 *       Add/change permissions in orgPermissions.js (P enum + ORG_ROLE_PERMISSIONS).
 *       Seeds auto-sync on next server restart.
 *
 * v2.0 — Per-Org DB Isolation:
 *   Accepts options.connection to resolve Role model on the org-specific
 *   database via getModel(). When connection is provided, roles are created
 *   in the org's database (dental_org_<orgId>) instead of the platform DB.
 *
 * PLANE: Org only.
 */

const RoleDef = require("../shared/models/Role");
const { ORG_ROLES } = require("../rbac/orgPermissions");
const { generateRoleSeed } = require("../rbac/permissionRegistry");
const getModel = require("@core/db/getModel");

/**
 * Initialize system roles for a new organization.
 *
 * Creates one Role document per system role (org_admin, doctor, assistant,
 * receptionist, lab_technician) with permissions derived from SSOT.
 *
 * @param {string|ObjectId} organizationId - The organization to seed roles for
 * @param {Object}          [options={}]   - Options
 * @param {mongoose.Connection} [options.connection] - Per-org DB connection (REQUIRED in per-org mode)
 * @returns {Object} Map of { roleName: RoleDocument }
 */
const initializeRolesForOrganization = async (organizationId, options = {}) => {
    const { connection } = options;

    // Resolve Role model: per-org connection is MANDATORY
    if (!connection) {
        throw new Error(
            "[initializeRolesForOrganization] A per-org DB connection is required. " +
            "Pass { connection: orgConn } in options."
        );
    }
    const RoleModel = getModel(connection, RoleDef);

    const roles = {};

    for (const roleName of ORG_ROLES) {
        const permissions = generateRoleSeed(roleName);

        const [role] = await RoleModel.create([{
            name: roleName,
            organizationId,
            isSystemRole: true,
            permissions,
        }]);

        roles[roleName] = role;
    }

    return roles;
};

module.exports = initializeRolesForOrganization;
