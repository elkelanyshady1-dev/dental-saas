/**
 * assertCapabilities.js — Global Capability Assertion (Fail-Fast Layer)
 *
 * Phase A+ (TASK-AUTH-HARD-002)
 *
 * PURPOSE:
 * If unifiedCapabilityMiddleware fails, is skipped, or encounters an error,
 * the downstream middleware (requireEntitlement, requireFeature, requireOrgPermission)
 * would receive req.capabilities === undefined, leading to silent insecurity.
 *
 * This middleware provides a FAIL-FAST guarantee:
 *   - If req.capabilities is missing → immediate 500
 *   - No silent authorization bypass is possible
 *
 * MOUNT ORDER:
 *   Must be mounted AFTER unifiedCapabilityMiddleware in the org route chain:
 *     subscriptionGuard → protect → featureFlagMiddleware → branchContext
 *     → unifiedCapabilityMiddleware → **assertCapabilities** → orgV1Routes
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

/**
 * Assert that req.capabilities has been resolved by the upstream
 * capability pipeline. If not, the request is immediately rejected
 * with a 500 to prevent any authorization decision from running
 * against undefined data.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {import("express").NextFunction} next
 */
function assertCapabilities(req, res, next) {
    if (!req.capabilities) {
        logger.error({
            event: "CAPABILITIES_NOT_RESOLVED",
            path: req.originalUrl,
            method: req.method,
            userId: req.user?._id,
            organizationId: req.organizationId,
        }, "[CRITICAL] Capabilities missing in request — capability pipeline failed or was skipped");

        return res.status(500).json({
            success: false,
            error: {
                code: "CAPABILITIES_NOT_RESOLVED",
                message: "Authorization system misconfigured. Contact support.",
            },
        });
    }

    next();
}

module.exports = assertCapabilities;
