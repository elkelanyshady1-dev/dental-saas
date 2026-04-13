/**
 * organizationStorageUsage.model.js
 * ═══════════════════════════════════════════════════════════════
 * Tracks cumulative file storage usage per organization.
 *
 * One document per organization — updated atomically via $inc
 * on every upload/delete. This avoids expensive runtime
 * aggregation across file collections.
 *
 * Pattern: Matches CommunicationUsage model — single-document
 * counter per org updated via atomic increment.
 *
 * PLANE: Shared (readable by Platform for admin dashboards,
 *        writable by Org upload flows)
 * COLLECTION: organizationstorageusages
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const mongoose = require("mongoose");

// ─── Breakdown Sub-Schema ────────────────────────────────────────────────────
// Tracks bytes per file category for granular reporting.
const breakdownSchema = new mongoose.Schema({
    photos: { type: Number, default: 0, min: 0 },
    stl:    { type: Number, default: 0, min: 0 },
    audio:  { type: Number, default: 0, min: 0 },
    documents: { type: Number, default: 0, min: 0 },
    other:  { type: Number, default: 0, min: 0 },
}, { _id: false });

// ─── File Count Sub-Schema ───────────────────────────────────────────────────
// Tracks count of files per category.
const fileCountSchema = new mongoose.Schema({
    photos: { type: Number, default: 0, min: 0 },
    stl:    { type: Number, default: 0, min: 0 },
    audio:  { type: Number, default: 0, min: 0 },
    documents: { type: Number, default: 0, min: 0 },
    other:  { type: Number, default: 0, min: 0 },
}, { _id: false });

// ─── Main Schema ─────────────────────────────────────────────────────────────
const organizationStorageUsageSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            unique: true,
            index: true,
        },

        // Total storage in bytes across all categories
        totalBytes: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Total number of files across all categories
        totalFiles: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Per-category byte breakdown
        breakdown: {
            type: breakdownSchema,
            default: () => ({}),
        },

        // Per-category file count
        fileCount: {
            type: fileCountSchema,
            default: () => ({}),
        },

        // Last update timestamp (separate from updatedAt for monitoring)
        lastUploadAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: "organizationstorageusages",
    }
);

// ─── Virtual: human-readable total ───────────────────────────────────────────
organizationStorageUsageSchema.virtual("totalMB").get(function () {
    return Math.round((this.totalBytes / (1024 * 1024)) * 100) / 100;
});

organizationStorageUsageSchema.virtual("totalGB").get(function () {
    return Math.round((this.totalBytes / (1024 * 1024 * 1024)) * 100) / 100;
});

const modelName = "OrganizationStorageUsage";

module.exports = {
    modelName,
    schema: organizationStorageUsageSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, organizationStorageUsageSchema),
};
