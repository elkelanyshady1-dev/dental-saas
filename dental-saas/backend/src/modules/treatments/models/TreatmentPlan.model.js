/**
 * TreatmentPlan.model.js
 * Phase 3 — Clinical Operations: Treatment Plan
 *
 * Groups proposed treatments for a patient into a plan.
 * Contains estimated costs and priority ordering.
 * Status FSM: draft → approved → in_progress → completed | cancelled
 */

"use strict";

const mongoose = require("mongoose");
const planItemSchema = new mongoose.Schema({
  procedureId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Procedure",
    required: true
  },
  procedureName: {
    type: String,
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
  estimatedPrice: {
    type: Number,
    required: true,
    min: 0
  },
  estimatedPriceMinor: {
    type: Number,
    min: 0
  },
  priority: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ["pending", "in_progress", "completed", "cancelled", "declined"],
    default: "pending"
  },
  treatmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Treatment"
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  _id: true
});
const treatmentPlanSchema = new mongoose.Schema({
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
  title: {
    type: String,
    trim: true,
    default: "Treatment Plan"
  },
  status: {
    type: String,
    enum: ["draft", "proposed", "approved", "in_progress", "completed", "cancelled"],
    default: "draft"
  },
  planItems: [planItemSchema],
  // Computed totals (server-side only)
  estimatedTotal: {
    type: Number,
    default: 0
  },
  estimatedTotalMinor: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    required: true,
    default: "AED"
  },
  // Audit
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  approvedAt: {
    type: Date
  },
  notes: {
    type: String,
    trim: true
  },
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

// ─── Pre-save: Recalculate totals ────────────────────────────────────────────
treatmentPlanSchema.pre("save", function () {
  if (this.isModified("planItems")) {
    this.estimatedTotal = this.planItems.reduce((sum, item) => {
      return item.status !== "cancelled" && item.status !== "declined" ? sum + (item.estimatedPrice || 0) : sum;
    }, 0);
    this.estimatedTotalMinor = Math.round(this.estimatedTotal * 100);
  }
});

// Per-org DB: indexes optimized — no organizationId prefix needed.
treatmentPlanSchema.index({
  patientId: 1,
  createdAt: -1
});
treatmentPlanSchema.index({
  branchId: 1,
  status: 1
});
const modelName = "TreatmentPlan";
module.exports = {
  modelName,
  schema: treatmentPlanSchema
};