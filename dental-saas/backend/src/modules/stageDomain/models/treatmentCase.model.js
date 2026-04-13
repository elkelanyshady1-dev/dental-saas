const mongoose = require("mongoose");

const treatmentCaseSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true
        },
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true
        },
        procedureType: {
            type: String,
            required: true
        },
        stageTemplateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "StageTemplate",
            required: true
        },
        status: {
            type: String,
            enum: ["active", "completed", "cancelled", "on_hold"],
            default: "active"
        },
        lastActivityAt: { type: Date, default: Date.now },
        version: { type: Number, default: 0 },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    { timestamps: true }
);

// Standardized single-field indexes
treatmentCaseSchema.index({ organizationId: 1 });
treatmentCaseSchema.index({ branchId: 1 });
treatmentCaseSchema.index({ patientId: 1 });

const modelName = "TreatmentCase";

module.exports = {
    modelName,
    schema: treatmentCaseSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, treatmentCaseSchema),
};
