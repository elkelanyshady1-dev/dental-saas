/**
 * ModuleDefinition.model.js — Platform Module Registry (DB)
 *
 * TASK-ENTITLEMENT-FULLSTACK-001
 *
 * Stores module definitions in MongoDB, allowing platform admins to
 * manage module enable/disable state and plan assignments at runtime.
 *
 * Each document mirrors a static FEATURE_REGISTRY entry but can be
 * overridden by platform operators (e.g., enabling orthodontics for pro plans).
 *
 * IMPORTANT: The static featureRegistry.js remains the code-time source of truth
 * for key mappings and normalization. This collection stores runtime config only.
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

const moduleDefinitionSchema = new mongoose.Schema(
    {
        // Canonical module key — matches FEATURE_REGISTRY key (e.g., "orthodontics")
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },

        // PlanVersion schema field name (e.g., "orthodonticsAdv")
        schemaKey: {
            type: String,
            required: true,
            trim: true,
        },

        // Human-readable display name for UI
        displayName: {
            type: String,
            required: true,
            trim: true,
        },

        // Module description for admin dashboard
        description: {
            type: String,
            default: "",
            trim: true,
        },

        // Whether this module is a core module (always available, bypasses entitlement)
        isCore: {
            type: Boolean,
            default: false,
        },

        // Global enable/disable toggle — when false, module is disabled system-wide
        enabled: {
            type: Boolean,
            default: true,
        },

        // Which plan tiers include this module
        plans: {
            type: planAccessSchema,
            default: () => ({ basic: false, pro: false, enterprise: true }),
        },

        // Display order in admin UI
        sortOrder: {
            type: Number,
            default: 0,
        },

        // Icon identifier for UI rendering
        icon: {
            type: String,
            default: "Package",
        },

        // Category for grouping in UI: "core", "clinical", "addons"
        category: {
            type: String,
            enum: ["core", "clinical", "business", "addons", "communication"],
            default: "addons",
        },

        // Feature count (computed from FeatureDefinition docs, cached for UI)
        featureCount: {
            type: Number,
            default: 0,
        },
    },
    {
        timestamps: true,
        collection: "moduleDefinitions",
    }
);

// Compound index for efficient listing
moduleDefinitionSchema.index({ category: 1, sortOrder: 1 });

const modelName = "ModuleDefinition";

module.exports = {
    modelName,
    schema: moduleDefinitionSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, moduleDefinitionSchema),
};
