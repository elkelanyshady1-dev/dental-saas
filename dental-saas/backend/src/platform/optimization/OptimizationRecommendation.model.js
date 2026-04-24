/**
 * OptimizationRecommendation.model.js
 * Platform Plane — Cost Optimization Recommendation History
 *
 * Each entry is a snapshot of one analyzer pass for one org. The latest
 * (by createdAt) is the active recommendation; older entries are kept
 * for audit / trend analysis.
 *
 * PLANE: Platform.
 * BINDING: resolved via getPlatformModel(def) — never globally registered.
 */

"use strict";

const mongoose = require("mongoose");

const ACTIONS = ["MOVE", "DOWNGRADE", "ARCHIVE", "ARCHIVE_PARTIAL", "KEEP"];
const STATUSES = ["PENDING", "EXECUTING", "EXECUTED", "FAILED", "SKIPPED"];
const RISK = ["LOW", "MEDIUM", "HIGH"];

const optimizationRecommendationSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },

        // Snapshot of cluster placement at analysis time.
        currentCluster: { type: String, required: true },
        targetCluster:  { type: String, default: null },

        // Computed metrics at analysis time. Free-form to keep the schema
        // forward-compatible — costMetrics.collectForOrg owns the shape.
        metrics: {
            dbSizeMB:           { type: Number, default: 0 },
            storageMB:          { type: Number, default: 0 },
            indexMB:            { type: Number, default: 0 },
            collectionCount:    { type: Number, default: 0 },
            documentCount:      { type: Number, default: 0 },
            lastActiveAt:       { type: Date,   default: null },
            daysSinceActive:    { type: Number, default: 0 },
            activityScore:      { type: Number, default: 0 },   // 0..100
            clusterLoad:        { type: Number, default: 0 },   // 0..1
        },

        // Engine output.
        recommendedAction: {
            type: String,
            enum: ACTIONS,
            required: true,
            index: true,
        },
        reason: { type: String, default: "" },

        // Estimated monthly cost saving in USD if this recommendation is acted on.
        // Computed by costMetrics; coarse — based on cluster tier delta.
        costSavingEstimateUsd: { type: Number, default: 0 },

        riskLevel: {
            type: String,
            enum: RISK,
            default: "LOW",
        },

        // Lifecycle status of THIS recommendation (one row per analysis pass).
        status: {
            type: String,
            enum: STATUSES,
            default: "PENDING",
            index: true,
        },

        // Set when the executor flips status → EXECUTED / FAILED.
        executedAt: { type: Date, default: null },
        executedBy: { type: String, default: null },
        executionResult: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// Latest-recommendation-per-org lookup.
optimizationRecommendationSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = {
    modelName: "OptimizationRecommendation",
    schema: optimizationRecommendationSchema,
    ACTIONS,
    STATUSES,
    RISK,
};
