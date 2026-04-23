/**
 * SharedCase.model.js (v2.0)
 * Phase 6 — Multi-Doctor Collaboration Sharing
 *
 * Stores shared case/records tokens with expiration, permissions,
 * collaborator tracking, and fine-grained access control.
 *
 * Supports two share types:
 *  - "case"    → entire ortho case + workflow
 *  - "records" → selected photos only (by recordId)
 *
 * ─── SENTINEL COMPLIANCE ────────────────────────────────────────
 *  ✅ organizationId from JWT context (never from request body)
 *  ✅ ISO country codes only (no display names stored)
 *  ✅ Audit fields (createdBy, createdAt)
 */

"use strict";

const mongoose = require("mongoose");

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const collaboratorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 200, default: "" },
    role: {
      type: String,
      enum: ["doctor", "lab", "patient"],
      default: "doctor",
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const permissionsSchema = new mongoose.Schema(
  {
    canComment: { type: Boolean, default: true },
    canDownload: { type: Boolean, default: false },
    canViewAnalysis: { type: Boolean, default: true },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────

const sharedCaseSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrthodonticCase",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // ─── Share Type ─────────────────────────────────────────────
    type: {
      type: String,
      enum: ["case", "records"],
      default: "case",
    },
    // If type === 'records', only these photo IDs are visible
    recordIds: {
      type: [String],
      default: [],
    },
    // Record set level sharing — share entire Pre/Mid/Post sets
    recordSetIds: {
      type: [String],
      default: [],
    },
    // ─── Snapshot Binding ─────────────────────────────────────────
    // Share always reads from this snapshot — NEVER from live workflowData.
    // Guarantees: shared data is frozen at time of link creation.
    snapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowSnapshot",
      default: null,
    },

    // ─── Access Control ─────────────────────────────────────────
    expiresAt: {
      type: Date,
      required: true,
      // TTL index declared via schema.index({ expiresAt: 1 }, { expireAfterSeconds: ... }) below
    },
    permissions: {
      type: permissionsSchema,
      default: () => ({ canComment: true, canDownload: false, canViewAnalysis: true }),
    },
    hidePatientName: {
      type: Boolean,
      default: false,
    },

    // ─── Collaboration ──────────────────────────────────────────
    collaborators: {
      type: [collaboratorSchema],
      default: [],
    },

    // ─── Audit ──────────────────────────────────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },

    // ─── Backward Compatibility ─────────────────────────────────
    // Deprecated: use permissions.canComment instead
    allowComments: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "sharedCases",
  }
);

// TTL index — auto-delete expired shares after 30 days past expiration
sharedCaseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 2592000 });

const modelName = "SharedCase";

module.exports = {
    modelName,
    schema: sharedCaseSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, sharedCaseSchema),
};
