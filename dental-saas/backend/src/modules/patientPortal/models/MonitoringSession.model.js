/**
 * MonitoringSession.model.js
 * Phase 5 — Patient Portal: Remote Monitoring Session
 *
 * When a patient submits photos for a stage, a MonitoringSession is created.
 * The doctor then reviews it, optionally with AI assistance.
 * Tenant isolation is at the DB level (per-org database).
 */

"use strict";

const mongoose = require("mongoose");
const monitoringSessionSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrthodonticCase",
    required: true
  },
  alignerProgressId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AlignerProgress",
    required: true
  },
  stageNumber: {
    type: Number,
    required: true,
    min: 1
  },
  // Session status FSM
  status: {
    type: String,
    enum: ["submitted", "under_review", "approved", "revision_required"],
    default: "submitted"
  },
  // Photo IDs submitted
  photoIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "PatientPhoto"
  }],
  // Patient's note with submission
  patientNote: {
    type: String,
    trim: true,
    default: ""
  },
  // Doctor review
  doctorNotes: {
    type: String,
    trim: true,
    default: ""
  },
  doctorFeedback: {
    type: String,
    trim: true,
    default: ""
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  reviewedAt: {
    type: Date
  },
  // AI analysis summary for this session
  aiSummary: {
    overallStatus: {
      type: String,
      enum: ["on_track", "needs_attention", "review_required", "unknown"],
      default: "unknown"
    },
    photoCount: {
      type: Number,
      default: 0
    },
    flagCount: {
      type: Number,
      default: 0
    },
    processedAt: {
      type: Date
    }
  },
  // Revision details (if revision_required)
  revisionDetails: {
    requiredPhotos: [{
      type: String
    }],
    message: {
      type: String,
      trim: true
    }
  },
  // Notification tracking
  notificationSent: {
    doctorNotified: {
      type: Boolean,
      default: false
    },
    patientNotified: {
      type: Boolean,
      default: false
    }
  },
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
monitoringSessionSchema.index({
  patientId: 1,
  caseId: 1
});
monitoringSessionSchema.index({
  status: 1,
  createdAt: -1
});
monitoringSessionSchema.index({
  alignerProgressId: 1
});
monitoringSessionSchema.index({
  reviewedBy: 1
});
const modelName = "MonitoringSession";
module.exports = {
  modelName,
  schema: monitoringSessionSchema
};