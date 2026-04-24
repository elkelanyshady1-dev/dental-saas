/**
 * authOnly.js — Firewall-Compatible Auth-Only Marker
 *
 * For routes that require authentication but NO specific RBAC permission.
 * Sets the _permissionChecked flag so assertAuthorization.js firewall
 * does not block the response with AUTHORIZATION_NOT_EXECUTED.
 *
 * USAGE:
 *   const authOnly = require("@middleware/authOnly");
 *
 *   // Route accessible by any authenticated org user
 *   router.get("/context/branches", authOnly(), contextController.getBranches);
 *
 * IMPORTANT:
 *   This middleware MUST only be used for routes where any authenticated
 *   org user should have access. For permission-gated routes, use
 *   requireOrgPermission(P.XXX) instead.
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

/**
 * authOnly — Mark a route as "authentication required, no specific permission needed".
 *
 * Validates that req.context exists (i.e. auth middleware ran) and sets
 * the firewall marker. If auth context is missing, returns 401.
 *
 * @returns {import("express").RequestHandler}
 */
function authOnly() {
    return function authOnlyGuard(req, res, next) {
        if (!req.context || !req.context.userId) {
            logger.warn({
                event: "AUTH_ONLY_NO_CONTEXT",
                path: req.originalUrl,
                method: req.method,
            }, "[authOnly] Route hit without auth context — blocking");

            return res.status(401).json({
                success: false,
                error: {
                    code: "UNAUTHORIZED",
                    message: "Authentication required.",
                },
            });
        }

        // Firewall marker: signals that authorization was deliberately
        // evaluated (auth-only = any authenticated user is authorized).
        req.context._permissionChecked = true;

        next();
    };
}

module.exports = authOnly;
