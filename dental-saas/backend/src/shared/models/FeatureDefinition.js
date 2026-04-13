const mongoose = require("mongoose");

const FeatureDefinitionSchema = new mongoose.Schema(
    {
        key: { type: String, required: true },
        name: String,
        description: String,
        category: {
            type: String,
            enum: ["clinical", "financial", "ai", "integration", "admin"],
        },
        defaultEnabled: { type: Boolean, default: false },
        isCore: { type: Boolean, default: false },
        allowedPlans: [{ type: String }],
        allowedRoles: [{ type: String }],
    },
    { timestamps: true }
);

FeatureDefinitionSchema.index({ key: 1 }, { unique: true });

const modelName = "FeatureDefinition";

module.exports = {
    modelName,
    schema: FeatureDefinitionSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, FeatureDefinitionSchema),
};
