/**
 * SequencePlan.model.js — Treatment Sequence Engine V1.5
 *
 * Architecture:
 *   - One plan per caseId per org (enforced by unique compound index)
 *   - steps[] are ordered by `order` field — rendered in sequence
 *   - step.actions[] are data-only hints for future AI/auto-detection (V2)
 *   - organizationId: ObjectId for multi-tenant isolation
 *
 * NOT stored: progress state (lives on WorkflowSnapshot.sequenceProgress)
 */

"use strict";

const mongoose = require("mongoose");

// ─── Step Action Sub-Schema (V2 hooks — data only, no execution in V1) ────────
const SequenceActionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["BONDING", "WIRE", "EXTRACTION", "TAD", "ELASTICS", "OTHER"],
      required: true,
    },
    /** Free-form payload for future AI/auto-detection use */
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

// ─── Step Sub-Schema ──────────────────────────────────────────────────────────
const SequenceStepSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true, min: 0 },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: null, maxlength: 1000 },
    /** Clinical actions this step involves (V2 hooks — guidance display only) */
    actions: { type: [SequenceActionSchema], default: [] },
  },
  { _id: false }
);

// ─── Main Schema ──────────────────────────────────────────────────────────────
const SequencePlanSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OrthodonticCase",
      required: true,
    },
    name: {
      type: String,
      default: "Treatment Sequence",
      maxlength: 200,
    },
    steps: { type: [SequenceStepSchema], default: [] },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// One plan per case per org — upsert-safe
SequencePlanSchema.index({ organizationId: 1, caseId: 1 }, { unique: true });

const modelName = "SequencePlan";

module.exports = {
  modelName,
  schema: SequencePlanSchema,
  default:
    mongoose.models[modelName] ||
    mongoose.model(modelName, SequencePlanSchema),
};
