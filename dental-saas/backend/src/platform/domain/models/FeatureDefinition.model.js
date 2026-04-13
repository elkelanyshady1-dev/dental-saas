/**
 * FeatureDefinition.model.js — Platform Feature Registry (DB)
 *
 * TASK-ENTITLEMENT-FULLSTACK-001
 *
 * Stores sub-feature definitions in MongoDB. Each feature belongs to a
 * module (e.g., "orthodontics.aiAnalysis" belongs to module "orthodontics").
 *
 * Platform admins can toggle individual features per plan tier and
 * mark features as premium (requiring explicit entitlement).
 *
 * PLANE: Platform only.
 */

"use strict";

const mongoose = require("mongoose");

const planAccessSchema = new mongoose.Schema(
    {
        basic:      { type: Boolean, default: false },
        pro:        { type: Boolean, default: false },
        enterprise: { type: Boolean, default: true },
    },
    { _id: false }
);

const metadataSchema = new mongoose.Schema(
    {
        apiDependency:  { type: String, default: "" },
        rateLimit:      { type: Number, default: 0 },
        notes:          { type: String, default: "" },
    },
    { _id: false }
);

const featureDefinitionSchema = new mongoose.Schema(
    {
        // Full dot-notation key (e.g., "orthodontics.aiAnalysis")
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },

        // Parent module key (e.g., "orthodontics")
        module: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },

        // Human-readable display name (e.g., "AI Dental Analysis")
        displayName: {
            type: String,
            required: true,
            trim: true,
        },

        // Feature description for admin dashboard
        description: {
            type: String,
            default: "",
            trim: true,
        },

        // RBAC permission required to access this feature
        permission: {
            type: String,
            default: "",
            trim: true,
        },

        // Whether this feature is premium (requires explicit entitlement)
        premium: {
            type: Boolean,
            default: false,
        },

        // Global enable/disable toggle
        enabled: {
            type: Boolean,
            default: true,
        },

        // Which plan tiers include this feature
        plans: {
            type: planAccessSchema,
            default: () => ({ basic: false, pro: false, enterprise: true }),
        },

        // Additional metadata for API dependencies, rate limits, etc.
        metadata: {
            type: metadataSchema,
            default: () => ({}),
        },
    },
    {
        timestamps: true,
        collection: "featureDefinitions",
    }
);

// For listing features by module
featureDefinitionSchema.index({ module: 1, key: 1 });

const modelName = "FeatureDefinition";

module.exports = {
    modelName,
    schema: featureDefinitionSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, featureDefinitionSchema),
};
