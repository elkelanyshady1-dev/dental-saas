const mongoose = require("mongoose");

const organizationSettingsSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        primaryColor: {
            type: String,
        },
        logo: {
            type: String, // Used for S3 or local path ref
        },
        whatsappNumber: {
            type: String,
        },
        aboutText: {
            type: String,
        },
        customDomain: {
            type: String,
        },
        isPublicLandingEnabled: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

organizationSettingsSchema.index({ organizationId: 1 }, { unique: true });

const modelName = "OrganizationSettings";

module.exports = {
    modelName,
    schema: organizationSettingsSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, organizationSettingsSchema),
};
