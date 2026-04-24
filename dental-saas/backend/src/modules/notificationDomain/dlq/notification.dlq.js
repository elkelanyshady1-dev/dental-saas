/**
 * notification.dlq.js — Notification Dead Letter Queue
 *
 * AUDIT-008 Remediation: DLQ for notification delivery failures.
 *
 * Pattern mirrors accountingDomain/dlq/ — stores failed notification jobs
 * for manual review, retry, or alerting.
 *
 * Integrated into notification.worker.js "failed" handler:
 *   If BullMQ retries exhausted → write to DLQ → emit NOTIFICATION_DLQ_WRITTEN event.
 *
 * PLANE: Org only. DB: shared platform DB (cross-org notification infra).
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");
const getSharedModel = require("@core/db/getSharedModel");

// ── DLQ Schema ─────────────────────────────────────────────────────────────
const NotificationDLQSchema = new mongoose.Schema({
  jobId: {
    type: String
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  error: {
    type: String,
    required: true
  },
  retryCount: {
    type: Number,
    default: 0
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  resolution: {
    type: String,
    enum: ["retried", "dismissed", "escalated", null],
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});
NotificationDLQSchema.index({
  createdAt: -1
});
NotificationDLQSchema.index({
  resolvedAt: 1,
  resolution: 1
});
const MODEL_NAME = "NotificationDLQ";
const NotificationDLQDef = { modelName: MODEL_NAME, schema: NotificationDLQSchema };

// Lazy-bind: compile on first use so shared connection is ready at call time.
let _cached = null;
function _model() {
  if (!_cached) _cached = getSharedModel(NotificationDLQDef);
  return _cached;
}

// ── DLQ Write ──────────────────────────────────────────────────────────────

/**
 * write() — Persists a failed notification job to the DLQ.
 * Called from notification.worker.js "failed" event after all retries exhausted.
 *
 * @param {object} params
 * @param {object} params.job      — BullMQ Job object
 * @param {Error}  params.err      — Final failure error
 */
async function write({
  job,
  err
}) {
  try {
    const payload = job?.data || {};
    await _model().create({
      jobId: job?.id || "unknown",
      payload,
      error: err?.message || String(err),
      retryCount: job?.attemptsMade || 0
    });
    logger.warn({
      jobId: job?.id,
      orgId: payload.organizationId,
      err: err?.message
    }, "[NotificationDLQ] Job written to DLQ after exhausted retries");
  } catch (dlqError) {
    // DLQ write itself failed — just log, never throw
    logger.error({
      err: dlqError.message
    }, "[NotificationDLQ] Failed to write to DLQ — data may be lost");
  }
}

/**
 * markResolved() — Mark a DLQ entry as resolved.
 */
async function markResolved(dlqId, resolution = "dismissed") {
  return _model().findByIdAndUpdate(dlqId, {
    resolvedAt: new Date(),
    resolution
  }, {
    new: true
  }).lean();
}

/**
 * listUnresolved() — Fetch unresolved DLQ entries for monitoring dashboards.
 */
async function listUnresolved({
  limit = 50
} = {}) {
  // Per-org DB: no orgId filter needed (connection IS the tenant boundary).
  const query = {
    resolvedAt: null
  };
  return _model().find(query).sort({
    createdAt: -1
  }).limit(limit).lean();
}
module.exports = {
  write,
  markResolved,
  listUnresolved,
  NotificationDLQDef
};