/**
 * CaseRecordSet.model.js — Normalized RecordSet Collection (P1-10)
 *
 * Previously: RecordSets were embedded inside OrthodonticCase.workflowData.recordSets[]
 * Now: Standalone collection with versioning, snapshot linkage, and org isolation.
 *
 * RULES:
 *   - organizationId REQUIRED (tenant isolation)
 *   - caseId REQUIRED (aggregate linkage)
 *   - snapshotId OPTIONAL (linked to clinical snapshot for audit trail)
 *   - version monotonically increases per case
 *   - Soft-delete only (isDeleted flag)
 */

"use strict";

const mongoose = require("mongoose");

const caseRecordSetSchema = new mongoose.Schema(
    {
        organizationId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Organization",
            required: true,
            index:    true,
        },
        caseId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "OrthodonticCase",
            required: true,
            index:    true,
        },
        snapshotId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "ClinicalSnapshot",
            default: null,
        },
        type: {
            type:     String,
            required: true,
            enum:     ["diagnostic", "progress", "final"],
        },
        version: {
            type:     Number,
            required: true,
            min:      1,
            default:  1,
        },
        records: {
            type:     mongoose.Schema.Types.Mixed,
            required: true,
        },
        createdBy: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "User",
            default: null,
        },
        isDeleted: {
            type:    Boolean,
            default: false,
        },
        deletedAt: {
            type:    Date,
            default: null,
        },
        deletedBy: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "User",
            default: null,
        },
    },
    { timestamps: true, strict: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// Primary query: all record sets for a case, newest first
caseRecordSetSchema.index({ organizationId: 1, caseId: 1, createdAt: -1 });

// Type + version uniqueness per case (dedup constraint)
caseRecordSetSchema.index(
    { caseId: 1, type: 1, version: 1 },
    { unique: true }
);

// Snapshot linkage (sparse for nullable field)
caseRecordSetSchema.index(
    { snapshotId: 1 },
    { sparse: true }
);

// Soft-delete filter
caseRecordSetSchema.index(
    { isDeleted: 1 }
);

module.exports = {
    name: "CaseRecordSet",
    schema: caseRecordSetSchema,
};
