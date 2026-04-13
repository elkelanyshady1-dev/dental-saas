/**
 * Organization Usage Controller
 * Phase 9: Organization Usage API for Platform Dashboard.
 */

"use strict";

const { buildOrganizationUsage } = require("../../../projections/platform/organizationUsage.projection");

/**
 * getOrganizationUsage
 * GET /api/v1/platform/org/:orgId/usage
 */
exports.getOrganizationUsage = async (req, res) => {
    try {
        const { orgId } = req.params;

        // Assembly delegated to projection layer for domain isolation compliance
        const usageData = await buildOrganizationUsage(orgId);

        if (!usageData) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Organization not found" }
            });
        }

        return res.json({
            success: true,
            data: usageData
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: { code: "SERVER_ERROR", message: "Error fetching organization usage", details: error.message }
        });
    }
};
