/**
 * billingDashboard.controller.js
 * Sprint 7 — Renewal Dashboard + Billing Audit Log Endpoints
 *
 * GET /api/platform/billing/dashboard
 *   → getRenewalDashboardMetrics()   (VIEW_PLATFORM_ANALYTICS)
 *
 * GET /api/platform/billing/audit-logs/:orgId
 *   → getOrgBillingHistory()         (VIEW_AUDIT_LOGS)
 *
 * PLANE: Platform
 */

"use strict";

const { getRenewalDashboardMetrics } = require("../../../projections/renewalDashboard.projection");
const { getOrgBillingHistory } = require("../services/billingAuditLog.service");
const logger = require("@utils/logger");

// ─── GET /api/platform/billing/dashboard ──────────────────────────────────────
exports.getDashboard = async (req, res) => {
    try {
        const metrics = await getRenewalDashboardMetrics();
        return res.json({ success: true, data: metrics });
    } catch (err) {
        logger.error({ err }, "[BillingDashboard] getDashboard failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};

// ─── GET /api/platform/billing/audit-logs/:orgId ─────────────────────────────
exports.getOrgAuditLogs = async (req, res) => {
    try {
        const { orgId } = req.params;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
        const eventType = req.query.eventType || undefined;
        const contractId = req.query.contractId || undefined;

        const result = await getOrgBillingHistory(orgId, { page, limit, eventType, contractId });

        return res.json({
            success: true,
            data: result.data,
            pagination: result.pagination
        });
    } catch (err) {
        logger.error({ err }, "[BillingDashboard] getOrgAuditLogs failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};
