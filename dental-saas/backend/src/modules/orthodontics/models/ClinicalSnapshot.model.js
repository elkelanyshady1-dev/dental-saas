/**
 * ClinicalSnapshot.model.js
 * Domain: clinical-snapshots
 * Layer: Infrastructure > Model
 *
 * Phase 3.X — Snapshot System V2
 *
 * CHANGES FROM Phase 3.2:
 *   + type:           enum — "pretreatment" | "treatment" | "post-treatment" (REQUIRED)
 *   + snapshotDate:   Date — SOURCE OF TRUTH for visit time (required)
 *   + diagnosticData: Mixed — pretreatment diagnostic payload; null for treatment/post
 *   ~ appointmentId:  NOW OPTIONAL (was required)
 *
 * TYPE RULES (enforced at service layer):
 *   pretreatment  → diagnostic; versioned; NOT in timeline; logical edit via new version
 *   treatment     → visit-based; creates VisitRecord; increments visitCounter
 *   post-treatment → retention; same rules as treatment
 *
 * IMMUTABLE: No update route is exposed. Snapshots are write-once (Mongoose strict + no update API).
 *
 * HARD RULES:
 *   NO actions[]   — UI-only session history, never persisted
 *   NO billing     — billing domain owns financials
 *   NO file blobs  — URL references only (S3 / CDN)
 * Tenant isolation is at the DB level (per-org database).
 */

"use strict";

const mongoose = require("mongoose");

// ── Procedure Sub-Schema ──────────────────────────────────────────────────────
// `type` is a required discriminator — consumers MUST validate against known types.
// `details` is Mixed to support orthodontic-specific payloads.

const procedureSchema = new mongoose.Schema(
    {
        id:        { type: String, required: true },
        type:      { type: String, required: true },
        target: {
            toothId:  { type: Number },
            teethIds: [{ type: Number }],
            arch:     { type: String, enum: ["upper", "lower"] },
        },
        details:   { type: mongoose.Schema.Types.Mixed },
        timestamp: { type: Number, required: true }, // Unix ms
    },
    { _id: false }
);

// ── Bonding Snapshot Sub-Schema ───────────────────────────────────────────────
// Point-in-time capture of bonding state at snapshot creation.
// NO event history — only current clinical state at visit time.
// Makes snapshot restore fully deterministic for appliance state.

const bondingSnapshotItemSchema = new mongoose.Schema(
    {
        tooth:           { type: Number, required: true },  // FDI tooth number
        bracketType:     { type: String, default: null },   // BRACKET | BAND | TUBE
        prescription:    { type: String, default: null },   // MBT | Roth | etc.
        slotSize:        { type: String, default: null },   // 0.022 | 0.018
        brand:           { type: String, default: null },
        bondingHeight:   { type: Number, default: null },   // mm from incisal edge
        status:          { type: String, enum: ["ACTIVE", "DEBONDED"], default: "ACTIVE" },
    },
    { _id: false }
);

// ── TAD Snapshot Sub-Schema ───────────────────────────────────────────────────
// Point-in-time capture of TAD state at snapshot creation.
// REMOVED TADs are excluded (they are clinically absent at visit time).
// NO event log — status only.

const tadSnapshotItemSchema = new mongoose.Schema(
    {
        toothNumber:   { type: Number, required: true },   // FDI anchor tooth
        position:      { type: String, required: true },   // clinical position enum
        positionLabel: { type: String, default: null },    // human-readable label
        brand:         { type: String, default: null },
        diameter:      { type: String, default: null },    // e.g. "1.6mm"
        length:        { type: String, default: null },    // e.g. "8mm"
        status:        { type: String, enum: ["ACTIVE", "NEEDS_REMOVAL", "FAILED"], default: "ACTIVE" },
        chartPosition: {
            toothId:    { type: Number, default: null },
            anchorType: { type: String, default: null },
        },
    },
    { _id: false }
);

// ── Attachment Sub-Schema ─────────────────────────────────────────────────────
// Metadata only — binary files are NEVER stored inside MongoDB.

const attachmentSchema = new mongoose.Schema(
    {
        id:           { type: String, required: true },
        type:         { type: String, enum: ["photo", "xray", "stl", "document"], required: true },
        url:          { type: String, required: true },
        thumbnailUrl: { type: String, default: null },
        fileName:     { type: String },
        size:         { type: Number, min: 0 },
        uploadedAt:   { type: Number },
        uploadedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        relatedTo: {
            toothId:     { type: Number },
            procedureId: { type: String },
        },
    },
    { _id: false }
);

// ── Main Schema ───────────────────────────────────────────────────────────────

const clinicalSnapshotSchema = new mongoose.Schema(
    {
        // ── Multi-Tenancy ─────────────────────────────────────────────────

        // ── Case Linkage ──────────────────────────────────────────────────
        caseId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "OrthodonticCase",
            required: true,
        },

        // ── Phase 3.X: Snapshot Type ──────────────────────────────────────
        // REQUIRED on all new snapshots.
        // Controls whether VisitRecord is created and visitCounter incremented.
        //
        // "diagnostic"     → SINGLETON per case; photo/ceph analysis baseline;
        //                    no VisitRecord; no visitCounter; sets hasDiagnosticSnapshot
        // "pretreatment"   → versioned chart baseline (multiple allowed)
        // "treatment"      → visit-based; creates VisitRecord; increments visitCounter
        // "post-treatment" → retention; same rules as treatment
        // "compaction"     → Phase 6 auto-compaction checkpoint; system-created;
        //                    no VisitRecord; no visitCounter; replaces long event chains
        type: {
            type:     String,
            enum:     ["diagnostic", "pretreatment", "treatment", "post-treatment", "compaction"],
            required: true,
        },

        // ── Phase 3.X: Canonical Visit Time ──────────────────────────────
        // SOURCE OF TRUTH for when the snapshot occurred.
        // Resolved at service layer from: appointment.dateTime → override → now().
        // VisitRecord.visitDate always mirrors this value.
        // NEVER derive time from appointmentId.dateTime at read time — use this field.
        snapshotDate: {
            type:     Date,
            required: true,
            default:  () => new Date(),
        },

        // ── Phase 3.X: Appointment Link (OPTIONAL) ────────────────────────
        // A snapshot can exist without any appointment.
        // When provided, appointment enriches context but snapshotDate is still the SoT.
        appointmentId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "Appointment",
            default: null,
        },

        // ── Phase 6C: Visit Session link ──────────────────────────────────
        // REQUIRED for treatment/post-treatment (enforced at service layer).
        // null for diagnostic/pretreatment (no visit session needed).
        // null for snapshots created before Phase 6C (backward compat).
        visitId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "VisitRecord",
            default: null,
            index:   true,
        },

        // ── Unified Diagnostic Pipeline — SINGLE SOURCE OF TRUTH ────────────
        // All 5 analysis modules are embedded here. No separate collections.
        //
        // WRITE: Records step → saves each sub-field via workflowData.recordSets
        //        Cast Analysis modal → writes castAnalysis sub-field
        // READ:  Analysis step → reads this field; NEVER re-calculates
        //        AnalysisStep.tsx maps sub-fields through DiagnosticItem classifiers
        //
        // diagnosticData: {
        //
        //   cephAnalysis: {
        //     SNA, SNB, ANB, MMP, U1_PP, L1_MP    (degrees)
        //     cvmStage?: "CVMS1"–"CVMS6"
        //     C2_lower_border?, C3_shape?, C4_shape? (CVM inputs)
        //   },
        //
        //   cvmAnalysis: {      (deprecated — now embedded in cephAnalysis)
        //     stage: String,
        //     growthStatus: String
        //   },
        //
        //   opgFindings: {
        //     additionalFindings: String,
        //     boneLevel?: String,
        //     tmj?: String
        //   },
        //
        //   photoAnalysis: {    (keyed by photo id / type)
        //     [photoId]: { [key]: value }
        //   },
        //
        //   castAnalysis: {                     ← EMBEDDED (replaces standalone collection)
        //     input:  { upper, lower, toothSize, ashley },
        //     result: { upper, lower, bolton, ashley, insights },
        //     savedAt: ISO string
        //   }
        // }
        //
        // MUST be null for treatment / post-treatment — service layer enforces this.
        diagnosticData: {
            type:    mongoose.Schema.Types.Mixed,
            default: null,
        },

        // ── Optional Phase Tracking ────────────────────────────────────────
        phaseId: {
            type:    mongoose.Schema.Types.ObjectId,
            default: null,
        },
        visitSequenceNumber: {
            type:    Number,
            min:     1,
            default: null,
        },

        // ── Audit ──────────────────────────────────────────────────────────
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        },

        // ── Core Chart State ───────────────────────────────────────────────
        // Full serialized dental chart at time of save. Mixed for flexibility.
        chartState: {
            type:     mongoose.Schema.Types.Mixed,
            required: true,
        },

        // ── Bonding Snapshot — Point-in-time appliance state ──────────────
        // Captured from Bonding collection at snapshot creation time.
        // SSOT for appliance state when restoring this snapshot historically.
        // Empty array for snapshots created before this field was added (backward compat).
        bondingSnapshot: {
            type:    [bondingSnapshotItemSchema],
            default: [],
        },

        // ── TAD Snapshot — Point-in-time TAD state ────────────────────────
        // Captured from Tad collection at snapshot creation time.
        // Excludes REMOVED TADs (they are clinically absent at visit time).
        // Empty array for snapshots created before this field was added (backward compat).
        tadSnapshot: {
            type:    [tadSnapshotItemSchema],
            default: [],
        },

        // ── Clinical Procedures ────────────────────────────────────────────
        procedures: {
            type:    [procedureSchema],
            default: [],
        },

        // ── Clinical Notes ─────────────────────────────────────────────────
        notes: {
            text:     { type: String, default: "" },
            tags:     { type: [String], default: [] },
            warnings: { type: [String], default: [] },
        },

        // ── Attachments ────────────────────────────────────────────────────
        attachments: {
            type:    [attachmentSchema],
            default: [],
        },

        // ── Thumbnail ─────────────────────────────────────────────────────
        thumbnail: {
            type:    String,
            default: null,
        },

        // ── Display Name ───────────────────────────────────────────────────
        // Human-readable label shown in SnapshotSelector dropdown.
        // Defaults to "Untitled Snapshot". Editable via PATCH (metadata only).
        name: {
            type:    String,
            default: "Untitled Snapshot",
            maxlength: 120,
        },

        // ── Visit Type ────────────────────────────────────────────────────
        // Orthodontic visit classification. Independent of snapshot `type`.
        // Editable via PATCH (metadata only). Does not affect chartState.
        visitType: {
            type:    String,
            enum:    ["bonding", "adjustment", "wire_change", "debonding"],
            default: "adjustment",
        },

        // ── Soft Delete ────────────────────────────────────────────────────
        // Hard deletes are FORBIDDEN. Admin-only soft delete sets this flag.
        // All queries MUST filter { isDeleted: false } to exclude soft-deleted docs.
        isDeleted: {
            type:    Boolean,
            default: false,
        },

        // ── Optimistic Concurrency Version ────────────────────────────────
        // Monotonically increasing per case. First snapshot = 1.
        version: {
            type:    Number,
            default: 1,
            min:     1,
        },

        // ── Phase 6: Event Offset Checkpoint ──────────────────────────────
        // The ClinicalEvent.sequence number of the LATEST event at snapshot creation time.
        // Replay engine uses: events WHERE sequence > eventOffset (O(k) instead of O(n)).
        // null for pre-Phase 6 snapshots — fallback to createdAt-based filtering.
        eventOffset: {
            type:    Number,
            default: null,
            index:   true,
        },

        // ── Phase 6D: Chart State Hash (idempotency) ───────────────────────
        // SHA-256 of the serialized chartState at save time.
        // Used to detect and skip duplicate snapshots within the same visit.
        // null for snapshots created before Phase 6D (backward compat).
        chartStateHash: {
            type:    String,
            default: null,
        },

        // ── Phase 3.X.1: Active Pretreatment Version Flag ─────────────────
        // Only ONE pretreatment snapshot is "active" at any time.
        // When a new pretreatment snapshot is saved, ALL previous versions for
        // the same case are set to false atomically (via updateManyByCase in repo).
        // For all other types this field is always false and should be ignored.
        // Indexed (partial) for fast active-version lookup.
        isActiveVersion: {
            type:    Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        strict:     true,
    }
);

// ── Pre-save validation ──────────────────────────────────────────────────────
// Enforce invariant: diagnosticData MUST be null for treatment/post-treatment types.
// This was previously service-layer only — now DB-level as defense-in-depth.
clinicalSnapshotSchema.pre("save", function (next) {
    const treatmentTypes = ["treatment", "post-treatment", "compaction"];
    if (treatmentTypes.includes(this.type) && this.diagnosticData != null) {
        return next(new Error(`diagnosticData must be null for snapshot type "${this.type}"`));
    }
    return next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────

// Primary: all snapshots for a case, newest first
clinicalSnapshotSchema.index({ caseId: 1, createdAt: -1 });

// Phase 3.X: type-scoped listing (timeline queries filter to treatment + post)
clinicalSnapshotSchema.index({ caseId: 1, type: 1, createdAt: -1 });

// Phase 3.X: pretreatment version list
clinicalSnapshotSchema.index({ caseId: 1, type: 1, version: 1 });

// Appointment lookup (partial — only real ObjectId links)
clinicalSnapshotSchema.index(
    { appointmentId: 1, createdAt: -1 },
    { partialFilterExpression: { appointmentId: { $type: "objectId" } } }
);

// Phase 3.X.1: Active pretreatment version lookup
// Partial: only index pretreatment documents where isActiveVersion = true
clinicalSnapshotSchema.index(
    { caseId: 1, isActiveVersion: 1 },
    { partialFilterExpression: { type: "pretreatment", isActiveVersion: true } }
);

// Soft-delete filter — partial index for fast isDeleted=false queries
clinicalSnapshotSchema.index(
    { caseId: 1, isDeleted: 1, createdAt: -1 },
    { partialFilterExpression: { isDeleted: true } }
);

// Tenant-scoped listing
clinicalSnapshotSchema.index({ createdAt: -1 });

// Phase + case queries
clinicalSnapshotSchema.index(
    { phaseId: 1, caseId: 1 },
    { partialFilterExpression: { phaseId: { $type: "objectId" } } }
);

const modelName = "ClinicalSnapshot";

module.exports = {
    modelName,
    schema: clinicalSnapshotSchema,
};
