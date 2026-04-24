/**
 * GuardianAuditLog.model.js
 * Platform Guardian — Persistent Scan History
 *
 * Every manual or auto-scan saves a complete snapshot here.
 * This gives superadmins a tamper-resistant audit trail of:
 *   - When scans ran
 *   - What state the platform was in at scan time
 *   - Who triggered each scan
 *   - Full alert snapshot for forensic replay
 *
 * TTL: No automatic expiry — logs are permanent unless manually purged.
 * Index: createdAt DESC for efficient "last N scans" queries.
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const guardianAuditSchema = new mongoose.Schema({
  summary: {
    totalAlerts: {
      type: Number,
      default: 0
    },
    critical: {
      type: Number,
      default: 0
    },
    warnings: {
      type: Number,
      default: 0
    }
  },
  runtime: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  system: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  alertsSnapshot: [{
    type: {
      type: String
    },
    severity: {
      type: String,
      enum: ["critical", "warning"]
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization"
    },
    organizationName: {
      type: String
    },
    message: {
      type: String
    }
  }],
  scanTriggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlatformUser",
    default: null
  },
  scanType: {
    type: String,
    enum: ["auto", "manual"],
    default: "auto"
  },
  // Alert hash at scan time — used for change detection
  alertHash: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  // createdAt, updatedAt
  versionKey: false
});

// Efficient DESC query for "last N scans"
guardianAuditSchema.index({
  createdAt: -1
});

// Partial index for recent critical-only queries
guardianAuditSchema.index({
  "summary.critical": 1,
  createdAt: -1
});
const modelName = "GuardianAuditLog";
module.exports = {
  modelName,
  schema: guardianAuditSchema
};