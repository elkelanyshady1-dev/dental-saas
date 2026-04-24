/**
 * BranchCounter — Atomic sequence counter for branch-based patient IDs.
 *
 * Each branch maintains its own monotonically increasing sequence.
 * Used to generate simple patient codes like M1, M2, N1, S1.
 *
 * Usage:
 *   const counter = await BranchCounter.findOneAndUpdate(
 *       { branchId, organizationId },
 *       { $inc: { sequence: 1 } },
 *       { upsert: true, returnDocument: "after" }
 *   );
 *   const code = `${branchInitial}${counter.sequence}`;
 */

"use strict";

const mongoose = require("mongoose");
const branchCounterSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  sequence: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Per-org DB: unique per branch per database (was per-org+branch)
branchCounterSchema.index({
  branchId: 1
}, {
  unique: true
});
const modelName = "BranchCounter";
module.exports = {
  modelName,
  schema: branchCounterSchema
};