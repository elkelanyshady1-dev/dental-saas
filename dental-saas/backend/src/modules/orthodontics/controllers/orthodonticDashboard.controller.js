"use strict";

/**
 * orthodonticDashboard.controller.js
 * Orthodontic Situation Room — GET /api/v1/orthodontic-cases/dashboard
 *
 * Security stack (7 layers):
 *   1. Context  — req.context (JWT) resolved by orgProtect + organizationContext (route-level)
 *   2. License  — requireEntitlement("orthodontics") applied at route-level
 *   3. RBAC     — requireOrgPermission(P.ORTHO_READ) applied at route-level
 *   4. PBAC     — enforced inside service via ownerId / sharedWith scoping
 *   5. RLS      — tenant-scoped by organizationId at every query root
 *   6. FLS      — fieldFilterMiddleware("orthodonticDashboard") applied at route-level
 *   7. Audit    — read-only, no audit entry emitted
 *
 * Response shape is produced by the DTO builder; never return raw aggregates.
 */

const service = require("../services/orthodonticDashboard.service");
const { buildDashboardDTO } = require("../core/dto/orthodonticDashboard.dto");
const logger = require("@utils/logger");

async function getDashboard(req, res) {
    try {
        const raw = await service.getDashboard(req);
        const data = buildDashboardDTO(raw);
        return res.json({ success: true, data });
    } catch (err) {
        logger.error(
            `[OrthoDashboardController] getDashboard failed: ${err.message}`,
            { userId: req.context?.userId, organizationId: req.context?.organizationId }
        );
        return res.status(err.statusCode || 500).json({
            success: false,
            error: {
                code: err.code || "DASHBOARD_ERROR",
                message: err.message || "Failed to load dashboard",
            },
        });
    }
}

module.exports = { getDashboard };
