/**
 * inventoryAlertsProjection.model.js
 *
 * CQRS READ MODEL — Low-stock alerts.
 * One document per low-stock item.
 *
 * NEVER written from controllers.
 * Updated exclusively by inventoryProjection.service.js.
 *
 * PLANE: Org only. Per-org DB.
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const InventoryAlertsProjectionSchema = new Schema({
    itemId:       { type: Schema.Types.ObjectId, required: true, unique: true },
    itemName:     { type: String },
    currentStock: { type: Number },
    minStock:     { type: Number },
    severity:     { type: String, enum: ["warning", "critical"], default: "warning" },
    detectedAt:   { type: Date, default: Date.now },
    resolvedAt:   { type: Date, default: null },
}, {
    timestamps: false,
    versionKey: false,
});

const modelName = "InventoryAlertsProjection";

module.exports = {
    modelName,
    schema: InventoryAlertsProjectionSchema,
};
