/**
 * SupportSettings.model.js — Per-org support configuration singleton (Plan E14)
 *
 * Singleton-per-org-DB document containing SLA hours, escalation targets,
 * auto-close cadence, ticket daily cap, and allowed categories.
 *
 * Replaces the hardcoded `SLA_HOURS_BY_PRIORITY` + `TICKET_DAILY_CAP_PER_ORG`
 * with a per-org override surface. Defaults match the old hardcoded values.
 *
 * Read by:
 *   - orgSupportBridge.service.js (ticket create → slaDeadline computation)
 *   - sla.job.js (future: per-org escalation targets and cooldown)
 *
 * Version-tracked so PATCH can surface 409 VERSION_CONFLICT the same way
 * BillingSettings does.
 */

"use strict";

const mongoose = require("mongoose");
const SINGLETON_KEY = "org-support-settings";

// Priorities match the Ticket.priority enum.
const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

// Categories match the Ticket.category enum; env-wise this is a tenant-scoped allow-list.
const KNOWN_CATEGORIES = ["technical", "billing", "security", "subscription", "dispute", "refund_request", "feature_request", "other"];

// Default SLA hours (mirror the old hardcoded map in platformTicket.service.js
// and orgSupportBridge.service.js).
const DEFAULT_SLA_HOURS = {
  CRITICAL: 4,
  HIGH: 12,
  MEDIUM: 24,
  LOW: 48
};
const slaHoursSchema = new mongoose.Schema({
  CRITICAL: {
    type: Number,
    min: 1,
    max: 720,
    default: DEFAULT_SLA_HOURS.CRITICAL
  },
  HIGH: {
    type: Number,
    min: 1,
    max: 720,
    default: DEFAULT_SLA_HOURS.HIGH
  },
  MEDIUM: {
    type: Number,
    min: 1,
    max: 720,
    default: DEFAULT_SLA_HOURS.MEDIUM
  },
  LOW: {
    type: Number,
    min: 1,
    max: 720,
    default: DEFAULT_SLA_HOURS.LOW
  }
}, {
  _id: false
});
const escalationTargetSchema = new mongoose.Schema({
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  role: {
    type: String,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    trim: true,
    maxlength: 200
  }
}, {
  _id: false
});
const supportSettingsSchema = new mongoose.Schema({
  singletonKey: {
    type: String,
    default: SINGLETON_KEY,
    unique: true,
    immutable: true
  },
  slaHoursByPriority: {
    type: slaHoursSchema,
    default: () => ({
      ...DEFAULT_SLA_HOURS
    })
  },
  escalationTargets: {
    type: [escalationTargetSchema],
    default: [],
    validate: {
      validator: arr => !arr || arr.length <= 5,
      message: "At most 5 escalation targets"
    }
  },
  allowedCategories: {
    type: [String],
    default: ["technical", "billing", "security", "subscription", "dispute", "refund_request", "feature_request", "other"],
    validate: {
      validator: arr => Array.isArray(arr) && arr.length >= 1 && arr.every(c => KNOWN_CATEGORIES.includes(c)),
      message: "allowedCategories must be a non-empty subset of KNOWN_CATEGORIES"
    }
  },
  autoCloseAfterDays: {
    type: Number,
    min: 1,
    max: 365,
    default: 14
  },
  ticketsPerDayCap: {
    type: Number,
    min: 1,
    max: 10000,
    default: 100
  },
  reopenWindowDays: {
    type: Number,
    min: 0,
    max: 90,
    default: 7
  },
  version: {
    type: Number,
    default: 0
  },
  updatedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  minimize: false
});
supportSettingsSchema.index({
  singletonKey: 1
}, {
  unique: true
});
const modelName = "SupportSettings";
module.exports = {
  modelName,
  schema: supportSettingsSchema,
  SINGLETON_KEY,
  PRIORITIES,
  KNOWN_CATEGORIES,
  DEFAULT_SLA_HOURS
};