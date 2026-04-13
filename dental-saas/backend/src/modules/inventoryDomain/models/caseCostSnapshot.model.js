const mongoose = require("mongoose");

const caseCostSnapshotSchema = new mongoose.Schema({
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
    caseId: { type: mongoose.Schema.Types.ObjectId, ref: "ClinicalCase", required: true },
    totalInventoryCost: { type: Number, default: 0 },
    totalLabCost: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
});

// Standardized single-field indexes
caseCostSnapshotSchema.index({ caseId: 1 }, { unique: true });

const modelName = "CaseCostSnapshot";

module.exports = {
    modelName,
    schema: caseCostSnapshotSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, caseCostSnapshotSchema),
};
