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

// Pre-save: normalize family name for search
familySchema.pre("save", function (next) {
    this.normalizedFamilyName = this.familyName.toLowerCase();
    next();
});

// Index for family suggestion search
familySchema.index({ organizationId: 1, normalizedFamilyName: 1 });

module.exports = mongoose.model("Family", familySchema);
