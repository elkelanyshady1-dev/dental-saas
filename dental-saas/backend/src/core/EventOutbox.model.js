/**
 * EventOutbox.model.js
 * Core Infrastructure — Transactional Event Outbox Pattern
 * v24.0 — TASK-PLATFORM-RELIABILITY-HARDENING Phase 1
 *
 * PURPOSE:
 * Persistent queue that guarantees domain events are never lost, even if the
 * application crashes between a database commit and the EventBus emit call.
 *
 * PATTERN:
 *   1. Business code writes the event to EventOutbox *inside the same transaction*
 *      as the domain mutation.
 *   2. A background worker (outboxPublisher.worker.js) polls for "pending" events
 *      and publishes them to the in-process EventBus.
 *   3. Published events are marked "published"; failed ones are retried up to
 *      MAX_RETRY before being marked "failed" for human investigation.
 *
 * INVARIANTS:
 *   - Outbox rows are APPEND-ONLY. Never delete rows; mark as published/failed.
 *   - Outbox writes MUST be inside the same session/transaction as the domain write.
 *   - publishedAt must be set atomically with status = "published".
 *
 * PLANE: Core (shared by all planes)
 * COLLECTION: eventoutbox
 */

"use strict";

const mongoose = require("mongoose");
const eventOutboxSchema = new mongoose.Schema({
  // Domain event type string (must match domainEvents.js constants)
  eventType: {
    type: String,
    required: true,
    index: true
  },
  // Full event payload (same shape that eventBus.emit receives)
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // Logical name of the emitting service (for schemaRegistry validation)
  emitter: {
    type: String,
    default: "unknown"
  },
  // Delivery lifecycle
  status: {
    type: String,
    enum: ["pending", "published", "failed"],
    default: "pending"
    // index declared via schema.index() below — do not add index: true here
  },
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 5
  },
  // Error message from the last failed publish attempt
  lastError: {
    type: String,
    default: null
  },
  // When the event was successfully published to EventBus
  publishedAt: {
    type: Date,
    default: null
  },
  // Optional correlation ID for distributed tracing
  correlationId: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: "eventoutbox"
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Worker poll query: pending events ordered by creation time (FIFO)
eventOutboxSchema.index({
  status: 1,
  createdAt: 1
});
// Metrics query: count by status
eventOutboxSchema.index({
  status: 1
});
// Cleanup / archival: published events older than N days
eventOutboxSchema.index({
  status: 1,
  publishedAt: 1
});
const modelName = "EventOutbox";
module.exports = {
  modelName,
  schema: eventOutboxSchema
};