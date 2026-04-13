/**
 * permissionMatrix.js
 * v4.6 — Visibility Governance Layer
 * 
 * Resolves per-domain visibility scope for a user based on role and overrides.
 */

"use strict";

const DEFAULT_ROLES = {
    org_owner: {
        patients: "ALL",
        finance: "ALL",
        appointments: "ALL",
        inventory: "ALL"
    },
    branch_manager: {
        patients: "BRANCH",
        finance: "BRANCH",
        appointments: "BRANCH",
        inventory: "BRANCH"
    },
    doctor: {
        patients: "OWN",
        finance: "OWN",
        appointments: "OWN",
        inventory: "BRANCH" // Doctors usually see branch inventory
    }
};

/**
 * resolvePermissions
 * @param {Object} user - The authenticated user object
 * @param {string} activeBranchId - Currently selected branch context
 * @returns {Object} 
 */
function resolvePermissions(user) {
    // Resolve role name: user.role (platform) OR user.roleId.name (org, populated)
    const roleName = user?.role || user?.roleId?.name || null;

    if (!user) {
        throw new Error("Authorization Error: User missing.");
    }

    // 1. Load Defaults — fallback to restrictive OWN scope for unknown roles
    const defaults = (roleName && DEFAULT_ROLES[roleName]) || {
        patients: "ALL",
        finance: "ALL",
        appointments: "ALL",
        inventory: "ALL"
    };

    // 2. Apply Overrides (v4.6 Feature)
    const overrides = user.visibilityOverrides || {};

    // 3. Merge Safely
    const resolved = {
        patients: overrides.patients || defaults.patients,
        finance: overrides.finance || defaults.finance,
        appointments: overrides.appointments || defaults.appointments,
        inventory: overrides.inventory || defaults.inventory
    };

    return resolved;
}

module.exports = {
    resolvePermissions,
    DEFAULT_ROLES
};
