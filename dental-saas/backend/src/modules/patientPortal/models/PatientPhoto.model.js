/**
 * PatientPhoto.model.js
 * Phase 5 — Patient Portal: Photo Upload System
 *
 * Stores patient-submitted monitoring photos.
 * Storage path: org/{organizationId}/patients/{patientId}/photos/{fileKey}
 * Tenant-isolated by organizationId.
 */

"use strict";

const mongoose = require("mongoose");
const patientPhotoSchema = new mongoose.Schema({
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
  // Links to monitoring session
  monitoringSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "MonitoringSession"
  },
  stageNumber: {
    type: Number,
    required: true,
    min: 1
  },
  // Photo classification
  photoType: {
    type: String,
    required: true,
    enum: ["front", "left", "right", "bite", "upper", "lower"],
    lowercase: true
  },
  // Object storage key (S3)
  fileKey: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // Original filename
  originalFileName: {
    type: String,
    trim: true
  },
  // File size in bytes
  fileSize: {
    type: Number,
    min: 0
  },
  // MIME type
  mimeType: {
    type: String,
    trim: true
  },
  // AI analysis status
  aiAnalysisStatus: {
    type: String,
    enum: ["pending", "queued", "processing", "completed", "failed", "skipped"],
    default: "pending"
  },
  // AI analysis result summary
  aiFindings: {
    alignerFit: {
      type: String,
      enum: ["good", "poor", "unknown"],
      default: "unknown"
    },
    toothMovement: {
      type: String,
      enum: ["on_track", "behind", "unknown"],
      default: "unknown"
    },
    flags: [{
      type: String
    }],
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    }
  },
  // Soft delete
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual: storage path
patientPhotoSchema.virtual("storagePath").get(function () {
  return `org/${this.organizationId}/patients/${this.patientId}/photos/${this.fileKey}`;
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
patientPhotoSchema.index({
  patientId: 1,
  caseId: 1
});
patientPhotoSchema.index({
  monitoringSessionId: 1
});
patientPhotoSchema.index({
  aiAnalysisStatus: 1
});
const modelName = "PatientPhoto";
module.exports = {
  modelName,
  schema: patientPhotoSchema
};