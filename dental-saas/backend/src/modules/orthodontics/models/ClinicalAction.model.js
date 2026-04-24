/**
 * ClinicalAction.model.js — Phase 3 Clinical Appliance State Model
 *
 * ROLE: Persists the CURRENT state of all clinical appliance actions
 *       (archwires, elastics, powerchains, accessories, ligatures, IPR, space markers).
 *
 * DESIGN:
 *   - Single shared collection for all 7 domains (domain field differentiates)
 *   - Soft-delete via status: "ACTIVE" | "REMOVED"
 *   - Each document represents ONE placement event with optional removal timestamp
 *   - No nested history — ClinicalEvent collection is the audit trail
 *
 * PER-ORG: All operations via getModel(req.dbConnection, ClinicalActionDef)
 */

"use strict";

const mongoose = require("mongoose");
const ClinicalActionSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  snapshotId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // ── Domain classification ────────────────────────────────────────────────
  domain: {
    type: String,
    enum: ["archwire", "elastic", "powerchain", "accessory", "ligature", "ipr", "space"],
    required: true,
    index: true
  },
  // ── Action type within domain ────────────────────────────────────────────
  actionType: {
    type: String,
    enum: ["ARCHWIRE_PLACED", "ELASTIC_APPLIED", "POWERCHAIN_APPLIED", "ACCESSORY_ADDED", "LIGATURE_ADDED", "IPR_ADDED", "SPACE_MARKER_ADDED"],
    required: true
  },
  // ── Lifecycle status ─────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ["ACTIVE", "REMOVED"],
    default: "ACTIVE",
    index: true
  },
  // ── Domain-specific payload (flexible) ────────────────────────────────────
  // Stored as Mixed — validated at service layer.
  // archwire:   { arch, material, size, brand }
  // elastic:    { fromTooth, toTooth, type, size }
  // powerchain: { arch, segments }
  // accessory:  { type, toothId, notes }
  // ligature:   { type, toothId, notes }
  // ipr:        { betweenTeeth, amount, notes }
  // space:      { toothId, type, notes }
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // ── Audit ─────────────────────────────────────────────────────────────────
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  removedBy: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  removedAt: {
    type: Date,
    default: null
  },
  removalReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// ── Indexes ──────────────────────────────────────────────────────────────────
// Primary query patterns
ClinicalActionSchema.index({
  caseId: 1,
  domain: 1,
  status: 1
});
ClinicalActionSchema.index({
  caseId: 1,
  createdAt: -1
});
ClinicalActionSchema.index({
  snapshotId: 1
});
const modelName = "ClinicalAction";
module.exports = {
  modelName,
  schema: ClinicalActionSchema
};