const mongoose = require("mongoose");

const familySchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        familyName: {
            type: String,
            required: true,
            trim: true,
        },

        normalizedFamilyName: {
            type: String,
        },

        type: {
            type: String,
            enum: ["household", "insurance", "corporate", "guardian"],
            default: "household",
        },

        notes: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

// Pre-save: normalize family name for search — Mongoose 9: async, no next() call
familySchema.pre("save", async function () {
    this.normalizedFamilyName = this.familyName.toLowerCase();
});

// Index for family suggestion search
familySchema.index({ organizationId: 1, normalizedFamilyName: 1 });

const modelName = "Family";

module.exports = {
    modelName,
    schema: familySchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, familySchema),
};
