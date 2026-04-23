/**
 * Bonding.model.js — Bonding Engine Core Model
 *
 * Architecture:
 *   - Event-sourced: every state change is in history[] — never overwrite
 *   - TAD linking: linkedTadIds[] references Tad._id for biomechanics engine
 *   - Source tracking: OPG row click vs manual bonding is preserved
 *   - Upsert pattern: same tooth in same case → rebonding, not duplicate document
 *   - organizationId required for multi-tenant isolation
 *
 * Status lifecycle:
 *   ACTIVE ─→ DEBONDED ─→ ACTIVE (rebonded)
 */

"use strict";

const mongoose = require("mongoose");

// ─── Sub-Schema: Bonding History Event ───────────────────────────────────────
const BondingHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ["BONDED", "DEBONDED", "REBONDED", "REPOSITIONED"],
      required: true,
    },
    /** Snapshot of the bonding data at the time of the action */
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notes: { type: String, default: null },
  },
  { _id: true, timestamps: { createdAt: "createdAt", updatedAt: false } }
);

// ─── Main Schema: Bonding Record ─────────────────────────────────────────────
const BondingSchema = new mongoose.Schema(
  {
    // ── Tenant + Case Context (SSOT) ───────────────────────────────────────
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrthodonticCase",
      required: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Patient",
      required: true,
    },
    /** Snapshot this bonding was applied in — for restore/diff */
    snapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkflowSnapshot",
      default: null,
    },

    // ── Clinical Placement ──────────────────────────────────────────────────
    /** FDI tooth number (11, 21, 36, etc.) */
    tooth: { type: Number, required: true },

    /** Bracket, Band, or Molar Tube */
    type: {
      type: String,
      enum: ["BRACKET", "BAND", "TUBE"],
      required: true,
    },

    // ── Bracket Specification ───────────────────────────────────────────────
    prescription: { type: String, default: null },     // "MBT", "Roth", etc.
    slot: { type: String, default: null },              // "0.022", "0.018"
    bondingHeight: { type: Number, default: null },     // mm from incisal/occlusal edge
    bondingPosition: {                                  // where on crown
      type: String,
      enum: ["marginal-ridges-level", "middle-middle", "custom", null],
      default: null,
    },
    brand: { type: String, default: null },

    // ── Source Tracking ─────────────────────────────────────────────────────
    source: {
      /** How this bonding was initiated */
      type: {
        type: String,
        enum: ["manual", "opg_reference"],
        default: "manual",
      },
      /** OPG group label that triggered this (e.g. "U1", "L6") */
      referenceGroup: { type: String, default: null },
    },

    // ── TAD Engine Integration ──────────────────────────────────────────────
    /** TAD _ids providing anchorage for this tooth — null if no TAD linkage */
    linkedTadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tad" }],

    // ── Status ──────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["ACTIVE", "DEBONDED"],
      default: "ACTIVE",
    },

    // ── Event History (immutable append-only log) ───────────────────────────
    history: { type: [BondingHistorySchema], default: [] },
  },
  { timestamps: true }
);

// ─── Compound Unique Index: one document per tooth per case ──────────────────
// Allows upsert (rebonding) without creating duplicate records.
BondingSchema.index({ caseId: 1, tooth: 1 }, { unique: true });
BondingSchema.index({ patientId: 1, status: 1 });
BondingSchema.index({ caseId: 1, status: 1 });

const modelName = "Bonding";

module.exports = {
  modelName,
  schema: BondingSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, BondingSchema),
};
