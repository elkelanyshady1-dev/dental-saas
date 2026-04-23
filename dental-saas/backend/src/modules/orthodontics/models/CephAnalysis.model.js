/**
 * CephAnalysis.model.js
 * Phase 4 — Orthodontic Intelligence: Cephalometric Analysis Result
 *
 * Persists cephalometric landmark positions, angular measurements,
 * and linear measurements derived from lateral ceph X-rays or CBCT.
 * Tenant-isolated by organizationId.
 */

"use strict";

const mongoose = require("mongoose");

const landmarkSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        // 2D coordinates (for lateral ceph)
        x: { type: Number },
        y: { type: Number },
        // 3D coordinates (for CBCT)
        z: { type: Number },
        confidence: {
            type: Number,
            min: 0,
            max: 1,
            default: 0
        },
        // Whether this landmark was manually adjusted
        manuallyAdjusted: {
            type: Boolean,
            default: false
        }
    },
    { _id: false }
);

const measurementSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        value: {
            type: Number,
            required: true
        },
        unit: {
            type: String,
            enum: ["degrees", "mm", "ratio"],
            required: true
        },
        normalRange: {
            min: { type: Number },
            max: { type: Number }
        },
        interpretation: {
            type: String,
            trim: true
        }
    },
    { _id: false }
);

const cephAnalysisSchema = new mongoose.Schema(
    {
        caseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrthodonticCase",
            required: true
        },
        scanFileId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ScanFile"
        },
        // Analysis type
        analysisType: {
            type: String,
            enum: ["lateral_ceph", "pa_ceph", "cbct_3d", "custom"],
            required: true,
            default: "lateral_ceph"
        },
        // AI model metadata
        modelVersion: {
            type: String,
            required: true,
            trim: true
        },
        // Detected landmarks
        landmarks: [landmarkSchema],
        // Computed angles
        angles: {
            SNA: { type: Number },
            SNB: { type: Number },
            ANB: { type: Number },
            FMA: { type: Number },           // Frankfort Mandibular Angle
            IMPA: { type: Number },          // Incisor Mandibular Plane Angle
            interincisalAngle: { type: Number },
            gonialAngle: { type: Number },
            upperIncisorToNA: { type: Number },
            lowerIncisorToNB: { type: Number },
            wittsAppraisal: { type: Number }
        },
        // Linear measurements
        measurements: [measurementSchema],
        // Skeletal classification
        skeletalClassification: {
            type: String,
            enum: ["CLASS_I", "CLASS_II", "CLASS_III"],
            default: null
        },
        // Growth pattern
        growthPattern: {
            type: String,
            enum: ["normal", "hyperdivergent", "hypodivergent"],
            default: null
        },
        // AI-generated diagnosis summary
        diagnosisSummary: {
            type: String,
            trim: true,
            default: ""
        },
        // Processing metadata
        inferenceTimeMs: {
            type: Number,
            default: 0
        },
        landmarkCount: {
            type: Number,
            default: 0
        },
        meanConfidence: {
            type: Number,
            min: 0,
            max: 1,
            default: 0
        },
        // Status
        status: {
            type: String,
            enum: ["pending", "completed", "failed", "reviewed"],
            default: "pending"
        },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        reviewedAt: {
            type: Date
        },
        errorMessage: {
            type: String,
            default: null
        },
        version: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────
cephAnalysisSchema.index({ caseId: 1, createdAt: -1 });
cephAnalysisSchema.index({ status: 1 });

const modelName = "CephAnalysis";

module.exports = {
    modelName,
    schema: cephAnalysisSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, cephAnalysisSchema),
};
