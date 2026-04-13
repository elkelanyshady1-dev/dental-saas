"use strict";

const mongoose = require("mongoose");

// ── Snapshot sub-schemas ──────────────────────────────────────────────────

const snapshotRecordSchema = new mongoose.Schema({
    id:          { type: String, required: true },
    type:        { type: String },
    url:         { type: String, default: null },
    label:       { type: String },
    aspectRatio: { type: String },
    orientation: { type: String, enum: ["portrait", "landscape"], default: "portrait" },
    flipH:       { type: Boolean, default: false },
    flipV:       { type: Boolean, default: false },
    crop:        { type: mongoose.Schema.Types.Mixed, default: null },
    analysis:    { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt:   { type: Date, default: Date.now },
    sizeBytes:   { type: Number, default: 0 },
    mimeType:    { type: String, default: null },
    originalName: { type: String, default: null },
    storageProvider: { type: String, enum: ["local", "s3", "gcs"], default: "local" },
}, { _id: false });

const snapshotStlSchema = new mongoose.Schema({
    id:        { type: String, required: true },
    name:      { type: String },
    url:       { type: String },
    archType:  { type: String, enum: ["upper", "lower", "both", "unknown"], default: "unknown" },
    processed: { type: Boolean, default: false },
    analysis:  { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    sizeBytes: { type: Number, default: 0 },
    mimeType:  { type: String, default: null },
    originalName: { type: String, default: null },
    storageProvider: { type: String, enum: ["local", "s3", "gcs"], default: "local" },
}, { _id: false });

const snapshotRecordSetSchema = new mongoose.Schema({
    id:             { type: String, required: true },
    name:           { type: String, default: "Record Set" },
    type:           { type: String, enum: ["PRE", "MID", "POST", "CUSTOM"], default: "CUSTOM" },
    date:           { type: String },
    chiefComplaint: { type: String, default: "" },
    audioUrl:       { type: String, default: null },
    records:        { type: [snapshotRecordSchema], default: [] },
    stlFiles:       { type: [snapshotStlSchema], default: [] },
    problemList:    { type: mongoose.Schema.Types.Mixed, default: null },
    treatmentPlan:  { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

// ── Main Snapshot Schema ──────────────────────────────────────────────────

const workflowSnapshotSchema = new mongoose.Schema(
    {
        organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
        caseId:         { type: mongoose.Schema.Types.ObjectId, ref: "OrthodonticCase", required: true },
        version:        { type: Number, required: true, min: 1 },
        trigger: {
            type: String,
            enum: ["SAVE", "AUTO", "SHARE", "APPROVE", "RESTORE", "IMPORT"],
            default: "SAVE",
        },
        label:          { type: String, default: null, maxlength: 200 },
        parentSnapshotId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "WorkflowSnapshot",
            default: null,
        },
        recordSets:       { type: [snapshotRecordSetSchema], default: [] },
        problemList:      { type: [mongoose.Schema.Types.Mixed], default: [] },
        treatmentGoals:   { type: [mongoose.Schema.Types.Mixed], default: [] },
        treatmentOptions: { type: [mongoose.Schema.Types.Mixed], default: [] },
        selectedOptionId: { type: String, default: null },
        finalPlan:        { type: mongoose.Schema.Types.Mixed, default: null },
        currentStep:      { type: Number, default: 0, min: 0, max: 5 },
        savedBy:          { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        summary: {
            totalRecordSets: { type: Number, default: 0 },
            totalPhotos:     { type: Number, default: 0 },
            photosWithUrl:   { type: Number, default: 0 },
            totalStlFiles:   { type: Number, default: 0 },
            totalProblems:   { type: Number, default: 0 },
            totalGoals:      { type: Number, default: 0 },
        },
        // ── Sequence Engine V1.5 — Treatment step progress ─────────────────
        // Tracks which SequencePlan step the clinician is currently executing.
        // Stored per-snapshot so progress is version-linked to the snapshot.
        // currentStep: 0-based index into SequencePlan.steps[]
        sequenceProgress: {
            currentStep:  { type: Number, default: 0, min: 0 },
            lastUpdated:  { type: Date, default: null },
        },
    },
    { timestamps: true }
);

workflowSnapshotSchema.index({ caseId: 1, version: -1 });
workflowSnapshotSchema.index({ organizationId: 1 });
workflowSnapshotSchema.index({ caseId: 1, version: 1 }, { unique: true });
workflowSnapshotSchema.index({ caseId: 1, createdAt: -1 });

const modelName = "WorkflowSnapshot";

module.exports = {
    modelName,
    schema: workflowSnapshotSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, workflowSnapshotSchema),
};
