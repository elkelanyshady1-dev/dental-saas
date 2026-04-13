const mongoose = require("mongoose");

const inventoryTransactionSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    type: { type: String, enum: ["IN", "OUT", "ADJUSTMENT"], required: true },
    quantity: { type: Number, required: true },
    caseId: { type: mongoose.Schema.Types.ObjectId }, // Linked to ClinicalCase if OUT
    reason: { type: String },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, default: Date.now }
});

const modelName = "InventoryTransaction";

module.exports = {
    modelName,
    schema: inventoryTransactionSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, inventoryTransactionSchema),
};
