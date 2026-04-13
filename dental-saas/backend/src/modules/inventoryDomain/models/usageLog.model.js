/**
 * usageLog.model.js
 *
 * Records item consumption per clinical procedure.
 * Feeds the accounting expense projection via events.
 *
 * PLANE: Org only. Per-org DB.
 */

"use strict";

const mongoose = require("mongoose");
const { Schema } = mongoose;

const UsageLogSchema = new Schema({
    itemId:    { type: Schema.Types.ObjectId, required: true, index: true },
    patientId: { type: Schema.Types.ObjectId },
    procedure: { type: String },
    clinician: { type: String },   // userId string
    quantity:  { type: Number, required: true, min: 0 },
    totalCost: { type: Number, default: 0 }, // quantity × unitCost at time of use
    createdAt: { type: Date, default: Date.now, immutable: true },
}, {
    timestamps: false,
    versionKey: false,
});

UsageLogSchema.index({ createdAt: -1 });
UsageLogSchema.index({ itemId: 1, createdAt: -1 });

const modelName = "UsageLog";

module.exports = {
    modelName,
    schema: UsageLogSchema,
};
