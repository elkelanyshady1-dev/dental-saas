/**
 * Plan Catalog Controller
 * Phase 10: Platform Plan Catalog API.
 */

"use strict";

const { buildPlanCatalog } = require("../../../projections/platform/planCatalog.projection");

/**
 * getPlanCatalog
 * GET /api/v1/platform/plans
 */
exports.getPlanCatalog = async (req, res) => {
    try {
        const catalog = await buildPlanCatalog();

        return res.json({
            success: true,
            data: catalog
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: { code: "SERVER_ERROR", message: "Error fetching plan catalog", details: error.message }
        });
    }
};
