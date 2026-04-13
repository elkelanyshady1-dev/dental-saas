/**
 * Access Guard — RBAC Permission Check
 *
 * Usage:
 *   await runGuards([requirePermission("PATIENT_READ")], { user: req.user });
 *
 * NOTE: This is a guard-level check. Route-level RBAC middleware
 * (requirePermission middleware) is still the primary enforcement.
 * This guard is for controller-level fine-grained checks.
 */

"use strict";

const logger = require("@utils/logger");

/**
 * Creates a guard that checks if the user has a specific permission.
 *
 * @param {string} permission - Permission string (e.g., "patients.read")
 * @returns {Function} Guard function
 */
function requirePermission(permission) {
    return async ({ user }) => {
        if (!user) {
            const err = new Error("Access denied: Authentication required");
            err.statusCode = 401;
            throw err;
        }

        if (!user.permissions?.includes(permission)) {
            logger.warn({
                event: "GUARD_PERMISSION_DENIED",
                userId: user._id,
                permission,
                role: user.role || user.roleId,
            }, `[Guard] Permission denied: ${permission}`);

            const err = new Error(`Forbidden: Missing permission "${permission}"`);
            err.statusCode = 403;
            throw err;
        }
    };
}

/**
 * Creates a guard that checks if the user has ANY of the specified permissions.
 *
 * @param {string[]} permissions - Array of permission strings
 * @returns {Function} Guard function
 */
function requireAnyPermission(permissions) {
    return async ({ user }) => {
        if (!user) {
            const err = new Error("Access denied: Authentication required");
            err.statusCode = 401;
            throw err;
        }

        const hasAny = permissions.some(p => user.permissions?.includes(p));
        if (!hasAny) {
            const err = new Error(`Forbidden: Requires one of [${permissions.join(", ")}]`);
            err.statusCode = 403;
            throw err;
        }
    };
}

/**
 * Creates a guard that checks if the user has a specific role.
 *
 * @param  {...string} roles - Allowed role names
 * @returns {Function} Guard function
 */
function requireRole(...roles) {
    return async ({ user }) => {
        if (!user) {
            const err = new Error("Access denied: Authentication required");
            err.statusCode = 401;
            throw err;
        }

        const userRole = user.role || user.roleName;
        if (!roles.includes(userRole)) {
            const err = new Error(`Forbidden: Requires role [${roles.join(", ")}]`);
            err.statusCode = 403;
            throw err;
        }
    };
}

module.exports = { requirePermission, requireAnyPermission, requireRole };
