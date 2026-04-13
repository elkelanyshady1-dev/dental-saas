/**
 * Subscription Overview Controller
 * Phase 8: Subscription Overview API for Platform Panel.
 */

"use strict";

const { buildSubscriptionOverview } = require("../../../projections/platform/subscriptionOverview.projection");

/**
 * getSubscriptionOverview
 * GET /api/v1/platform/org/:orgId/subscription
 */
exports.getSubscriptionOverview = async (req, res) => {
    try {
        const { orgId } = req.params;

        // Delegate assembly to the projection layer
        const data = await buildSubscriptionOverview(orgId);

        if (!data) {
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Organization not found" }
            });
        }

        return res.json({
            success: true,
            data
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            error: { code: "SERVER_ERROR", message: "Error fetching subscription overview", details: error.message }
        });
    }
};
