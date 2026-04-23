"use strict";

/**
 * TreatmentPlanVersion.model.js — Orthodontic Treatment Plan Versioning
 *
 * ROLE
 *   Single source of truth for orthodontic treatment plans. Replaces the legacy
 *   `OrthodonticCase.workflowData.finalPlan` + `WorkflowRecordSet.treatmentPlan`
 *   in-place mutation model with a versioned, state-machine-backed collection.
 *
 * STATE MACHINE
 *   DRAFT     — editable, PRE-authored, disposable
 *   APPROVED  — locked baseline, exactly one per case, isApproved=true, isActive=true
 *   REVISION  — MID-authored modification, chained via parentVersionId, isActive=true
 *
 * INVARIANTS (enforced by partial unique indexes + service transactions)
 *   - At most one version per case with isApproved=true
 *   - At most one version per case with isActive=true
 *   - Monotonic `version` per caseId (allocated via case.__planVersionCounter $inc)
 *   - Payload + assets are immutable once stage leaves DRAFT (pre-save hook)
 *
 * OPTIMISTIC LOCK
 *   `versionLock` increments on every save. Draft edits must supply
 *   `expectedVersionLock` — the service uses findOneAndUpdate with the
 *   predicate to detect concurrent writes and returns 409 on mismatch.
 *
 * @per-org-compliant — lives in the per-org DB; organizationId always from req.context
 */

const mongoose = require("mongoose");

// ─── Asset Linkage Sub-Schema (hardened spec §5) ─────────────────────────────
// Clinical assets the version was authored against. On revision, inherited
// from parent unless the caller overrides per-category.
const AssetLinkSchema = new mongoose.Schema(
    {
        photos:     [{ type: mongoose.Schema.Types.ObjectId, ref: "Photo",    default: [] }],
        documents:  [{ type: mongoose.Schema.Types.ObjectId, ref: "Document", default: [] }],
        stlFiles:   [{ type: mongoose.Schema.Types.ObjectId, ref: "StlFile",  default: [] }],
        dicomFiles: [{ type: mongoose.Schema.Types.ObjectId, ref: "DicomFile",default: [] }],
    },
    { _id: false }
);

// ─── Audit Entry Sub-Schema (hardened spec §3, §10) ──────────────────────────
// Append-only log of state transitions. One entry per mutation.
const AuditEntrySchema = new mongoose.Schema(
    {
        action: {
            type:     String,
            enum:     ["CREATED_DRAFT", "EDITED_DRAFT", "APPROVED", "REVISED", "DELETED"],
            required: true,
        },
        userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        timestamp: { type: Date,   default: Date.now },
        note:      { type: String, default: "", maxlength: 500 },
    },
    { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────
const TreatmentPlanVersionSchema = new mongoose.Schema(
    {
        caseId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "OrthodonticCase",
            required: true,
            index:    true,
        },
        recordSetId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "WorkflowRecordSet",
            required: true,
        },
        recordSetType: {
            type:     String,
            enum:     ["PRE", "MID"],
            required: true,
        },

        // Monotonic per caseId — allocated via OrthodonticCase.__planVersionCounter $inc.
        version: {
            type:     Number,
            required: true,
            min:      1,
        },
        parentVersionId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "TreatmentPlanVersion",
            default: null,
        },

        stage: {
            type:     String,
            enum:     ["DRAFT", "APPROVED", "REVISION"],
            required: true,
            default:  "DRAFT",
        },

        isActive:   { type: Boolean, required: true, default: false },
        isApproved: { type: Boolean, required: true, default: false },

        payload:       { type: mongoose.Schema.Types.Mixed, required: true },
        changeSummary: { type: String, default: "", maxlength: 2000 },

        createdFrom: {
            type:     String,
            enum:     ["PRE", "MID"],
            required: true,
        },

        // Hardened spec §5 — clinical assets pinned to this version
        assets: { type: AssetLinkSchema, default: () => ({ photos: [], documents: [], stlFiles: [], dicomFiles: [] }) },

        // Hardened spec §3 / §10 — append-only audit log
        audit: { type: [AuditEntrySchema], default: [] },

        // Hardened spec §10 — optimistic lock, incremented on every save
        versionLock: { type: Number, default: 0 },

        createdBy: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "User",
            required: true,
        },
    },
    { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Monotonic version per case — unique guarantee
TreatmentPlanVersionSchema.index({ caseId: 1, version: 1 }, { unique: true });

// Single-approved-per-case invariant (partial unique on isApproved=true)
TreatmentPlanVersionSchema.index(
    { caseId: 1, isApproved: 1 },
    { unique: true, partialFilterExpression: { isApproved: true } }
);

// Single-active-per-case invariant (partial unique on isActive=true)
TreatmentPlanVersionSchema.index(
    { caseId: 1, isActive: 1 },
    { unique: true, partialFilterExpression: { isActive: true } }
);

// Record-set lookup (for UI filtering drafts under a specific PRE record set)
TreatmentPlanVersionSchema.index({ recordSetId: 1 });

// Stage filter (for listing DRAFTs in PRE UI)
TreatmentPlanVersionSchema.index({ caseId: 1, stage: 1 });

// ─── Pre-save Hook — Immutability + Lock Increment ────────────────────────────
// Mongoose v9 pre-hooks expect async functions that throw (or resolve) rather
// than the legacy `next(err)` callback style. An async hook that throws is
// caught by the middleware pipeline and turned into a save-time error.

TreatmentPlanVersionSchema.pre("save", async function preSave() {
    // REVISION stage requires a changeSummary
    if (this.stage === "REVISION" && (!this.changeSummary || this.changeSummary.trim() === "")) {
        throw new Error("TreatmentPlanVersion: changeSummary is required for stage=REVISION");
    }

    // Immutability: once stage leaves DRAFT, payload + assets are frozen.
    if (!this.isNew && this.stage !== "DRAFT") {
        if (this.isModified("payload")) {
            throw new Error(`TreatmentPlanVersion: payload is immutable when stage=${this.stage}`);
        }
        if (this.isModified("assets")) {
            throw new Error(`TreatmentPlanVersion: assets are immutable when stage=${this.stage}`);
        }
    }

    // Boolean flag consistency
    if (this.isApproved && this.stage !== "APPROVED") {
        throw new Error("TreatmentPlanVersion: isApproved=true requires stage=APPROVED");
    }

    // Increment optimistic lock on every save after the initial insert
    if (!this.isNew) {
        this.versionLock = (this.versionLock || 0) + 1;
    }
});

// ─── Export ───────────────────────────────────────────────────────────────────

const modelName = "TreatmentPlanVersion";

module.exports = {
    modelName,
    schema:  TreatmentPlanVersionSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, TreatmentPlanVersionSchema),
};
