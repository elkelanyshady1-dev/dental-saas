/**
 * ClinicalEvent.model.js — Unified Clinical Event Engine V1
 *
 * ROLE: Audit trail only (append-only log)
 * SOURCE OF TRUTH: State models (Bonding, Tad, SequencePlan) remain authoritative
 *
 * ARCHITECTURE:
 *   - Per-org DB isolation via getModel(req.dbConnection, ...)
 *   - Non-blocking writes (fire-and-forget)
 *   - Payload size limited to prevent DB bloat
 *   - Severity for future alert/notification routing
 */

"use strict";

const mongoose = require("mongoose");

const ClinicalEventSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
  },

  // ── Phase 2: Visit linkage — REQUIRED for all new events ──────────────
  // Every clinical mutation MUST belong to an active visit session.
  // Events created outside a visit session are REJECTED.
  visitId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      "VisitRecord",
    required: true,
    index:    true,
  },

  // ── Phase 6: Doctor identity ─────────────────────────────────────────────
  // The userId who triggered this event (from req.context.userId at write time).
  // Required as of Phase 6 to satisfy full audit contract.
  doctorId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      "User",
    required: true,
    index:    true,
  },

  type: {
    type: String,
    enum: [
      // ── Bonding Events ─────────────────────────────────────────────────
      "BONDING_APPLIED",
      "BONDING_REMOVED",
      "BRACKET_REPOSITIONED",
      "BONDING_REBONDED",

      // ── TAD Events ─────────────────────────────────────────────────────
      "TAD_INSERTED",
      "TAD_FAILED",
      "TAD_REMOVED",
      "TAD_REINSERTED",
      "TAD_MARKED_FOR_REMOVAL",

      // ── Sequence Events ────────────────────────────────────────────────
      "SEQUENCE_STEP_COMPLETED",
      "SEQUENCE_PLAN_CREATED",
      "SEQUENCE_PLAN_UPDATED",

      // ── Phase 2: Granular Per-Tooth Events ────────────────────────────
      // These drive applyEvent() in the replay engine for tooth-level mutations.
      "SET_TOOTH_STATUS",
      "SET_TOOTH_BONDING",
      "SET_TOOTH_DIAGNOSIS",
      "SET_TOOTH_ALIGNMENT",
      "SET_TOOTH_CONDITION",
      "TOGGLE_TOOTH_ALERT",
      "CLEAR_TOOTH",

      // ── Phase 3: Appliance Events ──────────────────────────────────────
      "ARCHWIRE_PLACED",
      "ARCHWIRE_REMOVED",
      "ELASTIC_APPLIED",
      "ELASTIC_REMOVED",
      "POWERCHAIN_APPLIED",
      "POWERCHAIN_REMOVED",
      "ACCESSORY_ADDED",
      "ACCESSORY_REMOVED",
      "LIGATURE_ADDED",
      "LIGATURE_REMOVED",
      "IPR_ADDED",
      "IPR_REMOVED",
      "SPACE_MARKER_ADDED",
      "SPACE_MARKER_REMOVED",

      // ── Legacy (read-only in replay — no chart mutation) ───────────────
      "WIRE_PLACED",
      "ELASTICS_APPLIED",
      "EXTRACTION_DONE",
      "NOTE_ADDED",
    ],
    required: true,
  },

  severity: {
    type: String,
    enum: ["info", "warning", "critical"],
    default: "info",
  },

  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },

  metadata: {
    toothId: { type: Number, default: null },
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    relatedEntityType: {
      type: String,
      enum: ["Bonding", "Tad", "SequencePlan", "WorkflowSnapshot", "ClinicalAction", null],
      default: null,
    },
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },

  // ── Phase 5.1 Hardening Fields ───────────────────────────────────────────────

  /**
   * version — event schema version for forward-compatibility.
   * Replay engine calls upgradeEvent(event) before applying.
   * Current version: 1 (base granular events, Phase 2–5).
   */
  version: {
    type:     Number,
    required: true,
    default:  1,
  },

  /**
   * eventId — globally unique UUID for idempotency.
   * Generated at creation time via crypto.randomUUID().
   * Replay engine tracks seenEventIds to skip duplicates.
   * Unique index prevents duplicate writes at DB level.
   */
  eventId: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
  },

  /**
   * sequence — monotonically increasing per-case counter.
   * Provides deterministic event ordering independent of createdAt clock skew.
   * Phase 5.1: sort by { sequence: 1, createdAt: 1 } during replay.
   * Pre-Phase 5.1 events have no sequence — sorted by createdAt (legacy fallback).
   *
   * Phase 5.2: sequence is now guaranteed unique per case via atomic CaseSequence counter.
   * Sort: { sequence: 1 } is the SOLE replay sort — no createdAt fallback needed.
   * Pre-Phase 5.1 events (sequence: null) sort before all sequenced events in ASC order.
   */
  sequence: {
    type:     Number,
    default:  null,    // null for pre-Phase 5.1 events (sort first in ASC)
    index:    true,
  },
});

ClinicalEventSchema.index({ organizationId: 1, caseId: 1, createdAt: -1 });
// ASC createdAt index retained for: timeline queries, snapshot scoping, time-travel filters
ClinicalEventSchema.index({ organizationId: 1, caseId: 1, createdAt:  1 }, { name: 'replay_asc' });
// Phase 5.2: sequence-only index — sole authoritative replay sort (no createdAt tie-break needed)
ClinicalEventSchema.index({ organizationId: 1, caseId: 1, sequence:   1 }, { name: 'replay_sequence' });
ClinicalEventSchema.index({ organizationId: 1, caseId: 1, type: 1 });
ClinicalEventSchema.index({ organizationId: 1, snapshotId: 1 });
// Phase 2: per-visit event queries
ClinicalEventSchema.index({ organizationId: 1, visitId: 1, createdAt: -1 });
ClinicalEventSchema.index({ organizationId: 1, severity: 1, createdAt: -1 });
// eventId uniqueness is enforced by the field-level `unique: true` above

const modelName = "ClinicalEvent";

module.exports = {
  modelName,
  schema: ClinicalEventSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, ClinicalEventSchema),
};
