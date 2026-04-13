/**
 * FeatureFlag.model.js
 * Tenant-Level Feature Flag Store
 *
 * PURPOSE:
 * Stores per-flag defaults and per-org overrides for feature gating.
 * This is the BACKEND (server-side) feature flag store — separate from the
 * platform-level SSE feature flags delivered to the frontend.
 *
 * TWO-LAYER FLAG ARCHITECTURE:
 *   Platform flags → platformFeatureFlags.js (ESM contract, platform-wide toggles)
 *   Tenant flags   → this collection (per-org overrides, runtime capability gates)
 *
 * Consumed by:
 *   featureFlagMiddleware.js  →  req.featureFlags
 *   unifiedCapabilityResolver.service.js
 *
 * PLANE: Platform / Billing
 * COLLECTION: featureflags
 */

"use strict";

const mongoose = require("mongoose");

const featureFlagSchema = new mongoose.Schema(
    {
        // ── Flag Key ──────────────────────────────────────────────────────────
        // Unique identifier for the feature flag (e.g. "analytics", "orthodontics").
        // Must match PlanVersion module keys for capability resolution to work correctly.
        flagKey: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            // index declared via schema.index({ flagKey: 1 }) below — do not add index: true here
        },

        // ── Default Value ─────────────────────────────────────────────────────
        // The global default for this flag when no org override exists.
        // true  = feature is ON for all orgs by default (entitlement still required)
        // false = feature is KILLED globally (even if entitled)
        defaultValue: {
            type: Boolean,
            default: true
        },

        // ── Per-Org Overrides ─────────────────────────────────────────────────
        // Map of { orgId (string) → boolean }
        // Override semantics (applied in featureFlagMiddleware):
        //   orgOverrides[orgId] = false → kills feature for that org regardless of entitlement
        //   orgOverrides[orgId] = true  → allows feature (entitlement still required)
        //   orgOverrides[orgId] = missing → use defaultValue
        orgOverrides: {
            type: Map,
            of: Boolean,
            default: {}
        },

        // ── Description ───────────────────────────────────────────────────────
        description: {
            type: String,
            default: null
        },

        // ── Metadata ──────────────────────────────────────────────────────────
        updatedBy: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true,
        collection: "featureflags"
    }
);

// Index for bulk flag load in middleware (load all → resolve per-org)
featureFlagSchema.index({ flagKey: 1 });

const modelName = "FeatureFlag";

module.exports = {
    modelName,
    schema: featureFlagSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, featureFlagSchema),
};

