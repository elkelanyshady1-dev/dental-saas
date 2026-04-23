/**
 * ReviewStage.js — Stage-Based Academic Review Model
 *
 * Tracks review lifecycle: Diagnosis → Plan → Progress → Finishing
 * Each stage is a review request from doctor → supervisor evaluation.
 *
 * PLANE: Supervisor (cross-org via CaseAccess validation).
 */

"use strict";

const mongoose = require("mongoose");
const reviewStageSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrthodonticCase",
    required: true,
    index: true
  },
  stageType: {
    type: String,
    required: true,
    enum: ["DIAGNOSIS", "TREATMENT_PLAN", "PROGRESS", "FINISHING"]
  },
  stageNumber: {
    type: Number,
    default: 1,
    min: 1
  },
  status: {
    type: String,
    enum: ["PENDING", "IN_REVIEW", "APPROVED", "REJECTED", "REVISION_REQUESTED"],
    default: "PENDING"
  },
  // Org-plane doctor who requested the review
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  // Supervisor who performed the review
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SupervisorUser",
    default: null
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  // Clinical notes from supervisor
  decisionNote: {
    type: String,
    trim: true,
    maxlength: 5000,
    default: null
  },
  // Supervisor instructions for revision
  instructions: [{
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM"
    },
    completedAt: {
      type: Date,
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Optional: link to a specific snapshot for immutable review context
  snapshotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "WorkflowSnapshot",
    default: null
  },
  // Grade/evaluation (optional academic feature)
  grade: {
    type: String,
    trim: true,
    maxlength: 20,
    default: null // e.g., "A", "B+", "Pass"
  }
}, {
  timestamps: true,
  collection: "reviewStages"
});

// ─── Indexes ────────────────────────────────────────────────────────────────
reviewStageSchema.index({
  caseId: 1,
  stageType: 1
});
reviewStageSchema.index({
  caseId: 1,
  status: 1
});
reviewStageSchema.index({
  reviewedBy: 1,
  status: 1
});
reviewStageSchema.index({
  requestedBy: 1,
  status: 1
});
reviewStageSchema.index({
  status: 1
});
const modelName = "ReviewStage";
module.exports = {
  modelName,
  schema: reviewStageSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, reviewStageSchema)
};