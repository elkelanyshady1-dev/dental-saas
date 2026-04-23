/**
 * Photo.model.js — Photo SSOT (Phase 1)
 * ═══════════════════════════════════════════════════════════════
 * Single Source of Truth for every orthodontic photo.
 *
 * Replaces embedded imagePool + url-scattered record arrays with a
 * first-class entity keyed by (caseId, checksum) and (caseId, storageKey).
 *
 * 🚨 SYSTEM INVARIANT (DO NOT BREAK)
 *
 *   - storageKey is the ONLY persisted reference (immutable once written)
 *   - checksum deduplicates per case
 *   - URL is NEVER persisted — signed URLs are resolved at read time
 *   - Photos belong to a case and may be linked to any number of
 *     RecordSets and Visits (many-to-many)
 *   - Deletion requires zero links — hard invariant in photo.service.js
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const mongoose = require("mongoose");

const provenanceEntrySchema = new mongoose.Schema({
    sourceRecordSetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    linkedAt:          { type: Date, default: Date.now },
    linkedBy:          { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { _id: false });

// Structured origin pointer for derived assets (e.g. PNG exported from
// DICOM → { type: "dicom", originalPhotoId: <srcPhotoId> }). Replaces
// the old free-text tag convention so queries can join on origin.
const assetSourceSchema = new mongoose.Schema({
    type:            { type: String, enum: ["dicom", "stl", "pdf", "upload"], required: true },
    originalPhotoId: { type: mongoose.Schema.Types.ObjectId, ref: "Photo", default: null },
}, { _id: false });

// U-CAP extensions — §2 data-model extension. Every field here is OPTIONAL
// by design: existing writes and legacy docs stay valid. Populated by the
// async thumbnail/parsing workers (see assetJob.service.js).
const dicomMetadataSchema = new mongoose.Schema({
    modality:     { type: String, default: null },   // DICOM (0008,0060) e.g. "DX" / "CR" / "PR"
    width:        { type: Number, default: null },   // (0028,0011) columns
    height:       { type: Number, default: null },   // (0028,0010) rows
    windowCenter: { type: Number, default: null },   // (0028,1050)
    windowWidth:  { type: Number, default: null },   // (0028,1051)
}, { _id: false });

const photoSchema = new mongoose.Schema(
    {
        caseId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "OrthodonticCase",
            required: true,
            index:    true,
        },

        // ── Storage contract ──────────────────────────────────────────────
        // storageKey is the only long-lived reference to the R2 object.
        // It is IMMUTABLE — once written, never changes.
        storageKey: { type: String, required: true, immutable: true },
        // SHA-256 hex digest of the original buffer.
        // Used to dedupe uploads of the same file within a case.
        checksum:   { type: String, required: true },

        // ── Phase 2: Unified Case Assets ──────────────────────────────────
        // `fileType` classifies the blob at the RENDERING layer (image vs
        //  pdf vs 3d vs dicom) so the UI can pick the correct viewer. It's
        //  inferred server-side from the uploaded MIME and kept at top
        //  level so queries like "all PDFs for this case" stay O(1) via
        //  index, independent of `metadata.type`.
        // 🚨 PRODUCTION LOCK — fileType + mimeType are REQUIRED. The
        //    frontend refuses to render an asset without a fileType, so
        //    write-paths must stamp them explicitly. Legacy docs must be
        //    backfilled by migratePhotosToSSOT before this lock lands.
        fileType: {
            type:     String,
            enum:     ["image", "pdf", "3d", "dicom"],
            required: true,
        },
        mimeType: { type: String, required: true },

        // ── Metadata ──────────────────────────────────────────────────────
        metadata: {
            type: {
                type:     String,
                enum:     ["intraoral", "extraoral", "xray", "scan", "document", "stl", "dicom"],
                required: true,
            },
            orientation:  { type: String, default: null },
            tags:         { type: [String], default: [] },
            originalName: { type: String, default: null },
            mimeType:     { type: String, default: null },
            sizeBytes:    { type: Number, default: null, min: 0 },
            // Structured origin pointer for derived assets — see
            // assetSourceSchema above. `default: undefined` keeps the key
            // absent on plain uploads so clients can feature-detect.
            source: { type: assetSourceSchema, default: undefined },
        },

        // ── Ownership ─────────────────────────────────────────────────────
        uploadedAt: { type: Date, default: Date.now },
        uploadedBy: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "User",
            default: null,
        },

        // ── Many-to-many links ────────────────────────────────────────────
        linkedRecordSetIds: {
            type:    [mongoose.Schema.Types.ObjectId],
            ref:     "CaseRecordSet",
            default: [],
        },
        linkedVisitIds: {
            type:    [mongoose.Schema.Types.ObjectId],
            ref:     "VisitRecord",
            default: [],
        },

        // ── Provenance — audit trail for link events ──────────────────────
        provenance: { type: [provenanceEntrySchema], default: [] },

        // ── U-CAP §2 — async processing outputs ───────────────────────────
        // thumbnailStorageKey follows the same SSOT rule as storageKey:
        // ONLY the key is persisted; the DTO resolves it to a signed URL at
        // read time via r2SignedUrl. Never return the raw key on the wire.
        thumbnailStorageKey: { type: String, default: null },
        processingStatus: {
            type:     String,
            enum:     ["pending", "processing", "done", "failed", "skipped"],
            default:  null,
        },
        processingError: { type: String, default: null },
        // 0 – 100. Populated while processingStatus="processing" so the UI can
        // render a meaningful progress bar. Resets to 0 on retry and jumps to
        // 100 on "done". Clamped server-side; the DTO just passes through.
        processingProgress: { type: Number, default: 0, min: 0, max: 100 },
        // U-CAP enterprise hardening §1.2 — retry tracking for the self-worker.
        // retryCount increments on each FAILED attempt; recoverStuckJobs skips
        // rows once retryCount >= MAX_ATTEMPTS. Nullable so legacy rows stay
        // valid without a migration; treated as 0 on read.
        retryCount:      { type: Number, default: 0, min: 0 },
        dicomMetadata:   { type: dicomMetadataSchema, default: undefined },

        // ── Soft delete ───────────────────────────────────────────────────
        deletedAt: { type: Date, default: null, index: true },
    },
    { timestamps: true }
);

// ── Uniqueness ───────────────────────────────────────────────────────────────
// 1) Dedup by checksum within a case (ignoring soft-deleted rows).
photoSchema.index(
    { caseId: 1, checksum: 1 },
    {
        unique: true,
        partialFilterExpression: { deletedAt: null },
        name:   "uniq_case_checksum_active",
    }
);
// 2) storageKey is globally-unique per case.
photoSchema.index(
    { caseId: 1, storageKey: 1 },
    { unique: true, name: "uniq_case_storageKey" }
);
// 3) Reverse-lookup by linked recordset (array index for $in queries).
photoSchema.index({ linkedRecordSetIds: 1 });
// 4) Reverse-lookup by linked visit.
photoSchema.index({ linkedVisitIds: 1 });
// 5) Case-scoped chronological listing.
photoSchema.index({ caseId: 1, uploadedAt: -1 });

// ── Pre-validate guard ───────────────────────────────────────────────────────
// Defensive: storageKey presence is already required by the schema. Add a
// lightweight assertion so any future refactor that reshapes the create path
// catches the regression here rather than at a broken R2 fetch.
photoSchema.pre("validate", function (next) {
    if (!this.storageKey) {
        return next(new Error("Photo.storageKey is required"));
    }
    if (!this.checksum) {
        return next(new Error("Photo.checksum is required"));
    }
    if (!this.fileType) {
        return next(new Error("Photo.fileType is required"));
    }
    if (!this.mimeType) {
        return next(new Error("Photo.mimeType is required"));
    }
    return next();
});

// ── Hardening: explicit FILE_TYPE_REQUIRED guard (defense in depth) ──────────
// pre-validate catches the missing-field case at insert time, but a future
// direct-write path (updateOne / bulkWrite / native driver) could bypass it.
// This pre-save hook gives an explicit error code that upstream callers can
// match on (`err.code === "FILE_TYPE_REQUIRED"`) and refuses to persist a
// doc without the rendering classifier.
photoSchema.pre("save", async function preSaveFileTypeGuard() {
    if (!this.fileType) {
        const err = new Error("FILE_TYPE_REQUIRED");
        err.code = "FILE_TYPE_REQUIRED";
        err.statusCode = 400;
        throw err;
    }
});

const modelName = "Photo";

module.exports = {
    modelName,
    schema: photoSchema,
};
