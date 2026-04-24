/**
 * OrgStorageAlertState.model.js
 * ═══════════════════════════════════════════════════════════════
 * Platform DB — one document per organization.
 *
 * Tracks the last dispatched storage alert level per org so the
 * dispatcher can suppress duplicate notifications (anti-spam).
 *
 * Anti-spam rules (enforced in storageAlertDispatcher.service.js):
 *   • Only dispatch when level changes (none→warning, warning→critical, etc.)
 *   • Re-notify once per 24h on unresolved critical/warning
 *
 * PLANE: Platform
 * COLLECTION: orgstoragealertstates
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const mongoose = require("mongoose");
const orgStorageAlertStateSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    unique: true,
    index: true
  },
  lastAlertLevel: {
    type: String,
    enum: ["none", "warning", "critical"],
    default: "none"
  },
  lastAlertAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: "orgstoragealertstates"
});
const modelName = "OrgStorageAlertState";
module.exports = {
  modelName,
  schema: orgStorageAlertStateSchema
};