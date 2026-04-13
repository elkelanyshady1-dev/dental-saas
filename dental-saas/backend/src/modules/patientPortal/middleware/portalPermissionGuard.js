/**
 * portalPermissionGuard.js
 * Phase 4 — Portal Permission Enforcement Middleware
 *
 * Validates that the authenticated patient has the required
 * portalPermissions flag before proceeding to the route handler.
 *
 * ARCHITECTURE:
 *   Permission source: PatientUser.portalPermissions (subdocument)
 *   Set by: patientProtect → req.user = PatientUser document
 *   Read by: this middleware → req.user.portalPermissions[permission]
 *
 * BEHAVIOR:
 *   - Missing permission → 403 (fail-closed, NEVER silent or fallback)
 *   - Missing req.user → 403 (safety net for misrouted requests)
 *   - portalPermissions undefined → DENIED (fail-closed default)
 *   - Staff (org) routes → SKIP (not applicable to org users)
 *
 * PERMISSIONS AVAILABLE:
 *   canBookAppointment      — book/reschedule appointments
 *   canCancelAppointment    — cancel scheduled appointments
 *   canViewInvoices         — view financial data
 *   canViewMedicalHistory   — view clinical records
 *   canUploadFiles          — upload photos/documents
 *
 * USAGE:
 *   const portalPermissionGuard = require("./portalPermissionGuard");
 *
 *   router.post("/photos",
 *     patientProtect,
 *     portalRLSContext,
 *     portalPermissionGuard("canUploadFiles"),
 *     ctrl.uploadPhoto
 *   );
 *
 * PLANE: Portal (patient-facing only)
 * @per-org-transactional — portal permissions — behavioral control layer
 */

"use strict";

const logger = require("../../../utils/logger");

/**
 * Known portal permissions for validation.
 * Any permission NOT in this set is a programming error.
 */
const KNOWN_PERMISSIONS = new Set([
    "canBookAppointment",
    "canCancelAppointment",
    "canViewInvoices",
    "canViewMedicalHistory",
    "canUploadFiles",
]);

/**
 * Creates a middleware that checks for a specific portal permission.
 *
 * @param {string} permission - Permission flag name (e.g., "canUploadFiles")
 * @returns {import("express").RequestHandler}
 */
function portalPermissionGuard(permission) {
    // Validate at middleware creation time (startup) — not at runtime
    if (!KNOWN_PERMISSIONS.has(permission)) {
        throw new Error(
            `[PortalPermissionGuard] UNKNOWN permission "${permission}". ` +
            `Known: [${[...KNOWN_PERMISSIONS].join(", ")}]`
        );
    }

    return function portalPermGuard(req, res, next) {
        // ── Skip for org staff (they use RBAC, not portal permissions) ───
        if (req.user?.type !== "patient") {
            return next();
        }

        // ── Fail-closed: no user = denied ────────────────────────────────
        if (!req.user) {
            logger.warn({
                event: "PORTAL_PERMISSION_NO_USER",
                permission,
                path: req.originalUrl,
            }, "[PortalPermission] No req.user — denied");

            return res.status(403).json({
                success: false,
                error: {
                    code: "PORTAL_PERMISSION_DENIED",
                    message: `Missing permission: ${permission}`,
                },
            });
        }

        // ── Resolve permission value ─────────────────────────────────────
        const perms = req.user.portalPermissions;

        // portalPermissions undefined → fail-closed (NEVER allow by default)
        if (!perms || perms[permission] !== true) {
            logger.info({
                event: "PORTAL_PERMISSION_DENIED",
                permission,
                patientId: req.patientId,
                organizationId: req.organizationId,
                hasPerms: !!perms,
                value: perms?.[permission],
                path: req.originalUrl,
            }, `[PortalPermission] DENIED: ${permission}`);

            return res.status(403).json({
                success: false,
                error: {
                    code: "PORTAL_PERMISSION_DENIED",
                    message: `Missing permission: ${permission}`,
                },
            });
        }

        // ── Permission granted ───────────────────────────────────────────
        logger.debug({
            event: "PORTAL_PERMISSION_GRANTED",
            permission,
            patientId: req.patientId,
            path: req.originalUrl,
        });

        next();
    };
}

/**
 * Express middleware to expose portalPermissions as req.features.
 * Useful for controller-level conditional logic.
 *
 * @example
 *   router.use(patientProtect, attachPortalFeatures);
 *   // then in controller:
 *   if (!req.features?.canUploadFiles) { ... }
 */
function attachPortalFeatures(req, res, next) {
    if (req.user?.type === "patient" && req.user.portalPermissions) {
        req.features = { ...req.user.portalPermissions.toObject?.() || req.user.portalPermissions };
    }
    next();
}

module.exports = portalPermissionGuard;
module.exports.portalPermissionGuard = portalPermissionGuard;
module.exports.attachPortalFeatures = attachPortalFeatures;
module.exports.KNOWN_PERMISSIONS = KNOWN_PERMISSIONS;
