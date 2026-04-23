/**
 * VisitRecord.model.js
 * Domain: orthodontic-cases
 * Layer: Infrastructure > Model
 *
 * VisitRecord is a METADATA WRAPPER over a ClinicalSnapshot.
 * It binds: OrthodonticCase + CasePhase + Appointment + ClinicalSnapshot
 * into one queryable document per visit.
 *
 * SNAPSHOT = SOURCE OF TRUTH.
 * VisitRecord stores NO clinical data itself — only references and
 * visit-level metadata (notes, attachments, visitNumber).
 *
 * IMMUTABILITY RULES:
 *   ✅ snapshotId starts as null; filled when endVisit() links the real snapshot
 *   ❌ caseId   NEVER changes after creation
 *   ✅ notes and attachments may be amended (non-clinical metadata)
 *
 * PHASE 2 ADDITIONS:
 *   + status:    'active' | 'completed' | 'cancelled'  (session lifecycle)
 *   + startedAt: Date — when the visit session was opened
 *   + endedAt:   Date — when the visit session was closed (null while active)
 *
 * MULTI-TENANCY: organizationId required on every document.
 */

"use strict";

const mongoose = require("mongoose");

// ── Attachment sub-schema ─────────────────────────────────────────────────────
// URL-only references — binary blobs are NEVER stored in MongoDB.

const visitAttachmentSchema = new mongoose.Schema(
    {
        url:  { type: String, required: true },
        type: { type: String, enum: ["image", "xray", "stl", "document"], required: true },
        name: { type: String, default: null },
        size: { type: Number, min: 0, default: null }, // bytes
    },
    { _id: false }
);

// ── Main Schema ───────────────────────────────────────────────────────────────

const visitRecordSchema = new mongoose.Schema(
    {
        // ── Multi-Tenancy ─────────────────────────────────────────────────

        // ── Aggregate Root Link ───────────────────────────────────────────
        caseId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "OrthodonticCase",
            required: true,
        },

        // ── Phase + Appointment Links ──────────────────────────────────────
        phaseId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "CasePhase",
            default: null,
        },
        appointmentId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "Appointment",
            default: null,
        },

        // ── SOURCE OF TRUTH reference ──────────────────────────────────────
        // Phase 2: snapshotId is NOW OPTIONAL at session start.
        // It is null while status="active" (visit in progress).
        // endVisit() fills it with the real ClinicalSnapshot._id.
        // All clinical data (chartState, procedures, tooth states) lives
        // in the referenced ClinicalSnapshot document.
        snapshotId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "ClinicalSnapshot",
            default: null,   // null until endVisit() links the real snapshot
        },

        // ── Phase 2: Session Lifecycle ────────────────────────────────────
        // status transitions:
        //   active → completed  (snapshot saved, endVisit called)
        //   active → cancelled  (visit abandoned, no snapshot)
        // INVARIANT: Only ONE active visit per case at any time.
        //   Enforced by partial unique index below + service guard.
        status: {
            type:    String,
            enum:    ["active", "completed", "cancelled"],
            default: "active",
            index:   true,
        },

        // ── Temporal session boundaries ────────────────────────────────────
        startedAt: {
            type:    Date,
            default: () => new Date(),
        },
        endedAt: {
            type:    Date,
            default: null,   // null while active
        },

        // ── Visit Sequencing ──────────────────────────────────────────────
        // 1-indexed count of visits within the case.
        // Derived at creation time: $inc on OrthodonticCase.visitCounter (atomic).
        visitNumber: {
            type:    Number,
            required: true,
            min:     1,
        },

        // ── Visit Type ────────────────────────────────────────────────────
        // Clinical classification of this visit.
        // Drives the visit-type badge in the SnapshotEditor header.
        visitType: {
            type:    String,
            enum:    ["adjustment", "diagnostic", "bonding", "debonding", "retention", "emergency", "records", "consultation"],
            default: "adjustment",
        },

        // ── Doctor Identity ───────────────────────────────────────────────
        // The clinician who opened this visit session.
        // Stamped from req.context.userId at session creation.
        // doctorName is denormalized for fast header display without a join.
        doctorId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "User",
            default: null,
        },
        doctorName: {
            type:    String,
            default: null,
        },

        // ── Phase 3.X: Visit Date ──────────────────────────────────────────
        // Denormalized mirror of snapshot.snapshotDate.
        // SOURCE OF TRUTH for when this visit occurred — NOT appointment.dateTime.
        // Populated at creation time from the resolved snapshotDate.
        // Enables efficient date-range timeline queries without joining ClinicalSnapshot.
        visitDate: {
            type:    Date,
            default: null,
        },

        // ── Visit-level Notes (non-clinical) ─────────────────────────────
        // Clinical notes live in ClinicalSnapshot.notes.
        // These are ad-hoc visit coordinator notes (appointment prep, follow-up).
        notes: {
            type:    String,
            default: "",
        },

        // ── Phase 3: Voice Notes ───────────────────────────────────────────
        // Audio recordings captured during the visit (e.g., clinician dictation).
        // URL-only references — binary blobs stored in S3/CDN, never in MongoDB.
        voiceNotes: {
            type: [{
                url:       { type: String, required: true },
                duration:  { type: Number, default: null }, // seconds
                createdAt: { type: Date, default: () => new Date() },
            }],
            default: [],
        },

        // ── DEPRECATED: Attachments (Phase 3.2 — FIX 6) ───────────────────
        // Attachments are CLINICAL STATE and belong to ClinicalSnapshot.
        // This field is kept for schema backward-compatibility with existing docs
        // but is NO LONGER WRITTEN by snapshot.service.js as of Phase 3.2.
        //
        // Medico-legal rationale:
        //   A photo taken during a visit is part of the CLINICAL RECORD of that
        //   visit's state (the snapshot), not an administrative visit wrapper.
        //   Moving ownership here ensures the attachment is versioned alongside
        //   the chartState that was captured at the same moment in time.
        //
        // DO NOT read from this field for clinical purposes.
        // Read from: ClinicalSnapshot.attachments
        //
        // @deprecated Phase 3.2
        attachments: {
            type:    [visitAttachmentSchema],
            default: [],
        },

        // ── Clinical Phase (visit-level, NOT case phase) ───────────────────
        // These are intra-treatment clinical states for the Treatment CasePhase.
        // Non-linear — a case may revisit LEVEL_ALIGNMENT after SPACE_MANAGEMENT.
        // Optional — only meaningful when CasePhase.name === "treatment".
        clinicalPhase: {
            type:    String,
            enum:    ["LEVEL_ALIGNMENT", "SPACE_MANAGEMENT", "FINISHING"],
            default: null,
        },

        // ── Clinical Tags (visit-level annotations) ────────────────────────
        // Free-form tags for wire materials, techniques, etc.
        // Examples: ["niti", "ss", "coil_spring", "class_ii_elastic"]
        clinicalTags: {
            type:    [String],
            default: [],
        },

        // ── Soft-delete (for data integrity — never hard-delete visit records) ──
        isActive: {
            type:    Boolean,
            default: true,
        },

        // ── Phase 4: Soft Visit Lock ───────────────────────────────────────────
        // Tracks which user is actively editing the case. Provides visibility
        // into concurrent edits without hard blocking all other users.
        //
        // LOCK RELEASE:
        //   - endVisit() / cancelVisit() → clears both fields
        //   - Heartbeat timeout (2 min) → lock treated as expired in assertVisitLock()
        //
        // lockedBy: the userId currently holding the edit lock
        // lockedAt: when the lock was acquired (for age calculation)
        // lastHeartbeatAt: updated every 30s by the browser; expires lock on timeout
        lockedBy: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "User",
            default: null,
            index:   true,
        },
        lockedAt: {
            type:    Date,
            default: null,
        },
        lastHeartbeatAt: {
            type:    Date,
            default: null,
        },

    },
    { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────

// Primary timeline query: "all visits for a case, oldest first"
visitRecordSchema.index({ caseId: 1, visitNumber: 1 });

// FIX 7 — Dual-sort compound index for deterministic timeline ordering.
// Secondary sort by createdAt ensures stable ordering even when visitNumber
// gaps occur (e.g., after a transaction rollback — theoretically possible).
visitRecordSchema.index({ caseId: 1, visitNumber: 1, createdAt: 1 });

// Phase-scoped timeline
visitRecordSchema.index({ caseId: 1, phaseId: 1, visitNumber: 1 });

// Appointment lookup: "does this appointment have a visit record?"
visitRecordSchema.index(
    { appointmentId: 1 },
    { unique: true, partialFilterExpression: { appointmentId: { $type: "objectId" } } }
);

// Snapshot lookup (1:1 snapshot → visitRecord)
// sparse: true → only index non-null values. Null snapshotId (during active sessions)
// may exist on multiple docs without violating uniqueness.
visitRecordSchema.index(
    { snapshotId: 1 },
    { unique: true, sparse: true }
);

// Phase 2: Singleton active-visit guard — partial unique index.
// Only ONE document per (org, case) may have status="active".
// This is the DB-level backup to the service-layer assertActiveVisit() check.
visitRecordSchema.index(
    { caseId: 1, status: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "active" },
        name: "unique_active_visit_per_case",
    }
);

// Tenant-scoped listing
visitRecordSchema.index({ caseId: 1, createdAt: -1 });

// Phase 3.X: visitDate index — date-range timeline queries without joining ClinicalSnapshot
visitRecordSchema.index({ caseId: 1, visitDate: 1 });

// Phase 1 — CRITICAL: Enforce one active visit per case at DB level.
// Partial unique index: only rows with status='active' participate in the unique constraint.
// Allows many completed/cancelled records per case, but never two active ones.
visitRecordSchema.index(
    { caseId: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "active" } }
);

const modelName = "VisitRecord";

module.exports = {
    modelName,
    schema: visitRecordSchema,
};
