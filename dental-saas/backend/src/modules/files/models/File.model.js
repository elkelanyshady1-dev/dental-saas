/**
 * File.model.js — File Metadata Document (Per-Org DB)
 * Phase v27 — Storage + Infra Hardening
 *
 * Stores metadata for every file uploaded through the File module.
 * The actual file binary lives in the storage provider (R2/S3/local) —
 * this document holds the storageKey to resolve it.
 *
 * ARCHITECTURE:
 *   Upload → storageService.upload() → R2/S3/local  (binary)
 *                                   → File.create()  (metadata)
 *   Access → File.findById() → storageService.getSignedUrl(storageKey) → signed URL
 *   Delete → File.isDeleted=true (soft) + optional storageService.delete()
 *
 * PLANE: Organization (per-org DB — uses getModel)
 * Tenant isolation is at the DB level (per-org database).
 */

"use strict";

const mongoose = require("mongoose");

// ─── Category Enum ──────────────────────────────────────────────────────────

const FILE_CATEGORIES = ["patient_photo", "recordset_photo", "xray", "snapshot", "stl", "attachment", "document", "audio", "other"];

// ─── Schema ──────────────────────────────────────────────────────────────────

const fileSchema = new mongoose.Schema({
  // ── Entity References (all optional — depends on domain) ────────────
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  visitId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // ── Storage Reference ───────────────────────────────────────────────
  storageKey: {
    type: String,
    required: true,
    unique: true
  },
  // ── File Metadata ───────────────────────────────────────────────────
  fileName: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    default: null
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true,
    min: 0
  },
  // ── Classification ──────────────────────────────────────────────────
  category: {
    type: String,
    enum: FILE_CATEGORIES,
    required: true
  },
  // ── Audit ───────────────────────────────────────────────────────────
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // ── Soft Delete ─────────────────────────────────────────────────────
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  }
}, {
  timestamps: true,
  collection: "files"
});

// ─── Indexes ────────────────────────────────────────────────────────────────

fileSchema.index({
  category: 1
});
fileSchema.index({
  caseId: 1
});
fileSchema.index({
  patientId: 1
});
fileSchema.index({
  visitId: 1
});
fileSchema.index({
  isDeleted: 1
}); // fast filter for active files

// ─── Model Export (getModel-compatible) ──────────────────────────────────────

const modelName = "File";
module.exports = {
  modelName,
  schema: fileSchema,
  FILE_CATEGORIES
};