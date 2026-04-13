/**
 * ScanFile.model.js
 * Phase 4 — Orthodontic Intelligence: Scan File Storage
 *
 * Represents an uploaded 3D scan or image file.
 * Tenant-isolated by organizationId.
 * Storage: S3/object storage at org/{organizationId}/cases/{caseId}/scans/
 */

"use strict";

const mongoose = require("mongoose");

const scanFileSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },
        caseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrthodonticCase",
            required: true
        },
        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true
        },
        fileType: {
            type: String,
            required: true,
            enum: ["stl", "ply", "obj", "dicom", "npy", "photo", "cbct"],
            lowercase: true
        },
        // Object storage key (S3 path)
        fileKey: {
            type: String,
            required: true,
            trim: true
        },
        // Original filename from upload
        originalFileName: {
            type: String,
            trim: true
        },
        // File size in bytes
        fileSize: {
            type: Number,
            min: 0
        },
        // Which jaw the scan covers
        archType: {
            type: String,
            enum: ["upper", "lower", "both", "full_face", "unknown"],
            default: "unknown"
        },
        // Resolved local path for AI engine processing
        localPath: {
            type: String,
            default: null
        },
        // Processing status
        processingStatus: {
            type: String,
            enum: ["uploaded", "queued", "processing", "processed", "failed"],
            default: "uploaded"
        },
        processingError: {
            type: String,
            default: null
        },
        // Audit
        uploadedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        version: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
scanFileSchema.index({ organizationId: 1, caseId: 1, fileType: 1 });
scanFileSchema.index({ organizationId: 1, patientId: 1 });
scanFileSchema.index({ organizationId: 1, processingStatus: 1 });
scanFileSchema.index({ fileKey: 1 }, { unique: true });

// ─── Virtual: storage path builder ───────────────────────────────────────────
scanFileSchema.virtual("storagePath").get(function () {
    return `org/${this.organizationId}/cases/${this.caseId}/scans/${this.fileKey}`;
});

const modelName = "ScanFile";

module.exports = {
    modelName,
    schema: scanFileSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, scanFileSchema),
};
