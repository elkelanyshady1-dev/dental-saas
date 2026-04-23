/**
 * Tad.model.js — TADs (Temporary Anchorage Devices / Miniscrews) Engine
 *
 * Architecture:
 *   - Event-sourced lifecycle: status derives from the events[] log
 *   - failureCount is a denormalized counter (never manual, always via failTad())
 *   - organizationId is required for multi-tenant DB-per-org isolation
 *   - scheduledReinsertAt enables reminder scheduling
 */

"use strict";

const mongoose = require("mongoose");

// ─── Sub-Schema: TAD Lifecycle Event ─────────────────────────────────────────
const TadEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["INSERTED", "FAILED", "REMOVED", "REINSERTED", "MARKED_FOR_REMOVAL"],
      required: true,
    },
    reason: {
      type: String,
      enum: ["loose", "migration", "pain", "infection", "patient_request", "clinical_decision", "planned_removal", "healing", "failed", "bulk_cleanup", "other"],
      default: null,
    },
    notes: { type: String, default: null },
    scheduledReinsertAt: { type: Date, default: null },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: true, timestamps: { createdAt: "createdAt", updatedAt: false } }
);

// ─── Main Schema: TAD Record ──────────────────────────────────────────────────
const TadSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrthodonticCase",
      required: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    snapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowSnapshot",
      default: null,
    },

    // ── Clinical Placement ──────────────────────────────────────────────────
    toothNumber: { type: Number, required: true },        // FDI anchor tooth
    position: {
      type: String,
      enum: [
        "interradicular",
        "infrazygomatic_crest",
        "buccal_shelf",
        "palatal",
        "symphysis",
        "retromolar",
        "apical",
        "other",
      ],
      required: true,
    },
    positionLabel: { type: String },                     // e.g. "Interradicular 14-15"

    // ── Hardware Specs ──────────────────────────────────────────────────────
    brand: { type: String, required: true },             // e.g. "Ormco", "3M"
    diameter: { type: String, required: true },          // e.g. "1.6mm"
    length: { type: String, required: true },            // e.g. "8mm"

    // ── Lifecycle Status (derived from events, but denormalized for queries) ──
    status: {
      type: String,
      enum: ["ACTIVE", "NEEDS_REMOVAL", "FAILED", "REMOVED"],
      default: "ACTIVE",
    },

    // ── Event Sourcing Log ──────────────────────────────────────────────────
    events: { type: [TadEventSchema], default: [] },

    // ── Failure Tracking (denormalized for analytics) ──────────────────────
    failureCount: { type: Number, default: 0, min: 0 },

    // ── Alert State ────────────────────────────────────────────────────────
    hasActiveAlert: { type: Boolean, default: false },   // set by markForRemoval
    scheduledReinsertAt: { type: Date, default: null },  // for reminders

    // ── Snapshot Reference (chart integration) ─────────────────────────────
    chartPosition: {                                     // position in chartState.tads[]
      toothId: { type: Number, default: null },
      anchorType: { type: String, default: null },
    },
  },
  { timestamps: true }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
TadSchema.index({ caseId: 1 });
TadSchema.index({ patientId: 1, status: 1 });
TadSchema.index(
  { scheduledReinsertAt: 1 },
  { partialFilterExpression: { scheduledReinsertAt: { $type: "date" } } }
);

// Prevent duplicate ACTIVE TADs on the same tooth+anchorType within a case
TadSchema.index(
  { caseId: 1, toothNumber: 1, "chartPosition.anchorType": 1 },
  {
    unique: true,
    partialFilterExpression: { status: "ACTIVE" },
    name: "unique_active_tad_per_tooth_anchor",
  }
);

const modelName = "Tad";

module.exports = {
  modelName,
  schema: TadSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, TadSchema),
};
