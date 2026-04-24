/**
 * inventory.projection.js
 * Analytics Domain — Low-stock alerts + 30-day burn leaderboard
 *
 * HR-1: $match first; inventory collections small, both queries use indexes.
 *
 * PLANE: Org only.
 */

"use strict";

const getModel = require("@core/db/getModel");
const InventoryItemDef = require("../../inventoryDomain/models/inventoryItem.model");
const InventoryTransactionDef = require("../../inventoryDomain/models/inventoryTransaction.model");

async function getInventoryAlerts(req, { branchFilter }) {
    const InventoryItem = getModel(req.dbConnection, InventoryItemDef);

    const items = await InventoryItem.find({
        ...branchFilter,
        isActive: true,
        $expr: { $lt: ["$stockLevel", "$minStockLevel"] },
    })
        .select("_id name stockLevel minStockLevel")
        .sort({ stockLevel: 1 })
        .limit(50)
        .lean();

    return items.map((i) => ({
        itemId: String(i._id),
        name: i.name || "—",
        stockLevel: i.stockLevel || 0,
        minStockLevel: i.minStockLevel || 0,
    }));
}

async function getInventoryBurn(req, { from, to, branchFilter }) {
    const InventoryTransaction = getModel(req.dbConnection, InventoryTransactionDef);

    const rows = await InventoryTransaction.aggregate([
        {
            $match: {
                ...branchFilter,
                type: "OUT",
                createdAt: { $gte: new Date(from), $lte: new Date(to) },
            },
        },
        {
            $group: {
                _id: "$itemId",
                totalBurn: { $sum: { $ifNull: ["$quantity", 0] } },
            },
        },
        { $sort: { totalBurn: -1 } },
        { $limit: 10 },
        {
            $lookup: {
                from: "inventoryitems",
                localField: "_id",
                foreignField: "_id",
                as: "item",
            },
        },
        { $unwind: { path: "$item", preserveNullAndEmptyArrays: true } },
        {
            $project: {
                _id: 0,
                itemId: "$_id",
                name: "$item.name",
                totalBurn: 1,
            },
        },
    ]).allowDiskUse(false);

    return rows.map((r) => ({
        itemId: String(r.itemId),
        name: r.name || "—",
        totalBurn: r.totalBurn || 0,
    }));
}

module.exports = { getInventoryAlerts, getInventoryBurn };
