const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },

        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },

        patientId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Patient",
            required: true,
        },

        dentistId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        chairId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Chair",
            required: true,
        },

        startTime: {
            type: Date,
            required: true,
        },

        endTime: {
            type: Date,
            required: true,
        },

        duration: {
            type: Number, // minutes
            required: true,
        },

        status: {
            type: String,
            enum: [
                "open",
                "confirmed",
                "checked-in",
                "in-progress",
                "completed",
                "delayed",
                "postponed",
                "cancelled",
                "no-show",
                "waiting-list",
            ],
            default: "open",
        },

        // ─── Appointment Classification ──────────────────────
        // v13.3: Added to match frontend contract (consultation | cleaning | etc.)
        type: {
            type: String,
            enum: ["consultation", "cleaning", "orthodontics", "emergency", "other"],
            default: "consultation",
        },

        // ─── Audit trail ─────────────────────────────────
        statusHistory: [
            {
                status: String,
                changedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                changedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        // ─── Timestamps per status ───────────────────────
        checkedInAt: Date,
        startedAt: Date,
        completedAt: Date,
        cancelledAt: Date,

        // ─── Waiting time (computed) ─────────────────────
        waitingDuration: {
            type: Number, // minutes
            default: null,
        },

        notes: {
            type: String,
            default: "",
        },

        // ─── Treatment Catalog Snapshot (treatment-catalog domain) ───────────
        // INVARIANT: Populated at booking time from TreatmentProcedure.
        // This is an IMMUTABLE snapshot — stored so that catalog changes
        // (price updates, renames, deactivations) NEVER affect historical records.
        // The appointment display MUST read from this snapshot, NOT live catalog.
        // See: buildProcedureSnapshot() in treatment-catalog/application/dto/procedure.dto.js
        treatment: {
            procedureId: { type: mongoose.Schema.Types.ObjectId },
            categoryId: { type: mongoose.Schema.Types.ObjectId },
            categoryName: { type: String, default: null },
            name: { type: String },
            duration: { type: Number },   // minutes — may differ from appointment.duration if overridden
            color: { type: String },
        },

        // ─── Chair Analytics (v32.4) ─────────────────────────────────────
        // Authoritative revenue figure for this appointment.
        // Populated on completion by the billing service.
        // Used by the chair analytics aggregation pipeline.
        revenueAmount: {
            type: Number,
            default: 0,
            min: 0,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        externalRequestId: {
            type: String,
        },
        version: {
            type: Number,
            default: 0
        },

        // ─── Clinical Case Engine Linkage (Phase 2) ──────────────────────
        // clinicalCaseId: links this appointment to an OrthodonticCase.
        // OPTIONAL — only populated for orthodontic appointments.
        // Set server-side by appointment.controller.js via case.service.findOrCreateOrthoCase().
        // NEVER set by the client directly.
        clinicalCaseId: {
            type:    mongoose.Schema.Types.ObjectId,
            ref:     "OrthodonticCase",
            default: null,
        },

        // phaseId: links to a CasePhase entity (Phase 3 — not yet implemented).
        // Reserved here to avoid a migration later.
        phaseId: {
            type:    mongoose.Schema.Types.ObjectId,
            default: null,
        },

        // visitSequenceNumber: 1-indexed visit count within the case.
        // Derived from countDocuments(ClinicalSnapshot, { caseId }) + 1 at creation time.
        visitSequenceNumber: {
            type:    Number,
            default: null,
            min:     1,
        },
    },
    { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────

// Calendar queries: list by branch + time range
appointmentSchema.index({ organizationId: 1, branchId: 1, startTime: 1 });

// Dentist overlap: across ALL branches
appointmentSchema.index({ organizationId: 1, dentistId: 1, startTime: 1, endTime: 1 });

// Chair overlap: within branch
appointmentSchema.index({ organizationId: 1, branchId: 1, chairId: 1, startTime: 1, endTime: 1 });

// Dashboard filtering by status
appointmentSchema.index({ organizationId: 1, status: 1, startTime: 1 });

// Patient-centric lookups (appointment history, upcoming appointments)
appointmentSchema.index({ organizationId: 1, patientId: 1, startTime: -1 });

// Multi-tenant uniqueness for external requests.
// IMPORTANT: Do NOT use sparse:true — MongoDB 3.2+ sparse indexes include null values,
// causing E11000 when multiple staff-created appointments (no externalRequestId) are inserted.
// partialFilterExpression restricts the unique index to actual string values only.
appointmentSchema.index(
    { organizationId: 1, externalRequestId: 1 },
    { unique: true, partialFilterExpression: { externalRequestId: { $type: "string" } } }
);

// Clinical case linkage: "all appointments for a case" (timeline query)
// partialFilterExpression avoids index entries for non-orthodontic appointments
appointmentSchema.index(
    { clinicalCaseId: 1, startTime: 1 },
    { partialFilterExpression: { clinicalCaseId: { $type: "objectId" } } }
);

const modelName = "Appointment";

module.exports = {
    modelName,
    schema: appointmentSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, appointmentSchema),
};
