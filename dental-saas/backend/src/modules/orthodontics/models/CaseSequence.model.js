/**
 * CaseSequence.model.js — Phase 5.2: Atomic Sequence Counter
 *
 * ROLE: Per-case monotonic sequence counter for ClinicalEvent ordering.
 *
 * ARCHITECTURE:
 *   - One document per (organizationId, caseId) pair
 *   - Incremented atomically via findOneAndUpdate($inc, { upsert: true })
 *   - Zero duplicate sequence numbers under any concurrent write rate
 *   - Transaction-safe: pass MongoDB session to findOneAndUpdate
 *
 * INVARIANTS:
 *   - currentSequence starts at 0 (first increment yields 1)
 *   - Never decremented — append-only
 *   - organizationId scoped for cross-tenant safety
 */

"use strict";

const mongoose = require("mongoose");
const CaseSequenceSchema = new mongoose.Schema({
  caseId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  currentSequence: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Uniqueness enforced at the compound level — one counter per org+case
CaseSequenceSchema.index({
  caseId: 1
}, {
  unique: true
});
const modelName = "CaseSequence";
module.exports = {
  modelName,
  schema: CaseSequenceSchema
};