const mongoose = require("mongoose");

const PlatformConfigSchema = new mongoose.Schema(
    {
        platformName: { type: String, default: "Platform Command" },
        supportEmail: { type: String, default: "support@platform.com" },
        defaultCurrency: { type: String, default: "USD" },
        defaultTrialDays: { type: Number, default: 14 },

        retryAttempts: { type: Number, default: 3 },
        retryIntervalDays: { type: Number, default: 3 },
        autoSuspend: { type: Boolean, default: true },
        gracePeriodDays: { type: Number, default: 7 },

        allowTrialExtension: { type: Boolean, default: true },
        allowPlanDowngrade: { type: Boolean, default: true },

        sessionTimeoutMinutes: { type: Number, default: 60 },
        maxLoginAttempts: { type: Number, default: 5 },
    },
    { timestamps: true }
);

const modelName = "PlatformConfig";

module.exports = {
    modelName,
    schema: PlatformConfigSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, PlatformConfigSchema),
};
