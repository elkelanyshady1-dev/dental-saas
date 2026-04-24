/**
 * PolicyVersion.js — Policy Version History Model
 *
 * Stores snapshots of policy definitions when changes are made.
 * Provides audit trail for policy modifications.
 *
 * PLANE: Org only — scoped by organizationId.
 * COLLECTION: policyversions
 */

"use strict";

const mongoose = require("mongoose");
const policyVersionSchema = new mongoose.Schema({
  version: {
    type: Number,
    required: true
  },
  // Snapshot of the full policy configuration at this version
  policies: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // What changed in this version
  changeType: {
    type: String,
    enum: ["initial", "policy_added", "policy_modified", "policy_removed", "bulk_update", "field_access_change"],
    default: "bulk_update"
  },
  changeSummary: {
    type: String,
    default: ""
  },
  // Who made the change
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  createdByName: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// ─── Indexes ────────────────────────────────────────────────────────────────

policyVersionSchema.index({
  version: -1
});
policyVersionSchema.index({
  createdAt: -1
});

// ─── Immutability Guards ────────────────────────────────────────────────────
// Policy versions are append-only — no updates or deletes.
policyVersionSchema.pre(["updateOne", "findOneAndUpdate", "replaceOne", "updateMany"], function () {
  throw new Error("[PolicyVersion] Immutability violation: PolicyVersion entries are append-only and cannot be updated.");
});
policyVersionSchema.pre(["deleteOne", "findOneAndDelete", "deleteMany"], function () {
  throw new Error("[PolicyVersion] Immutability violation: PolicyVersion entries are append-only and cannot be deleted.");
});
const modelName = "PolicyVersion";
module.exports = {
  modelName,
  schema: policyVersionSchema
};