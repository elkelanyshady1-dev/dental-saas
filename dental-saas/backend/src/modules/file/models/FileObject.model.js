/**
 * FileObject.model.js
 * Module: file
 * Layer: Domain Model
 *
 * Stores metadata for every file uploaded through the File Module.
 * The binary lives in the storage provider (R2 / local / S3) under `key`.
 * This document is the canonical record for ownership, access control,
 * audit history, and signed-URL resolution.
 *
 * RELATIONSHIP TO EXISTING File MODEL:
 *   src/modules/files/models/File.model.js — older model, category-based,
 *   uses storageKey + patientId/caseId/visitId.
 *
 *   This model (FileObject) is the new standard:
 *   - module + entityId replace category + patientId/caseId/visitId
 *   - key replaces storageKey
 *   - metadata.originalName replaces originalName at root
 *
 *   Both models coexist. New code uses FileObject; existing code keeps File.
 *
 * MIGRATION PATTERN (on reads):
 *   if (record.fileId)      → FileObject.findById → storageFacade.getAccessUrl(key)
 *   else if (record.imageKey) → storageFacade.getAccessUrl(imageKey)
 *   else                    → record.imageUrl  (legacy local path)
 *
 * PLANE: Organization (per-org DB — resolved via getModel)
 * TENANT ISOLATION: organizationId is indexed + enforced via req.dbConnection
 */

"use strict";

const mongoose = require("mongoose");

// ─── Sub-Schema: Metadata ─────────────────────────────────────────────────────

const metadataSchema = new mongoose.Schema({
  originalName: {
    type: String,
    default: null
  },
  tags: {
    type: [String],
    default: []
  }
}, {
  _id: false
});

// ─── Main Schema ──────────────────────────────────────────────────────────────

const fileObjectSchema = new mongoose.Schema({
  // ── Storage Reference ─────────────────────────────────────────────────
  // The R2/S3/local object key. This is the SSOT — never store signed URLs.
  // Signed URLs are derived on-demand via storageFacade.getAccessUrl(key, orgId).
  key: {
    type: String,
    required: true,
    unique: true
  },
  // ── Domain Context ────────────────────────────────────────────────────
  // module + entityId replace the legacy category + patientId/caseId/visitId
  // pattern. They are intentionally generic to support any domain entity.
  //
  //   module:    "orthodontics" | "recordset" | "patients" | "xray" | ...
  //   entityId:  caseId | patientId | visitId | snapshotId | ...
  module: {
    type: String,
    required: true
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // ── File Properties ───────────────────────────────────────────────────
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true,
    min: 0
  },
  // ── Audit ─────────────────────────────────────────────────────────────
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // ── Soft Delete ───────────────────────────────────────────────────────
  // Hard deletes are FORBIDDEN. Only deletedAt is set on removal.
  // All read queries MUST filter { deletedAt: null }.
  deletedAt: {
    type: Date,
    default: null
  },
  // ── Optional Metadata ─────────────────────────────────────────────────
  metadata: {
    type: metadataSchema,
    default: () => ({})
  }
}, {
  timestamps: true,
  // createdAt, updatedAt
  collection: "fileobjects"
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Primary access pattern: list all files for a given entity within an org
fileObjectSchema.index({
  module: 1,
  entityId: 1
});

// Fast lookup for key-based access (getFileAccessUrl)
// key is already unique: unique: true above creates an index
// This explicit compound index adds deletedAt for efficient "find active by key"
fileObjectSchema.index({
  key: 1,
  deletedAt: 1
});

// Uploader audit queries
fileObjectSchema.index({
  uploadedBy: 1
});

// ─── Model Export (getModel-compatible) ──────────────────────────────────────

const modelName = "FileObject";
module.exports = {
  modelName,
  schema: fileObjectSchema
};