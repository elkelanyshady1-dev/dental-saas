/**
 * stockMovement.model.js
 *
 * APPEND-ONLY audit ledger for all stock changes.
 * Aligned to TASK-INV-002 spec.
 *
 * INVARIANTS:
 * - NEVER update or delete records
 * - Every mutation (IN / OUT / ADJUSTMENT) must log here
 * - Full audit trail maintained forever
 *
 * PLANE: Org only. Per-org DB — no organizationId needed on schema queries.
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const StockMovementSchema = new Schema({
    itemId:      { type: Schema.Types.ObjectId, required: true, index: true },
    type:        { type: String, enum: ["IN", "OUT", "ADJUSTMENT"], required: true },
    quantity:    { type: Number, required: true },
    reference:   { type: String },          // PO number, case ID, adjustment note
    performedBy: { type: String },          // userId string
    cost:        { type: Number, default: 0 }, // unit cost at time of movement
    note:        { type: String },
    createdAt:   { type: Date, default: Date.now, immutable: true },
}, {
    timestamps: false,  // createdAt is immutable, no updatedAt
    versionKey: false,
});

// Compound indexes for performant audit trail queries
StockMovementSchema.index({ itemId: 1, createdAt: -1 });
StockMovementSchema.index({ createdAt: -1 });

const modelName = "StockMovement";

module.exports = {
    modelName,
    schema: StockMovementSchema,
};
