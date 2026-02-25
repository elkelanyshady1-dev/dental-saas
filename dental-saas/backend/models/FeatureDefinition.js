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

module.exports = mongoose.model("FeatureDefinition", FeatureDefinitionSchema);
