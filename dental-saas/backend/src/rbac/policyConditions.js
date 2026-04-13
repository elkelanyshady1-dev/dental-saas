/**
 * policyConditions.js — Shared Policy Condition Helpers
 *
 * Centralized, reusable condition functions for the PBAC engine.
 * All policy definitions in policyRegistry.js MUST use these helpers
 * instead of inline role checks or ad-hoc comparisons.
 *
 * Benefits:
 *   - Single source of truth for condition logic
 *   - Testable in isolation
 *   - Prevents drift between duplicate inline checks
 *   - Enables condition composition via combinators
 *
 * PLANE: Org only.
 */

"use strict";

// ─── Role Conditions ────────────────────────────────────────────────────────

/**
 * Higher-order: check if user has a specific role.
 * Handles both populated roleId and plain role string.
 * @param {string} role — role name (e.g., "org_admin", "doctor")
 * @returns {(ctx: Object) => boolean}
 */
function hasRole(role) {
    return (ctx) => {
        if (!ctx.user) return false;
        const userRole = ctx.user.roleId?.name || ctx.user.role;
        return userRole === role;
    };
}

/** Check if user is org_admin. */
const isOrgAdmin = (ctx) => hasRole("org_admin")(ctx);

/** Check if user is a doctor. */
const isDoctor = (ctx) => hasRole("doctor")(ctx);

/** Check if user is an assistant. */
const isAssistant = (ctx) => hasRole("assistant")(ctx);

/** Check if user is a receptionist. */
const isReceptionist = (ctx) => hasRole("receptionist")(ctx);

/** Check if user is a lab technician. */
const isLabTechnician = (ctx) => hasRole("lab_technician")(ctx);

// ─── Ownership Conditions ───────────────────────────────────────────────────

/**
 * Check if the user is the creator/owner of the resource.
 * Handles both ObjectId and string comparisons.
 * Checks: createdBy, userId, doctorId (in that order).
 */
function isOwner(ctx) {
    if (!ctx.resource || !ctx.user) return false;
    const creatorId = ctx.resource.createdBy || ctx.resource.userId || ctx.resource.doctorId;
    if (!creatorId) return false;
    return creatorId.toString() === ctx.user._id.toString();
}

/**
 * Check if the user is the assigned doctor on the resource.
 * Checks: doctorId, assignedDoctor (in that order).
 */
function isAssignedDoctor(ctx) {
    if (!ctx.resource || !ctx.user) return false;
    const doctorId = ctx.resource.doctorId || ctx.resource.assignedDoctor;
    if (!doctorId) return false;
    return doctorId.toString() === ctx.user._id.toString();
}

/**
 * Check if the user is the owner OR the assigned doctor.
 * Common pattern for clinical resources.
 */
function isOwnerOrAssigned(ctx) {
    return isOwner(ctx) || isAssignedDoctor(ctx);
}

// ─── Branch Conditions ──────────────────────────────────────────────────────

/**
 * Check if the resource is in the user's branch scope.
 * If the resource has no branch (org-level), returns true.
 */
function isSameBranch(ctx) {
    if (!ctx.resource || !ctx.branchId) return false;
    const resourceBranch = ctx.resource.branchId || ctx.resource.branch;
    if (!resourceBranch) return true; // Org-level resource → allow
    return resourceBranch.toString() === ctx.branchId.toString();
}

/**
 * Check if user has full branch access (org_admin level).
 * This flag is set by the branchScope middleware for admins.
 */
function hasFullBranchAccess(ctx) {
    return ctx.user?.hasFullBranchAccess === true;
}

/**
 * Check if user has branch access (either same branch or full access).
 */
function hasBranchAccess(ctx) {
    return hasFullBranchAccess(ctx) || isSameBranch(ctx);
}

/**
 * List-or-branch access: allow if no resource (list endpoint — branch filtering
 * at query level via branchScopeMiddleware) or if resource is in user's branch.
 * Use for READ policies covering both list and detail access.
 */
function listOrSameBranch(ctx) {
    if (!ctx.resource) return true;
    return isSameBranch(ctx);
}

/**
 * List-or-branch access (broad): allow if no resource (list endpoint) or if
 * user has branch access (either same branch or full access).
 * Use for READ policies for clinical roles with potential multi-branch access.
 */
function listOrBranchAccess(ctx) {
    if (!ctx.resource) return true;
    return hasBranchAccess(ctx);
}

// ─── Status Conditions ──────────────────────────────────────────────────────

/**
 * Higher-order: check if resource has one of the given statuses.
 * @param {...string} statuses — allowed status values
 * @returns {(ctx: Object) => boolean}
 */
function resourceHasStatus(...statuses) {
    return (ctx) => {
        if (!ctx.resource?.status) return false;
        return statuses.includes(ctx.resource.status);
    };
}

/**
 * Check if resource is in draft status.
 */
const isDraft = resourceHasStatus("draft");

/**
 * Check if resource is in a finalized/immutable status.
 */
const isFinalized = resourceHasStatus("finalized", "reconciled", "paid", "voided", "completed", "refunded");

// ─── Combinators ────────────────────────────────────────────────────────────

/**
 * Combine multiple conditions with AND logic.
 * All conditions must return true for the combinator to return true.
 * @param {...Function} fns — condition functions
 * @returns {(ctx: Object) => boolean}
 */
function allOf(...fns) {
    return (ctx) => fns.every((fn) => fn(ctx));
}

/**
 * Combine multiple conditions with OR logic.
 * At least one condition must return true.
 * @param {...Function} fns — condition functions
 * @returns {(ctx: Object) => boolean}
 */
function anyOf(...fns) {
    return (ctx) => fns.some((fn) => fn(ctx));
}

/**
 * Negate a condition.
 * @param {Function} fn — condition function
 * @returns {(ctx: Object) => boolean}
 */
function not(fn) {
    return (ctx) => !fn(ctx);
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    // Role checks
    hasRole,
    isOrgAdmin,
    isDoctor,
    isAssistant,
    isReceptionist,
    isLabTechnician,

    // Ownership
    isOwner,
    isAssignedDoctor,
    isOwnerOrAssigned,

    // Branch scope
    isSameBranch,
    hasFullBranchAccess,
    hasBranchAccess,
    listOrSameBranch,
    listOrBranchAccess,

    // Status
    resourceHasStatus,
    isDraft,
    isFinalized,

    // Combinators
    allOf,
    anyOf,
    not,
};
