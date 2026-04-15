/**
 * preQuery.guard.js — Pre-Query Guards (V2)
 *
 * These guards modify the MongoDB query BEFORE execution.
 * The DB does the filtering — zero post-fetch waste.
 *
 * Each guard is a factory that returns:
 *   (query, context) => modifiedQuery
 */

"use strict";

// ─── Ownership Scoping ──────────────────────────────────────────────────────

// NOTE: a previous `scopeToDoctor()` helper was removed here. It was dead code
// (zero real call sites) and contained an inline role-name check that violated
// the RBAC SSOT rule. If doctor-level patient scoping is reintroduced later,
// build it against an explicit permission pair (e.g. P.PATIENTS_READ_OWN vs
// P.PATIENTS_READ_ALL) driven by req.context.permissions — never a role name —
// and pick the scoping field from the actual call site instead of hardcoding
// `doctorId`.

/**
 * Scope query to resources owned by or assigned to the current user.
 * Admins bypass this filter.
 *
 * @param {Object} [opts]
 * @param {string[]} [opts.ownerFields] - Fields to check ownership (default: ownerId, assignedTo, createdBy)
 * @returns {Function} Pre-query guard
 */
function scopeToOwner(opts = {}) {
    const fields = opts.ownerFields || ["ownerId", "assignedTo", "createdBy"];

    return (query, { user }) => {
        if (user.hasFullBranchAccess) return query;

        const ownerConditions = fields.map(f => ({ [f]: user._id }));

        return {
            ...query,
            $or: [...(query.$or || []), ...ownerConditions],
        };
    };
}

/**
 * Generic field-value scoping.
 * Adds { [field]: user._id } to the query.
 *
 * @param {string} field - Field name to scope by (e.g., "doctorId", "performedBy")
 * @returns {Function} Pre-query guard
 */
function scopeToField(field) {
    return (query, { user }) => {
        if (user.hasFullBranchAccess) return query;
        return { ...query, [field]: user._id };
    };
}

// ─── Branch Scoping ─────────────────────────────────────────────────────────

/**
 * Scope query to the user's accessible branches.
 * Admins (hasFullBranchAccess) see all branches.
 *
 * @returns {Function} Pre-query guard
 */
function scopeToBranch() {
    return (query, { user }) => {
        if (user.hasFullBranchAccess) return query;

        const branches = user.branchAccess || [];
        if (branches.length === 0) {
            return { ...query, branchId: null };
        }
        if (branches.length === 1) {
            return { ...query, branchId: branches[0] };
        }
        return { ...query, branchId: { $in: branches } };
    };
}

// ─── Visibility Scoping ─────────────────────────────────────────────────────

/**
 * Scope query to resources visible to the current user.
 * Used for shared resources (e.g., patient visible to multiple doctors).
 *
 * @param {string} [visibilityField="visibleToDoctors"] - Array field containing allowed user IDs
 * @returns {Function} Pre-query guard
 */
function scopeToVisible(visibilityField = "visibleToDoctors") {
    return (query, { user }) => {
        if (user.hasFullBranchAccess) return query;
        return { ...query, [visibilityField]: user._id };
    };
}

// ─── Status Scoping ─────────────────────────────────────────────────────────

/**
 * Scope query to only active records.
 *
 * @param {string} [field="isActive"] - Active flag field
 * @returns {Function} Pre-query guard
 */
function scopeToActive(field = "isActive") {
    return (query) => {
        return { ...query, [field]: true };
    };
}

module.exports = {
    scopeToOwner,
    scopeToField,
    scopeToBranch,
    scopeToVisible,
    scopeToActive,
};
