/**
 * contractsDashboard.controller.js
 * Sprint 7 — Contracts Needing Renewal Dashboard Endpoint
 *
 * GET /api/platform/contracts/needs-renewal
 * Capability: VIEW_PLATFORM_ANALYTICS
 *
 * PLANE: Platform
 */

"use strict";

const { getContractsNeedingRenewal } = require("../../../projections/platform/contractsNeedingRenewal.projection");
const logger = require("@utils/logger");

/**
 * getContractsNeedingRenewal
 * Returns paginated list of contracts requiring action:
 *   - Expiring within lookaheadDays (default: 14)
 *   - In dunning (retrying charge)
 *   - In grace period (pending suspension)
 *
 * Query params: lookaheadDays, page, limit
 */
exports.getContractsNeedingRenewal = async (req, res) => {
    try {
        const lookaheadDays = parseInt(req.query.lookaheadDays, 10) || 14;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));

        if (lookaheadDays < 1 || lookaheadDays > 90) {
            return res.status(400).json({
                success: false,
                error: "lookaheadDays must be between 1 and 90"
            });
        }

        const result = await getContractsNeedingRenewal({ lookaheadDays, page, limit });

        return res.json({
            success: true,
            data: result.data,
            pagination: result.pagination,
            summary: result.summary,
            meta: {
                lookaheadDays,
                generatedAt: new Date().toISOString()
            }
        });

    } catch (err) {
        logger.error({ err }, "[ContractsDashboard] getContractsNeedingRenewal failed");
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};
