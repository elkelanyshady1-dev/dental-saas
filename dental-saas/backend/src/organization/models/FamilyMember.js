const mongoose = require("mongoose");

const familyMemberSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        familyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Family",
            required: true,
        },

        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
        },

        relation: {
            type: String,
            required: true,
            trim: true,
        },

        isHead: {
            type: Boolean,
            default: false,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        deletedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

// Indexes for lookups
familyMemberSchema.index({ organizationId: 1, familyId: 1 });
familyMemberSchema.index({ organizationId: 1, patientId: 1 });
familyMemberSchema.index(
    { organizationId: 1, familyId: 1, patientId: 1 },
    { unique: true }
);

const modelName = "FamilyMember";

module.exports = {
    modelName,
    schema: familyMemberSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, familyMemberSchema),
};
