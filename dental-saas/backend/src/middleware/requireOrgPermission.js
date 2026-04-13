/**
 * requireOrgPermission.js
 * Organization RBAC — Permission Enforcement Middleware
 *
 * Checks that the authenticated org user holds the given permission
 * before allowing the request through.
 *
 * Permission strings follow the format "<module>.<action>".
 * See src/rbac/orgPermissions.js for the full constant list.
 *
 * PREREQUISITE: orgProtect must run before this middleware so that
 *   - req.user is hydrated with the populated roleId
 *   - req.authContext.permissionSet (Set<string>) is built by authMiddleware
 *
 * USAGE
 *   const requireOrgPermission = require("../../middleware/requireOrgPermission");
 *   const { P } = require("../../rbac/orgPermissions");
 *
 *   router.post("/patients",
 *     ...orgProtect,
 *     requireOrgPermission(P.PATIENTS_CREATE),
 *     createPatient
 *   );
 *
 * PLANE: Org-plane only. Do NOT apply on /api/platform/* routes.
 */

"use strict";

const logger = require("../utils/logger");
const auditService = require("../services/auditService");
const { assertValidPermission } = require("../rbac/permissionValidator");
const { getRole } = require("@utils/auth/getRole");

const SYSTEM_ID = "000000000000000000000000";

/**
 * requireOrgPermission
 *
 * @param {string} permission  Dot-notation permission string, e.g. "patients.create"
 * @returns {import("express").RequestHandler}
 */
function requireOrgPermission(permission) {
    if (!permission || typeof permission !== "string") {
        throw new Error(`[requireOrgPermission] Invalid permission argument: "${permission}"`);
    }

    // 🛡️ Phase 17: Validate against SSOT at boot time (route mount).
    // This catches typos and orphaned permission strings BEFORE any request arrives.
    assertValidPermission(permission);

    return function orgPermissionGuard(req, res, next) {
        try {
            // Must have an authenticated org user with a JWT role
            if (!req.user || !getRole(req)) {
                return res.status(403).json({
                    success: false,
                    error: {
                        code: "NO_ROLE_ASSIGNED",
                        message: "Access denied: no role assigned to this user."
                    }
                });
            }

            // Phase X FINAL: Single source of truth — req.authContext.permissionSet ONLY
            const permissionSet = req.authContext?.permissionSet;

            // Fail closed: if permissionSet is not a Set, auth pipeline is broken
            if (!(permissionSet instanceof Set)) {
                logger.error({
                    event: "AUTH_CONTEXT_INVALID",
                    userId: req.user._id,
                    organizationId: req.user.organizationId,
                    hasAuthContext: !!req.authContext,
                    hasPermissionSet: !!permissionSet,
                    typeOf: typeof permissionSet,
                    requestId: req.requestId,
                    path: req.originalUrl,
                }, "[RBAC] permissionSet is missing or invalid — authMiddleware may have failed");

                return res.status(500).json({
                    success: false,
                    error: {
                        code: "AUTH_CONTEXT_INVALID",
                        message: "Internal authentication error. Please re-login."
                    }
                });
            }

            if (!permissionSet.has(permission)) {
                // ── Auth Trace: RBAC DENY ──
                if (typeof req.addAuthTrace === "function") {
                    req.addAuthTrace({
                        layer: "RBAC",
                        permission,
                        result: "DENY",
                        reason: `Missing permission: ${permission}`,
                        details: { role: getRole(req) },
                    });
                }

                logger.warn({
                    event: "ORG_PERMISSION_DENIED",
                    permission,
                    userId: req.user._id,
                    role: getRole(req),
                    organizationId: req.user.organizationId,
                    requestId: req.requestId,
                    path: req.originalUrl,
                    method: req.method
                }, `[RBAC] Permission denied: "${permission}"`);

                // Fire-and-forget audit record — mirrors platform guard behaviour
                auditService.createAuditRecord({
                    actorId: req.user._id,
                    actorType: "tenant_user",
                    action: "ORG_PERMISSION_DENIED",
                    entity: "OrgRoute",
                    organizationId: req.user.organizationId || SYSTEM_ID,
                    branchId: SYSTEM_ID,
                    ipAddress: req.ip,
                    userAgent: req.headers["user-agent"],
                    correlationId: req.requestId,
                    success: false,
                    details: { permission, route: req.originalUrl, role: getRole(req) },
                }).catch(() => { }); // Non-blocking

                return res.status(403).json({
                    success: false,
                    error: {
                        code: "PERMISSION_DENIED",
                        message: `Access denied: missing permission "${permission}".`
                    }
                });
            }

            // ── Auth Trace: RBAC ALLOW ──
            if (typeof req.addAuthTrace === "function") {
                req.addAuthTrace({
                    layer: "RBAC",
                    permission,
                    result: "ALLOW",
                    details: {
                        role: getRole(req),
                        escalation: req.authContext?.escalation || false,
                        source: req.authContext?.source || "org",
                    },
                });
            }

            next();


        } catch (err) {
            logger.error({
                event: "ORG_PERMISSION_GUARD_ERROR",
                permission,
                requestId: req.requestId,
                err: err.message
            }, "[RBAC] Permission guard threw unexpectedly");
            res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: err.message } });
        }
    };
}

module.exports = requireOrgPermission;
