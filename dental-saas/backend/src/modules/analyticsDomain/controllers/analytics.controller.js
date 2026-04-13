/**
 * analytics.controller.js — Analytics Domain Controller
 *
 * AUDIT-005 Remediation: Extracted from analytics.routes.js (was fat-routes anti-pattern).
 * Keeps routes thin — all business logic delegates to analytics.service.js.
 *
 * PLANE: Org only. SECURITY: enforced at routes layer.
 */

"use strict";

const analyticsService = require("../analytics.service");
const logger           = require("@utils/logger");
const { getRole }      = require("@utils/auth/getRole");

/**
 * GET /api/v1/org/analytics
 * Role-aware analytics data for the authenticated organization.
 */
exports.getAnalytics = async (req, res) => {
    try {
        const role        = getRole(req);
        const currentPlan = req.org?.subscription?.plan || "basic";

        const data = await analyticsService.getAnalyticsData({ req, role, currentPlan });

        res.json(data);
    } catch (error) {
        logger.error({ err: error.message, orgId: req.organizationId }, "[Analytics] Endpoint error");
        res.status(500).json({ error: "Internal Server Error during analytics aggregation." });
    }
};
