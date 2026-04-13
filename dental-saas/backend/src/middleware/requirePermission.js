/**
 * requirePermission.js — Lightweight RBAC Guard (Phase 6)
 *
 * Minimal permission enforcement middleware for token-driven RBAC.
 * Reads from req.authContext.permissionSet (Set<string>) which is
 * built from JWT at auth time — zero DB dependency.
 *
 * USAGE:
 *   const requirePermission = require("../middleware/requirePermission");
 *
 *   router.get("/patients",
 *     authMiddleware,
 *     branchContext,
 *     requirePermission("patients.read"),
 *     controller.list
 *   );
 *
 * COEXISTENCE:
 *   This can co-exist with the full requireOrgPermission (which adds
 *   audit logging, SSOT validation, auth tracing). Use this for new
 *   routes or when you want minimal overhead. Use requireOrgPermission
 *   for routes that need full audit trail.
 *
 * PLANE: Org-plane only.
 */

"use strict";

const logger = require("../utils/logger");

/**
 * @param {string} permission  Dot-notation permission string, e.g. "patients.read"
 * @returns {import("express").RequestHandler}
 */
function requirePermission(permission) {
    if (!permission || typeof permission !== "string") {
        throw new Error(`[requirePermission] Invalid permission argument: "${permission}"`);
    }

    return function permissionGuard(req, res, next) {
        const permissionSet = req.authContext?.permissionSet;

        // Fail closed: if permissionSet is missing, auth pipeline is broken
        if (!(permissionSet instanceof Set)) {
            logger.error({
                event: "AUTH_CONTEXT_INVALID",
                userId: req.user?._id,
                path: req.originalUrl,
            }, "[RBAC:Lite] permissionSet missing — auth pipeline broken");

            return res.status(500).json({
                success: false,
                error: {
                    code: "AUTH_CONTEXT_INVALID",
                    message: "Internal authentication error. Please re-login.",
                },
            });
        }

        if (!permissionSet.has(permission)) {
            logger.warn({
                event: "PERMISSION_DENIED",
                permission,
                userId: req.user?._id,
                organizationId: req.organizationId,
                path: req.originalUrl,
                method: req.method,
            }, `[RBAC:Lite] Permission denied: "${permission}"`);

            return res.status(403).json({
                success: false,
                error: {
                    code: "PERMISSION_DENIED",
                    message: `Access denied: missing permission "${permission}".`,
                },
            });
        }

        next();
    };
}

module.exports = requirePermission;
