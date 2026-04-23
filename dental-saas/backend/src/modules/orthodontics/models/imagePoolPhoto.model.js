/**
 * imagePoolPhoto.model.js — ImagePoolPhoto (Separate Collection)
 * ═══════════════════════════════════════════════════════════════
 * Standalone model for bulk-uploaded orthodontic photos.
 *
 * Architecture decision: separate collection instead of embedding in
 * OrthodonticCase to avoid document bloat, enable independent scaling,
 * and allow efficient queries/indexes on pool photos.
 *
 * Each document represents one uploaded photo in the image pool,
 * scoped to a specific case + recordSet.
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const mongoose = require("mongoose");

const compressionSchema = new mongoose.Schema({
    applied:        { type: Boolean, default: false },
    layer:          { type: String, enum: ["client", "server", "both", null], default: null },
    originalSize:   { type: Number, default: null },
    compressedSize: { type: Number, default: null },
    ratio:          { type: Number, default: null },
}, { _id: false });

const imagePoolPhotoSchema = new mongoose.Schema(
    {
        caseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrthodonticCase",
            required: true,
            index: true,
        },
        recordSetId: {
            type: String,
            required: true,
        },

        // ── Storage ─────────────────────────────────────────────
        storageKey:   { type: String, required: true },
        url:          { type: String, default: null },
        thumbnailKey: { type: String, default: null },
        thumbnailUrl: { type: String, default: null },

        // ── File metadata ───────────────────────────────────────
        originalName:    { type: String, required: true },
        sizeBytes:       { type: Number, default: 0, min: 0 },
        mimeType:        { type: String, required: true },
        storageProvider: {
            type: String,
            enum: ["local", "s3", "gcs"],
            default: "local",
        },

        // ── Assignment ──────────────────────────────────────────
        assignment: {
            view:       { type: String, default: null },
            assignedAt: { type: Date, default: null },
        },

        // ── Batch tracking ──────────────────────────────────────
        batchId: { type: String, required: true },

        // ── Ownership ───────────────────────────────────────────
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        uploadedAt: { type: Date, default: Date.now },

        // ── Compression metadata ────────────────────────────────
        compression: { type: compressionSchema, default: null },

        // ── Soft delete ─────────────────────────────────────────
        deletedAt: { type: Date, default: null },
    },
    {
        timestamps: true, // adds createdAt + updatedAt
    }
);

// ── Indexes ─────────────────────────────────────────────────────────────────
// Primary query pattern: list pool for a case + recordSet
imagePoolPhotoSchema.index({ caseId: 1, recordSetId: 1 });

// Assignment lookup (find what's assigned to a view)
imagePoolPhotoSchema.index({ "assignment.view": 1 });

// Chronological listing
imagePoolPhotoSchema.index({ uploadedAt: -1 });

// Cleanup job: find soft-deleted entries
imagePoolPhotoSchema.index({ deletedAt: 1 });

// Batch grouping
imagePoolPhotoSchema.index({ batchId: 1 });

const modelName = "ImagePoolPhoto";

module.exports = {
    modelName,
    schema: imagePoolPhotoSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, imagePoolPhotoSchema),
};
