/**
 * AlignerProgress.model.js
 * Phase 5 — Patient Portal: Aligner Stage Progress Tracking
 *
 * Tracks each patient's progress through their aligner stages.
 * Tenant-isolated by organizationId.
 */

"use strict";

const mongoose = require("mongoose");
const alignerProgressSchema = new mongoose.Schema({
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
  // Links to the clinic-side AlignerPlan
  alignerPlanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AlignerPlan"
  },
  stageNumber: {
    type: Number,
    required: true,
    min: 1
  },
  // Stage lifecycle FSM
  status: {
    type: String,
    enum: ["pending", "active", "completed", "skipped"],
    default: "pending"
  },
  scheduledStartDate: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  // Expected wear duration (days)
  wearDurationDays: {
    type: Number,
    default: 14
  },
  // Doctor notes for this stage
  doctorNotes: {
    type: String,
    trim: true,
    default: ""
  },
  // Patient-reported pain level (1-10)
  patientPainLevel: {
    type: Number,
    min: 0,
    max: 10,
    default: null
  },
  // Patient-reported wear compliance (hours/day)
  patientWearHours: {
    type: Number,
    min: 0,
    max: 24,
    default: null
  },
  // Whether monitoring session was submitted for this stage
  monitoringSubmitted: {
    type: Boolean,
    default: false
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

// Per-org DB: indexes optimized — no organizationId prefix needed.
alignerProgressSchema.index({
  patientId: 1,
  caseId: 1
});
alignerProgressSchema.index({
  caseId: 1,
  stageNumber: 1
}, {
  unique: true
});
alignerProgressSchema.index({
  status: 1
});
const modelName = "AlignerProgress";
module.exports = {
  modelName,
  schema: alignerProgressSchema
};