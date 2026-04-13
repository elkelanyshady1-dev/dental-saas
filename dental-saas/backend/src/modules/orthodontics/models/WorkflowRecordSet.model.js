"use strict";

/**
 * WorkflowRecordSet.model.js
 *
 * Extracted from WorkflowSnapshot.recordSets[] (P1-1 event-source refactor).
 *
 * Previously, record sets (photos, STL scans, problem lists, treatment plans)
 * were embedded as a sub-array inside WorkflowSnapshot. That caused:
 *   - Unbounded document growth as record counts increased
 *   - Inability to query/paginate record sets independently
 *   - Full snapshot rewrites on every record set mutation
 *
 * This collection normalises them into a dedicated, per-org collection,
 * linked back to their originating snapshot via snapshotId.
 *
 * @per-org-compliant — lives in the per-org DB, organizationId always from req.context
 */

const mongoose = require("mongoose");

// ── Sub-schemas (mirrors WorkflowSnapshot embedded schemas) ──────────────────

const recordSchema = new mongoose.Schema({
    id:               { type: String, required: true },
    type:             { type: String },
    url:              { type: String, default: null },
    label:            { type: String },
    aspectRatio:      { type: String },
    orientation:      { type: String, enum: ["portrait", "landscape"], default: "portrait" },
    flipH:            { type: Boolean, default: false },
    flipV:            { type: Boolean, default: false },
    crop:             { type: mongoose.Schema.Types.Mixed, default: null },
    analysis:         { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt:        { type: Date, default: Date.now },
    sizeBytes:        { type: Number, default: 0 },
    mimeType:         { type: String, default: null },
    originalName:     { type: String, default: null },
    storageProvider:  { type: String, enum: ["local", "s3", "gcs"], default: "local" },
}, { _id: false });

const stlFileSchema = new mongoose.Schema({
    id:               { type: String, required: true },
    name:             { type: String },
    url:              { type: String },
    archType:         { type: String, enum: ["upper", "lower", "both", "unknown"], default: "unknown" },
    processed:        { type: Boolean, default: false },
    analysis:         { type: mongoose.Schema.Types.Mixed },
    createdAt:        { type: Date, default: Date.now },
    sizeBytes:        { type: Number, default: 0 },
    mimeType:         { type: String, default: null },
    originalName:     { type: String, default: null },
    storageProvider:  { type: String, enum: ["local", "s3", "gcs"], default: "local" },
}, { _id: false });

// ── Main schema ───────────────────────────────────────────────────────────────

const workflowRecordSetSchema = new mongoose.Schema(
    {
        organizationId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Organization",
            required: true,
        },
        caseId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "OrthodonticCase",
            required: true,
        },
        // The snapshot this record set was created under.
        // Links this document back to its originating WorkflowSnapshot.
        snapshotId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "WorkflowSnapshot",
            default: null,
        },
        // Stable client-generated ID carried over from the embedded recordSet.id
        // so existing references remain valid after extraction.
        legacyId: {
            type:    String,
            default: null,
        },
        name: {
            type:    String,
            default: "Record Set",
        },
        type: {
            type:    String,
            enum:    ["PRE", "MID", "POST", "CUSTOM"],
            default: "CUSTOM",
        },
        // Snapshot version number at the time this record set was saved.
        // Populated by the migration and by the service layer on new writes.
        version: {
            type:    Number,
            default: null,
        },
        date:           { type: String, default: null },
        chiefComplaint: { type: String, default: "" },
        audioUrl:       { type: String, default: null },
        records:        { type: [recordSchema], default: [] },
        stlFiles:       { type: [stlFileSchema], default: [] },
        problemList:    { type: mongoose.Schema.Types.Mixed, default: null },
        treatmentPlan:  { type: mongoose.Schema.Types.Mixed, default: null },
    },
    { timestamps: true }
);

// ── Indices ───────────────────────────────────────────────────────────────────

// Primary lookup: all record sets for a case (most-recent-first)
workflowRecordSetSchema.index({ caseId: 1, createdAt: -1 });

// Snapshot-scoped lookup (for restoring a full snapshot's record sets)
workflowRecordSetSchema.index({ snapshotId: 1 });

// Org-scoped lookup (tenant isolation queries)
workflowRecordSetSchema.index({ organizationId: 1 });

// legacyId lookup (migration + cross-reference resolution)
workflowRecordSetSchema.index({ caseId: 1, legacyId: 1 });

// ── Export ────────────────────────────────────────────────────────────────────

const modelName = "WorkflowRecordSet";

module.exports = {
    modelName,
    schema: workflowRecordSetSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, workflowRecordSetSchema),
};
