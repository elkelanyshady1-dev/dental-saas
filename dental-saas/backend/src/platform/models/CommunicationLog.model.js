/**
 * CommunicationLog.model.js
 * Platform Domain — Dispatcher-era communication event log
 *
 * Captures terminal-state events from the Hybrid Execution Model:
 *   - SYNC path: dispatch → sync.handler → provider → log
 *   - ASYNC path: dispatch → async.handler → QStash publish → log "queued"
 *                 → webhook → job.controller → dispatch(sync) → log "sent"
 *   - Fallback: async.handler catches publish error → deliverSync → log "fallback"
 *   - Security: webhook signature failure → log "security-failed"
 *
 * 30-day TTL — this is telemetry, not a journal. Retention is intentional:
 * long-term patterns live in CommunicationMetrics rollups (separate model);
 * this log exists for fast forensic drilldown on recent events.
 *
 * All writes MUST go through infrastructure/communication/commLogger.tryLogCommEvent —
 * it guarantees fire-and-forget semantics so logging cannot block the hot path.
 *
 * PLANE: Platform / Infrastructure (shared DB). Cross-plane events are logged
 * with optional organizationId for per-tenant drilldown.
 */

"use strict";

const mongoose = require("mongoose");

// Canonical mode vocabulary — any new value requires adding to this enum AND
// updating the dashboard's filter/legend. Prevents silent taxonomy drift.
const COMM_LOG_MODES = ["sync",
// direct sync delivery (auth flows, user-waiting)
"qstash",
// async path — queued to QStash
"qstash-received",
// webhook entered, signature valid, dispatching forced-sync
"fallback-sync",
// async path degraded to sync (publish failure or not configured)
"security-failed" // webhook auth/signature rejected — NOT dispatched
];
const COMM_LOG_STATUSES = ["queued", "sent", "failed", "fallback"];
const communicationLogSchema = new mongoose.Schema({
  // What was attempted. NO field-level `index: true` — compound indexes
  // below cover these via index-prefix rules, avoiding write amplification.
  // "internal" (Phase 5.1): in-process infra events such as CASE_LINK that
  // have no external provider. Dashboards must tolerate this value.
  channel: {
    type: String,
    enum: ["email", "sms", "whatsapp", "internal"],
    required: true
  },
  type: {
    type: String,
    required: true
  },
  // LIFECYCLE state. Canonical pairings with `mode`:
  //   queued   ↔ qstash | qstash-received           (in-flight markers)
  //   sent     ↔ sync                               (normal delivery)
  //   failed   ↔ sync | fallback-sync | security-failed
  //   fallback ↔ fallback-sync                      (delivered via fallback)
  status: {
    type: String,
    enum: COMM_LOG_STATUSES,
    required: true
  },
  // TRANSPORT — drives dashboard filters + "fallback spike" alerts.
  mode: {
    type: String,
    enum: COMM_LOG_MODES,
    required: true
  },
  // Provider adapter name if known (e.g. "sendgrid", "twilio"). Optional.
  provider: {
    type: String,
    default: null
  },
  // Truncated error message. Never store stack traces (PII/secret risk).
  error: {
    type: String,
    default: null
  },
  // Retry count from the sync handler. 1 means first-try success.
  attempts: {
    type: Number,
    default: 1,
    min: 1
  },
  // Total wall-clock ms inside deliverSync (entry → terminal event).
  // Includes retry backoff when attempts > 1 — filter by `attempts: 1` to
  // isolate pure provider latency. Not indexed (not a query dimension;
  // aggregations only).
  durationMs: {
    type: Number,
    default: null
  },
  // QStash message id — correlates (qstash queued → qstash-received → sync sent)
  // triplets. Indexed as a single field below for fast correlation lookup.
  qstashMessageId: {
    type: String,
    default: null
  },
  // Optional per-tenant context for drilldown. Absent on cross-org infra events.
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  // Anything the instrumentation site wants to surface without schema
  // changes (e.g. { fallbackReason }). Never put PII here.
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // Explicit createdAt — we own the TTL so don't rely on timestamps: true.
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  // timestamps: false — `createdAt` is managed above; no `updatedAt` needed.
  collection: "communicationLogs"
});

// ─── Indexes (minimal set — this collection is high-write) ───────────────────
// Principle: single-field indexes on query dimensions are redundant when a
// compound with the same prefix exists. Mongo's TTL monitor runs every ~60s.
//
// All compounds use (dimension, createdAt:-1) because every dashboard query
// filters or sorts by createdAt window.
communicationLogSchema.index({
  createdAt: 1
}, {
  expireAfterSeconds: 30 * 24 * 60 * 60
});
communicationLogSchema.index({
  qstashMessageId: 1
}); // correlation lookup
communicationLogSchema.index({
  status: 1,
  createdAt: -1
}); // /failures, summary
communicationLogSchema.index({
  channel: 1,
  createdAt: -1
}); // stats byChannel
communicationLogSchema.index({
  type: 1,
  createdAt: -1
}); // stats byType
communicationLogSchema.index({
  mode: 1,
  createdAt: -1
}); // stats byMode, alerts
// Orphan query: { status:"queued", mode:"qstash", createdAt:{$lt:X} }.
// Sharper than the (status,createdAt) prefix when the collection grows past ~1M
// rows; cheap to carry now. Keep both — (status,createdAt) still serves /failures.
communicationLogSchema.index({
  status: 1,
  mode: 1,
  createdAt: -1
});
communicationLogSchema.index({
  organizationId: 1,
  createdAt: -1
}); // per-tenant drilldown

const modelName = "CommunicationLog";
module.exports = {
  modelName,
  schema: communicationLogSchema,
  COMM_LOG_MODES,
  COMM_LOG_STATUSES
};