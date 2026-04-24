/**
 * BillingControl.model.js
 * Platform Billing Kill Switch — Control Document
 *
 * SINGLETON: exactly ONE document per platform.
 * The service layer enforces this via findOneAndUpdate with upsert.
 *
 * Fields:
 *   killSwitch   — master kill switch flag (false = billing operational)
 *   reason       — human-readable reason for current state
 *   activatedBy  — actor who last toggled the switch (email or "guardian"/"anomaly-detection")
 *   activatedAt  — timestamp of last state change
 *   source       — who triggered: "manual" | "guardian" | "anomaly-detection"
 *   history      — rolling log of last 50 state changes (audit trail)
 *
 * PLANE: Platform
 * COLLECTION: billingcontrols
 */

"use strict";

const mongoose = require("mongoose");

// ── History entry (embedded, capped at 50) ────────────────────────────────────
const billingControlHistorySchema = new mongoose.Schema({
  killSwitch: {
    type: Boolean,
    required: true
  },
  reason: {
    type: String,
    default: ""
  },
  activatedBy: {
    type: String,
    default: "system"
  },
  source: {
    type: String,
    enum: ["manual", "guardian", "anomaly-detection", "system"],
    default: "system"
  },
  changedAt: {
    type: Date,
    default: () => new Date()
  }
}, {
  _id: false
});

// ── Main Schema ───────────────────────────────────────────────────────────────
const billingControlSchema = new mongoose.Schema({
  // Constant field — ensures only ONE document can exist (unique index below)
  singleton: {
    type: String,
    default: "global",
    immutable: true
  },
  // ── Kill Switch State ─────────────────────────────────────────────────
  killSwitch: {
    type: Boolean,
    default: false,
    required: true
  },
  // Human-readable reason for the current state
  reason: {
    type: String,
    default: ""
  },
  // Who last changed the state (email address or system actor name)
  activatedBy: {
    type: String,
    default: "system"
  },
  // Timestamp of the last state change
  activatedAt: {
    type: Date,
    default: null
  },
  // Source that triggered the last change
  source: {
    type: String,
    enum: ["manual", "guardian", "anomaly-detection", "system"],
    default: "system"
  },
  // Rolling audit history (capped at 50 entries)
  history: {
    type: [billingControlHistorySchema],
    default: []
  }
}, {
  timestamps: true,
  collection: "billingcontrols"
});

// ── Singleton index — only one document with singleton="global" may exist ─────
billingControlSchema.index({
  singleton: 1
}, {
  unique: true,
  name: "unique_billing_control_singleton"
});
const modelName = "BillingControl";
module.exports = {
  modelName,
  schema: billingControlHistorySchema
};