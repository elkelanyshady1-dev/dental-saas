/**
 * supervisorAccessGuard.js — Case-Level Access Validation
 *
 * THE MOST CRITICAL MIDDLEWARE IN THE SUPERVISOR PLANE.
 *
 * Validates that the authenticated supervisor has an ACTIVE CaseAccess
 * record for the requested caseId. If not → 403 immediately.
 *
 * Attaches `req.caseAccess` with role, permissions, and organizationId
 * for downstream use.
 *
 * SENTINEL: This is the ONLY path to cross-org case data.
 *           No OrthodonticCase query may bypass this check.
 */

"use strict";

const CaseAccessDef = require("../models/CaseAccess");
const getModel = require("../../../core/db/getModel");
const { getPlatformConnection } = require("../../../core/db/dbResolver");
const logger = require("@utils/logger");

/**
 * supervisorAccessGuard middleware
 *
 * Requires:
 *   - req.supervisor (from supervisorProtect)
 *   - req.params.caseId (from route)
 *
 * Attaches:
 *   - req.caseAccess (full CaseAccess document)
 */
async function supervisorAccessGuard(req, res, next) {
    try {
        const { supervisorId } = req.supervisor;
        const { caseId } = req.params;

        if (!caseId) {
            return res.status(400).json({
                success: false,
                error: "caseId parameter is required",
                code: "CASE_ID_MISSING",
            });
        }

        // ─── CaseAccess Lookup ──────────────────────────────────────────
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const access = await getModel(getPlatformConnection(), CaseAccessDef).findOne({
            supervisorId,
            caseId,
            status: "ACTIVE",
        }).lean();

        if (!access) {
            logger.warn({
                event: "SUPERVISOR_ACCESS_DENIED",
                supervisorId,
                caseId,
                reason: "No active CaseAccess record",
            });

            return res.status(403).json({
                success: false,
                error: "You do not have access to this case",
                code: "CASE_ACCESS_DENIED",
            });
        }

        // ─── Expiration Check ───────────────────────────────────────────
        if (access.expiresAt && access.expiresAt < new Date()) {
            logger.info({
                event: "SUPERVISOR_ACCESS_EXPIRED",
                supervisorId,
                caseId,
                accessId: access._id,
            });

            // Auto-expire the record
            await getModel(getPlatformConnection(), CaseAccessDef).updateOne(
                { _id: access._id },
                { $set: { status: "EXPIRED" } }
            );

            return res.status(403).json({
                success: false,
                error: "Your access to this case has expired",
                code: "CASE_ACCESS_EXPIRED",
            });
        }

        // ─── Attach Access Context ──────────────────────────────────────
        req.caseAccess = access;

        logger.debug({
            event: "SUPERVISOR_ACCESS_GRANTED",
            supervisorId,
            caseId,
            organizationId: access.organizationId,
            role: access.role,
        });

        next();
    } catch (error) {
        logger.error({
            event: "SUPERVISOR_ACCESS_GUARD_ERROR",
            error: error.message,
            supervisorId: req.supervisor?.supervisorId,
            caseId: req.params?.caseId,
        });

        return res.status(500).json({
            success: false,
            error: "Access validation error",
            code: "CASE_ACCESS_ERROR",
        });
    }
}

/**
 * requireSupervisorPermission — Fine-grained permission check within CaseAccess.
 *
 * Usage: requireSupervisorPermission("canComment")
 * Must be used AFTER supervisorAccessGuard.
 *
 * @param {string} permission — key from CaseAccess.permissions
 */
function requireSupervisorPermission(permission) {
    return function checkPermission(req, res, next) {
        if (!req.caseAccess) {
            return res.status(500).json({
                success: false,
                error: "Access guard not applied",
                code: "ACCESS_GUARD_MISSING",
            });
        }

        if (!req.caseAccess.permissions?.[permission]) {
            logger.warn({
                event: "SUPERVISOR_PERMISSION_DENIED",
                supervisorId: req.supervisor.supervisorId,
                caseId: req.params.caseId,
                missingPermission: permission,
            });

            return res.status(403).json({
                success: false,
                error: `Supervisor does not have '${permission}' permission for this case`,
                code: "SUPERVISOR_PERMISSION_DENIED",
            });
        }

        next();
    };
}

module.exports = {
    supervisorAccessGuard,
    requireSupervisorPermission,
};
