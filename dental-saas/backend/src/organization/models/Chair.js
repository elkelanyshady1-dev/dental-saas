const mongoose = require("mongoose");

const chairSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },

        name: {
            type: String,
            required: true,
            trim: true,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

chairSchema.index({ organizationId: 1, branchId: 1 });

const modelName = "Chair";

module.exports = {
    modelName,
    schema: chairSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, chairSchema),
};
