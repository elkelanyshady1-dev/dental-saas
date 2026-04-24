/**
 * AuthTrace.js — Authorization Trace Persistence Model
 *
 * Stores AUTH_TRACE events for audit, analytics, and replay.
 * Every request that passes through the auth middleware chain
 * generates a trace that can be persisted to this collection.
 *
 * Persistence is:
 *   - Async (non-blocking — never delays HTTP response)
 *   - Sampled (configurable via AUTH_TRACE_SAMPLE_RATE)
 *   - Denial-biased (denials are ALWAYS stored regardless of sampling)
 *
 * Environment Variables:
 *   AUTH_TRACE_SAMPLE_RATE     — float 0.0–1.0 (default 1.0 = 100%)
 *   AUTH_TRACE_DENY_ALWAYS     — "true" = always store denials (default true)
 *   AUTH_TRACE_RETENTION_DAYS  — number of days to keep traces (for cleanup cron)
 *
 * PLANE: Org only — scoped by organizationId.
 * COLLECTION: authtraces
 *
 * Phase 20 — Authorization Intelligence & Control Plane
 * Phase 20.1 — Scaling, Queue & Analytics (TASK-AUTH-SCALE-001)
 */

"use strict";

const mongoose = require("mongoose");

// ─── Auth Trace Step Sub-Schema ─────────────────────────────────────────────

const authTraceStepSchema = new mongoose.Schema({
  layer: {
    type: String,
    enum: ["RBAC", "ENTITLEMENT", "PBAC", "FIELD_WRITE", "FIELD_READ"],
    required: true
  },
  result: {
    type: String,
    enum: ["ALLOW", "DENY", "SKIP", "WARN", "FILTER_APPLIED"],
    required: true
  },
  permission: {
    type: String,
    default: null
  },
  resource: {
    type: String,
    default: null
  },
  reason: {
    type: String,
    default: null
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  elapsed: {
    type: Number,
    default: null
  },
  timestamp: {
    type: Number,
    default: null
  }
}, {
  _id: false
});

// ─── Main Auth Trace Schema ─────────────────────────────────────────────────

const authTraceSchema = new mongoose.Schema({
  // ── Request Identity ────────────────────────────────────────────
  requestId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
    index: true
  },
  // Per-org DB mode: kept for reference/audit but NOT required.
  // Database isolation (dental_org_<orgId>) is the tenant boundary.
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    index: true
  },
  role: {
    type: String,
    default: null
  },
  // ── Request Context ─────────────────────────────────────────────
  method: {
    type: String,
    enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    required: true
  },
  path: {
    type: String,
    required: true
  },
  statusCode: {
    type: Number,
    default: null
  },
  // ── Resource Context (Phase 20 — TASK-AUTH-INT-002) ─────────────
  resourceType: {
    type: String,
    default: null,
    index: true
  },
  resourceId: {
    type: String,
    default: null
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  // ── Performance ─────────────────────────────────────────────────
  duration: {
    type: Number,
    default: null
  },
  stepCount: {
    type: Number,
    default: 0
  },
  // ── Decision Summary ────────────────────────────────────────────
  hasDenial: {
    type: Boolean,
    default: false,
    index: true
  },
  denialLayer: {
    type: String,
    default: null
  },
  // ── Trace Steps ─────────────────────────────────────────────────
  steps: [authTraceStepSchema],
  // ── Timestamps ──────────────────────────────────────────────────
  createdAt: {
    type: Date,
    default: Date.now
    // index defined below via schema.index({ createdAt: 1 }) for retention cleanup
  }
}, {
  // Disable Mongoose version key and updatedAt (traces are immutable)
  versionKey: false,
  timestamps: false
});

// Per-org DB: indexes optimized for per-database queries.
// organizationId compound indexes REMOVED — DB isolation handles tenant scoping.

// Analytics queries: time range
authTraceSchema.index({
  createdAt: -1
});

// Denial analytics: denial + time
authTraceSchema.index({
  hasDenial: 1,
  createdAt: -1
});

// Resource audit: resource type + resource id
authTraceSchema.index({
  resourceType: 1,
  resourceId: 1,
  createdAt: -1
});

// User activity: user + time
authTraceSchema.index({
  userId: 1,
  createdAt: -1
});

// Permission analysis
authTraceSchema.index({
  "steps.permission": 1
}, {
  partialFilterExpression: {
    "steps.permission": {
      $exists: true
    }
  }
});

// Retention cleanup: TTL-friendly index on createdAt
authTraceSchema.index({
  createdAt: 1
});

// ─── Model ──────────────────────────────────────────────────────────────────

const modelName = "AuthTrace";
module.exports = {
  modelName,
  schema: authTraceSchema
};