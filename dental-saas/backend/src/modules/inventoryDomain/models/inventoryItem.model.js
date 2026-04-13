const mongoose = require("mongoose");

const inventoryItemSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
    name: { type: String, required: true },
    sku: { type: String },
    stockLevel: { type: Number, default: 0 },
    unitCost: { type: Number, required: true },
    minStockLevel: { type: Number, default: 5 },
    category: { type: String },
    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 0 }
});

const modelName = "InventoryItem";

module.exports = {
    modelName,
    schema: inventoryItemSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, inventoryItemSchema),
};
