/**
 * Treatment.model.js
 * Phase 3 — Clinical Operations: Treatment Record
 *
 * Represents a single treatment performed on a patient.
 * Links to Procedure catalog and optionally to an Appointment.
 * Tenant-isolated by organizationId.
 * Status FSM: planned → in_progress → completed | cancelled
 */

"use strict";

const mongoose = require("mongoose");
const treatmentSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  appointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment"
  },
  procedureId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Procedure",
    required: true
  },
  toothNumber: {
    type: String,
    trim: true
  },
  surfaces: [{
    type: String,
    enum: ["mesial", "distal", "buccal", "lingual", "occlusal", "incisal"]
  }],
  status: {
    type: String,
    enum: ["planned", "in_progress", "completed", "cancelled"],
    default: "planned"
  },
  notes: {
    type: String,
    trim: true,
    default: ""
  },
  // Price: defaults from Procedure, can be overridden per treatment
  priceOverride: {
    type: Number,
    min: 0
  },
  priceOverrideMinor: {
    type: Number,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: "AED"
  },
  // Performer tracking
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  performedAt: {
    type: Date
  },
  // Treatment plan reference
  treatmentPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TreatmentPlan"
  },
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    changedAt: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Per-org DB: indexes optimized — no organizationId prefix needed.
treatmentSchema.index({
  patientId: 1,
  createdAt: -1
});
treatmentSchema.index({
  branchId: 1,
  status: 1
});
treatmentSchema.index({
  appointmentId: 1
});
treatmentSchema.index({
  procedureId: 1
});
treatmentSchema.index({
  treatmentPlanId: 1
});
const modelName = "Treatment";
module.exports = {
  modelName,
  schema: treatmentSchema
};