/**
 * enforceScope.js — Branch-Scope Query Enforcement (Phase C RBAC)
 *
 * Injects branch-level scoping into MongoDB queries based on the user's scope.
 * MUST be applied to ALL queries that return branch-associated data.
 *
 * Rule: ALLOW = hasPermission AND withinScope
 *
 * Usage:
 *   const query = enforceScope({ status: "active" }, req);
 *   const patients = await Patient.find(query).lean();
 *
 * Scope types:
 *   "org"    → no branch filter (user can see all branches)
 *   "branch" → branchId: { $in: scope.branchIds }
 *
 * @param {Object} query            Base MongoDB query
 * @param {Object} req              Express request with req.context.scope
 * @param {Object} [options]
 * @param {string} [options.branchField="branchId"]  Field name for branch scoping
 * @returns {Object} Scoped MongoDB query
 */
"use strict";

function enforceScope(query, req, options = {}) {
    const { branchField = "branchId" } = options;
    const scope = req.context?.scope;

    // No scope or org-wide → return query unchanged
    if (!scope || scope.type === "org") return query;

    // Branch-scoped → inject $in filter
    if (scope.type === "branch" && scope.branchIds?.length > 0) {
        return {
            ...query,
            [branchField]: { $in: scope.branchIds },
        };
    }

    // Fallback: scope.type === "branch" but no branchIds → deny all
    // This should never happen (pre-save validates), but fail-closed.
    return {
        ...query,
        [branchField]: { $in: [] },
    };
}

module.exports = enforceScope;
