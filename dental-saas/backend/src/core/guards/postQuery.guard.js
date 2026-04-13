/**
 * postQuery.guard.js — Post-Query Guards (V2)
 *
 * These guards validate results AFTER fetching.
 * Used for checks that can't be expressed as query filters:
 *   - Single-resource ownership verification
 *   - Business invariants (locked, status)
 *   - Cross-entity validations
 *
 * Each guard is a factory that returns:
 *   async ({ user, resource, req }) => void (throws on denial)
 */

"use strict";

const logger = require("@utils/logger");

// ─── Ownership ──────────────────────────────────────────────────────────────

/**
 * Assert the current user owns the resource.
 * Admins (hasFullBranchAccess) bypass by default.
 *
 * @param {Function} getOwnerId - Extracts owner ID from resource (e.g., r => r.doctorId)
 * @param {Object} [opts]
 * @param {boolean} [opts.allowAdmin=true] - Admin bypass
 * @returns {Function} Post-query guard
 */
function assertOwnership(getOwnerId, opts = {}) {
    const { allowAdmin = true } = opts;

    return async ({ user, resource }) => {
        if (!resource) {
            const err = new Error("Resource not found");
            err.statusCode = 404;
            throw err;
        }

        if (allowAdmin && user.hasFullBranchAccess) return;

        const ownerId = getOwnerId(resource);
        if (!ownerId) return; // No owner constraint

        if (String(ownerId) !== String(user._id)) {
            logger.warn({
                event: "GUARD_OWNERSHIP_DENIED",
                userId: user._id,
                ownerId: String(ownerId),
                resourceId: resource._id,
            }, "[Guard] Ownership denied");

            const err = new Error("Access denied: You do not own this resource");
            err.statusCode = 403;
            throw err;
        }
    };
}

/**
 * Assert the resource exists (non-null check).
 *
 * @param {string} [label="Resource"] - Label for error message
 * @returns {Function} Post-query guard
 */
function assertExists(label = "Resource") {
    return async ({ resource }) => {
        if (!resource) {
            const err = new Error(`${label} not found`);
            err.statusCode = 404;
            throw err;
        }
    };
}

// ─── Business Invariants ────────────────────────────────────────────────────

/**
 * Assert the resource is not locked/finalized.
 *
 * @param {string} [lockField="status"]
 * @param {string[]} [lockedValues=["LOCKED", "locked", "finalized"]]
 * @returns {Function} Post-query guard
 */
function assertNotLocked(lockField = "status", lockedValues = ["LOCKED", "locked", "finalized"]) {
    return async ({ resource }) => {
        if (!resource) return;
        if (lockedValues.includes(resource[lockField])) {
            const err = new Error(`Operation denied: Resource is ${resource[lockField]}`);
            err.statusCode = 409;
            throw err;
        }
    };
}

/**
 * Assert the resource has an expected status.
 *
 * @param {...string} allowedStatuses
 * @returns {Function} Post-query guard
 */
function assertStatus(...allowedStatuses) {
    return async ({ resource }) => {
        if (!resource) return;
        if (!allowedStatuses.includes(resource.status)) {
            const err = new Error(
                `Operation denied: Expected [${allowedStatuses.join(", ")}] but found "${resource.status}"`
            );
            err.statusCode = 409;
            throw err;
        }
    };
}

/**
 * Assert a custom business rule.
 *
 * @param {Function} predicate - (context) => boolean
 * @param {string} message - Error message on failure
 * @param {number} [statusCode=400]
 * @returns {Function} Post-query guard
 */
function assertInvariant(predicate, message, statusCode = 400) {
    return async (context) => {
        const ok = await predicate(context);
        if (!ok) {
            const err = new Error(message);
            err.statusCode = statusCode;
            throw err;
        }
    };
}

// ─── Branch ─────────────────────────────────────────────────────────────────

/**
 * Assert the user has access to the resource's branch.
 * Use this when branchId can't be part of the query (e.g., populated refs).
 *
 * @param {Function} [getBranchId] - Extracts branchId. Default: r => r.branchId
 * @returns {Function} Post-query guard
 */
function assertBranchAccess(getBranchId) {
    const extract = getBranchId || (r => r.branchId);

    return async ({ user, resource }) => {
        if (!resource) return;
        if (user.hasFullBranchAccess) return;

        const branch = extract(resource);
        if (!branch) return;

        const allowed = (user.branchAccess || []).some(b => String(b) === String(branch));
        if (!allowed) {
            const err = new Error("Access denied: Resource belongs to a different branch");
            err.statusCode = 403;
            throw err;
        }
    };
}

module.exports = {
    assertOwnership,
    assertExists,
    assertNotLocked,
    assertStatus,
    assertInvariant,
    assertBranchAccess,
};
