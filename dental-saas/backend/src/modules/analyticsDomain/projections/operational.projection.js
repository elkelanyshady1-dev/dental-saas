/**
 * operational.projection.js
 * Phase F.2 — RLS Migration
 *
 * Provides resource utilization metrics (Inventory burn rate, stock alerts).
 *
 * @per-org-compliant — Uses secureModel-backed read service
 */

const inventoryReadService = require("../../inventoryDomain/read/inventory.read.service");

async function getInventoryBurnRate(organizationId, req) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return await inventoryReadService.aggregateTransactions(req, [
        {
            $match: {
                type: "OUT",
                createdAt: { $gte: thirtyDaysAgo }
            }
        },
        {
            $group: {
                _id: "$itemId",
                totalBurn: { $sum: "$quantity" }
            }
        },
        {
            $lookup: {
                from: "inventoryitems",
                localField: "_id",
                foreignField: "_id",
                as: "itemInfo"
            }
        },
        { $unwind: "$itemInfo" },
        {
            $project: {
                itemName: "$itemInfo.name",
                totalBurn: 1,
                _id: 0
            }
        },
        { $sort: { totalBurn: -1 } },
        { $limit: 10 }
    ]);
}

async function getStockExhaustionAlerts(organizationId, req) {
    return await inventoryReadService.findItems(req, {
        $expr: { $lt: ["$stockLevel", "$minStockLevel"] },
        isActive: true
    }, "name stockLevel minStockLevel");
}

module.exports = {
    getInventoryBurnRate,
    getStockExhaustionAlerts
};
