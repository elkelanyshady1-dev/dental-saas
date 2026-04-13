/**
 * inventoryDashboardProjection.model.js
 *
 * CQRS READ MODEL — Dashboard projection.
 * Singleton per org (single document per DB).
 *
 * NEVER written from controllers.
 * Updated exclusively by inventoryProjection.service.js.
 *
 * PLANE: Org only. Per-org DB.
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const InventoryDashboardProjectionSchema = new Schema({
    _id:             { type: String, default: "dashboard" }, // singleton
    totalItems:      { type: Number, default: 0 },
    lowStockCount:   { type: Number, default: 0 },
    totalValue:      { type: Number, default: 0 },    // sum(stock × unitCost)
    totalUsedToday:  { type: Number, default: 0 },
    pendingOrders:   { type: Number, default: 0 },
    lastUpdatedAt:   { type: Date, default: Date.now },
}, {
    timestamps: false,
    versionKey: false,
    _id:        false,
});

const modelName = "InventoryDashboardProjection";

module.exports = {
    modelName,
    schema: InventoryDashboardProjectionSchema,
};
