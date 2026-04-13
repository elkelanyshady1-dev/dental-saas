/**
 * executive.projection.js
 * Analytics Domain — Executive Financial Intelligence
 *
 * Provides high-level revenue and margin metrics at organization level.
 *
 * @per-org-compliant — All queries use getModel + guards.
 * req context propagated from analytics.service for tenant scoping.
 */

const FinancialSnapshotDef = require("../../billingDomain/projections/snapshot/FinancialSnapshot.model");
const CaseCostSnapshotDef = require("../../inventoryDomain/models/caseCostSnapshot.model");
const getModel = require("@core/db/getModel");

// ─── Per-Request Model Resolution ────────────────────────────────────────────
function _getModels(req) {
    const conn = req.dbConnection;
    return {
        FinancialSnapshot: getModel(conn, FinancialSnapshotDef),
        CaseCostSnapshot: getModel(conn, CaseCostSnapshotDef),
    };
}

async function getRevenueTrend(organizationId, req) {
    const { FinancialSnapshot } = _getModels(req);
    // organizationId kept for backward compat but not used in $match — per-org DB connection isolates it
    const result = await FinancialSnapshot.aggregate([
        {
            $group: {
                _id: null,
                totalInvoiced: { $sum: "$totalInvoiced" },
                totalPaid: { $sum: "$totalPaid" },
                outstandingBalance: { $sum: "$outstandingBalance" }
            }
        }
    ]);

    return result[0] || { totalInvoiced: 0, totalPaid: 0, outstandingBalance: 0 };
}

async function getMarginHeatmap(organizationId, req) {
    const { FinancialSnapshot, CaseCostSnapshot } = _getModels(req);
    const revenueData = await FinancialSnapshot.aggregate([
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: "$totalInvoiced" }
            }
        }
    ]);

    const costData = await CaseCostSnapshot.aggregate([
        {
            $group: {
                _id: null,
                totalInventoryCost: { $sum: "$totalInventoryCost" },
                totalLabCost: { $sum: "$totalLabCost" }
            }
        }
    ]);

    const revenue = revenueData[0]?.totalRevenue || 0;
    const costs = (costData[0]?.totalInventoryCost || 0) + (costData[0]?.totalLabCost || 0);

    return {
        revenue,
        costs,
        netMargin: revenue - costs,
        marginPercentage: revenue > 0 ? (((revenue - costs) / revenue) * 100).toFixed(2) : 0
    };
}

module.exports = {
    getRevenueTrend,
    getMarginHeatmap
};
