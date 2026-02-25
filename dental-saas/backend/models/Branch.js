const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },

        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        type: {
            type: String,
            enum: ["internal", "external"],
            default: "internal",
        },

        address: {
            type: String,
            default: "",
        },

        phone: {
            type: String,
            default: "",
        },

        isActive: {
            type: Boolean,
            default: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },

        // ─── Branch-level override — inherits from org if both null ───────────────
        workingHoursOverride: {
            start: { type: String, default: null },
            end: { type: String, default: null },
        },
    },
    { timestamps: true }
);

branchSchema.index({ name: 1 });
branchSchema.index({ organizationId: 1 });

module.exports = mongoose.model("Branch", branchSchema);