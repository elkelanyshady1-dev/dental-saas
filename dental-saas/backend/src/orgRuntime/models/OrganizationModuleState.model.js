/**
 * OrganizationModuleState.model.js — Module Activation History Tracker
 * Phase B.2 — Runtime Maturity & Architecture Optimization
 *
 * PURPOSE:
 * Tracks the historical enable/disable state of each module per organization.
 * This provides observability into:
 *   - Which orgs use which modules
 *   - When modules were enabled/disabled
 *   - Current enablement state
 *
 * The state is synchronized from req.capabilities.modules by the
 * moduleStateSync service on each request (debounced via TTL).
 *
 * PLANE: Org-plane data.
 * SCHEMA: Additive only — no breaking changes.
 */

"use strict";

const mongoose = require("mongoose");
const organizationModuleStateSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true
  },
  moduleKey: {
    type: String,
    required: true,
    index: true
  },
  enabled: {
    type: Boolean,
    required: true,
    default: false
  },
  enabledAt: {
    type: Date,
    default: null
  },
  disabledAt: {
    type: Date,
    default: null
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },
  // Track who/what triggered the last state change
  lastChangedBy: {
    type: String,
    default: "system"
  }
}, {
  timestamps: true,
  collection: "organizationModuleStates"
});

// Compound unique index — one record per org per module
organizationModuleStateSchema.index({
  organizationId: 1,
  moduleKey: 1
}, {
  unique: true
});
const modelName = "OrganizationModuleState";
module.exports = {
  modelName,
  schema: organizationModuleStateSchema
};