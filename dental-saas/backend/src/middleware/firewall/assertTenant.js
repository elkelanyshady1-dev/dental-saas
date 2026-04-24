/**
 * assertTenant.js — Tenant Isolation Firewall Guard
 *
 * Ensures req.context.organizationId is ALWAYS present before any
 * org-plane controller executes. Prevents silent tenant isolation
 * bypass if the auth pipeline fails to populate context.
 *
 * Mount: AFTER protect + branchContextMiddleware, BEFORE orgV1Routes.
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

function assertTenant(req, res, next) {
    const orgId = req.context?.organizationId;

    if (!orgId) {
        logger.error({
            event: "FIREWALL_TENANT_MISSING",
            path: req.originalUrl,
            method: req.method,
            userId: req.user?._id,
            hasContext: !!req.context,
            hasUser: !!req.user,
        }, "[FIREWALL] Tenant context missing — organizationId not set on req.context");

        return res.status(500).json({
            success: false,
            error: {
                code: "FIREWALL_TENANT_MISSING",
                message: "Tenant context not resolved. Contact support.",
            },
        });
    }

    next();
}

module.exports = assertTenant;
