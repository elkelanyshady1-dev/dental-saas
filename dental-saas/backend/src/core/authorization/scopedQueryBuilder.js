/**
 * scopedQueryBuilder.js
 * v4.6 — Visibility Governance Layer
 * 
 * Translates permission scopes into deterministic MongoDB query fragments.
 */

"use strict";

/**
 * buildScopedQuery
 * @param {string} domain - "patients" | "finance" | "appointments" | "inventory"
 * @param {string} scope - "ALL" | "BRANCH" | "OWN"
 * @param {Object} user - Authenticated user object
 * @param {string} activeBranchId - Current branch context
 */
function buildScopedQuery({ domain, scope, user, activeBranchId }) {
    // 1. Security Invariants
    if (!user || !user.organizationId) {
        throw new Error("Security Violation: organizationId missing in query builder.");
    }

    const organizationId = user.organizationId;
    const baseQuery = { organizationId };

    // 2. Resolve Scope
    if (scope === "ALL") {
        return baseQuery;
    }

    if (scope === "BRANCH") {
        if (!activeBranchId) {
            throw new Error("Scope Violation: activeBranchId required for BRANCH visibility.");
        }
        return { ...baseQuery, branchId: activeBranchId };
    }

    if (scope === "OWN") {
        switch (domain) {
            case "patients":
                return { ...baseQuery, visibleToDoctors: user._id };

            case "finance":
                return { ...baseQuery, visibleToDoctors: user._id };

            case "appointments":
                return { ...baseQuery, doctorId: user._id };

            case "inventory":
                // Inventory OWN is not allowed, downgrade to BRANCH
                if (!activeBranchId) {
                    throw new Error("Scope Violation: activeBranchId required for inventory visibility.");
                }
                return { ...baseQuery, branchId: activeBranchId };

            default:
                throw new Error(`Scope Violation: Invalid domain '${domain}' for OWN scope.`);
        }
    }

    // Default: Fallback to organization filter only (Sovereign Safety)
    return baseQuery;
}

module.exports = {
    buildScopedQuery
};
