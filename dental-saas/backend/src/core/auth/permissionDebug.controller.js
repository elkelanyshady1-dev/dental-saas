/**
 * permissionDebug.controller.js — Permission Debug API
 *
 * DEV-ONLY endpoint that returns a comprehensive real-time view of a user's
 * effective permissions, combining RBAC state, entitlement state, and the
 * final computed access decision for every SSOT permission key.
 *
 * ┌─────────────┐  ┌───────────────┐  ┌────────────┐
 * │ RBAC (Role) │  │ Entitlements  │  │ SSOT Keys  │
 * └──────┬──────┘  └───────┬───────┘  └──────┬─────┘
 *        │                 │                  │
 *        ▼                 ▼                  ▼
 *   ┌────────────────────────────────────────────┐
 *   │     permissionDebug.controller.js          │
 *   │     GET /api/v1/org/debug/permissions       │
 *   └────────────────────────────────────────────┘
 *
 * PLANE: Org only.
 * ACCESS: org_admin only (via security.manage permission).
 * ENVIRONMENT: DEV/STAGING only — disabled in production.
 */

"use strict";

const { generatePermissionKeys, PERMISSION_VERSION, deriveModuleMap } = require("../../rbac/permissionRegistry");
const { getValidPermissionKeys } = require("../../rbac/permissionValidator");
const { resolveAllAccess } = require("../../rbac/accessResolver");
const logger = require("../../utils/logger");

/**
 * GET /debug/permissions
 *
 * Returns the current user's permission resolution matrix:
 *   - Every SSOT key
 *   - RBAC granted/denied status
 *   - Entitlement (module) enabled/disabled status
 *   - Final computed result (RBAC && Entitlement)
 *   - Resolution source: "accessResolver" (centralized engine)
 */
async function getPermissionDebugMatrix(req, res) {
    try {
        // Production safety gate
        if (process.env.NODE_ENV === "production") {
            return res.status(403).json({
                success: false,
                error: { code: "DEBUG_DISABLED", message: "Permission debug is disabled in production." },
            });
        }

        const capabilities = req.capabilities || {};
        const modules = capabilities.modules || {};
        const rolePermissions = req.user?.roleId?.permissions || {};
        const allKeys = generatePermissionKeys();
        const moduleMap = deriveModuleMap();

        // ─── Centralized Resolution ─────────────────────────────────────
        // Uses accessResolver.resolveAllAccess() for consistent resolution
        // across debug panel, middleware, and frontend.
        const matrix = resolveAllAccess({
            rolePermissions,
            planModules: modules,
        });

        // Group by module for summary
        const moduleSummary = {};
        for (const [mod, actions] of Object.entries(moduleMap)) {
            const modEntries = matrix.filter(m => m.module === mod);
            moduleSummary[mod] = {
                totalActions: actions.length,
                rbacGranted: modEntries.filter(m => m.rbac).length,
                entitlementEnabled: modules[mod] !== undefined ? !!modules[mod] : true,
                fullyAccessible: modEntries.every(m => m.final),
            };
        }

        // ─── Field Masking (PII Protection) ────────────────────────────
        // Even in dev/staging, mask the user email to prevent accidental
        // PII leakage in screenshots, logs, or shared debug output.
        const maskEmail = (email) => {
            if (!email) return "unknown";
            const [local, domain] = email.split("@");
            if (!domain) return "***";
            return `${local.charAt(0)}${"*".repeat(Math.max(local.length - 2, 1))}${local.charAt(local.length - 1)}@${domain}`;
        };

        // ─── Audit: Log Debug Panel Access ──────────────────────────────
        // This endpoint exposes the complete RBAC state — log every access.
        logger.info({
            event: "PERMISSION_DEBUG_ACCESSED",
            userId: req.user?._id,
            role: req.user?.roleId?.name || "unknown",
            ip: req.ip,
            correlationId: req.correlationId,
        }, "[PermissionDebug] Debug matrix accessed");

        res.json({
            success: true,
            data: {
                user: {
                    id: req.user?._id,
                    name: req.user?.name,
                    email: maskEmail(req.user?.email),
                    role: req.user?.roleId?.name || "unknown",
                },
                resolverSource: "accessResolver",
                resolverVersion: "v40.0",
                // Phase 5: permissionVersion is auto-heal tracking only (not in JWT)
                schemaVersion: PERMISSION_VERSION,
                roleVersion: req.user?.roleId?.permissionVersion || 0,
                versionMatch: (req.user?.roleId?.permissionVersion || 0) === PERMISSION_VERSION,
                totalKeys: allKeys.length,
                rbacGrantedCount: matrix.filter(m => m.rbac).length,
                entitlementBlockedCount: matrix.filter(m => !m.entitlement).length,
                finalGrantedCount: matrix.filter(m => m.final).length,
                moduleSummary,
                matrix,
            },
        });
    } catch (err) {
        logger.error({
            event: "PERMISSION_DEBUG_ERROR",
            err: err.message,
            requestId: req.requestId,
        }, "[PermissionDebug] Failed to generate debug matrix");

        res.status(500).json({
            success: false,
            error: { code: "DEBUG_ERROR", message: err.message },
        });
    }
}

module.exports = { getPermissionDebugMatrix };
