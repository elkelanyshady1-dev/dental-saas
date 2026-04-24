/**
 * outbox.config.js — Canonical Outbox Tuning Constants
 * Core Infrastructure — Event Durability
 *
 * SINGLE SOURCE OF TRUTH for outbox worker / reclaim / retry behavior.
 *
 * Consumers MUST import from this file — inline time literals or per-file
 * constants are forbidden by invariant tests. Updating a value here changes
 * behavior for every worker (outboxPublisher.worker, replayEngine) in
 * lock-step, which is the whole point.
 *
 * PLANE: Core Infrastructure (cross-cutting)
 *
 * Phase 6 — BullMQ-mode constants (USE_BULLMQ, BULLMQ_QUEUE_NAME,
 * BULLMQ_CONCURRENCY, RECLAIM_INTERVAL_MS, RECONCILE_INTERVAL_MS,
 * RATE_LIMIT_MAX, RATE_LIMIT_DURATION_MS, LOCK_DURATION_MS) were removed
 * together with the Redis eradication. Polling worker is the only delivery
 * path; the server aborts at boot if USE_BULLMQ_OUTBOX is set.
 */

"use strict";

/**
 * VISIBILITY_TIMEOUT_MS
 *
 * How long an event may remain in "processing" before it is considered
 * orphaned and eligible for reclaim (reset to "pending"). A crash between
 * atomic claim and finalize is the canonical failure mode — without reclaim
 * those events are stuck forever.
 *
 * Tuning rule of thumb: set to 2–3× the p99 handler duration. Too short =
 * double-processing pressure (handlers must already be idempotent, but
 * churn is wasteful). Too long = slow recovery after a crash.
 */
const VISIBILITY_TIMEOUT_MS = parseInt(
    process.env.OUTBOX_VISIBILITY_TIMEOUT_MS || "60000", // 60s default
    10
);

/**
 * MAX_RETRIES
 *
 * Retry ceiling before an event is moved to the DLQ (status="failed" +
 * dlqReason set). Must be consistent with EventOutbox schema defaults;
 * per-event `maxAttempts` still overrides on a case-by-case basis.
 */
const MAX_RETRIES = parseInt(process.env.OUTBOX_MAX_RETRIES || "5", 10);

/**
 * POLL_INTERVAL_MS
 *
 * Cadence at which the outbox publisher worker drains pending events per
 * tenant DB. Kept here so the worker no longer owns its own time literal.
 */
const POLL_INTERVAL_MS = parseInt(process.env.OUTBOX_POLL_INTERVAL_MS || "5000", 10);

/**
 * BATCH_SIZE
 *
 * Maximum events drained per tenant per poll cycle. Bounds the amount of
 * work one cycle can do, ensuring fairness across tenants.
 */
const BATCH_SIZE = parseInt(process.env.OUTBOX_BATCH_SIZE || "50", 10);

module.exports = {
    VISIBILITY_TIMEOUT_MS,
    MAX_RETRIES,
    POLL_INTERVAL_MS,
    BATCH_SIZE,
};
