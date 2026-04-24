/**
 * retryService.js
 * Core Infrastructure — Event Outbox Self-Healing
 *
 * Core retry logic used by retryWorker.js. Scans every pending event
 * older than STALE_THRESHOLD_MS on:
 *   - The platform DB (default mongoose connection)
 *   - Every tenant DB  (dental_org_<orgId>) via dbManager
 *
 * Then (in execute mode) atomically claims each event, resolves a
 * handler through eventHandlerRegistry, runs it, and records the
 * outcome on the outbox document.
 *
 * IDEMPOTENCY MODEL:
 *   Step 1 — Claim:
 *       findOneAndUpdate({status:"pending"}, {$set:{status:"processing"},$inc:{attempts:1}})
 *       This is atomic and multi-instance safe (same pattern as the
 *       live outbox.worker). A second worker instance can never
 *       double-claim the same event.
 *   Step 2 — Already-processed short-circuit:
 *       If the claimed record's status is anything other than
 *       "processing", bail out — something else already finished it.
 *   Step 3 — Handler:
 *       Default handler re-emits via eventBus — same path as the
 *       live outbox worker. Subscribers are already required to be
 *       idempotent.
 *   Step 4 — Finalize:
 *       success → status="processed", processedAt=now, lastError=null
 *       failure → if attempts >= MAX_RETRIES: status="failed"
 *                 else:                        status="pending" (requeue)
 *
 * CONFIG (env):
 *   RETRY_INTERVAL_MS         (used by retryWorker, not here)
 *   MAX_RETRIES               default 5
 *   RETRY_BATCH_SIZE          default 20   — per-DB cap per cycle
 *   RETRY_STALE_THRESHOLD_MS  default 60000 — only events older than N ms
 *   RETRY_CONCURRENCY         default 5    — parallel handler executions
 *
 * PLANE: Core Infrastructure (cross-cutting)
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const platformConnection = require("@core/db/platformConnection");
const mongoose = require("mongoose");
const getModel = require("../../core/db/getModel");
const EventOutboxDef = require("./EventOutbox.model");
const dbManager = require("../../core/db/dbManager");
const handlerRegistry = require("./eventHandlerRegistry");
const dlqService = require("../../platform/dlq/dlq.service");
const {
  reclaimStuckProcessing
} = require("./replayEngine");
const logger = require("@utils/logger");
const OrganizationDef = require("../../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
} // ─── Config ──────────────────────────────────────────────────────────────────
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "5", 10);
const RETRY_BATCH_SIZE = parseInt(process.env.RETRY_BATCH_SIZE || "20", 10);
const STALE_THRESHOLD_MS = parseInt(process.env.RETRY_STALE_THRESHOLD_MS || "60000", 10);
const RETRY_CONCURRENCY = parseInt(process.env.RETRY_CONCURRENCY || "5", 10);

// ─── Concurrency Helper ──────────────────────────────────────────────────────

/**
 * Run `tasks` with a concurrency cap. Each task is a 0-arg async fn.
 * Returns the array of settled results.
 */
async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        results[i] = {
          status: "fulfilled",
          value: await tasks[i]()
        };
      } catch (err) {
        results[i] = {
          status: "rejected",
          reason: err
        };
      }
    }
  }
  const workers = [];
  const n = Math.min(Math.max(1, limit), tasks.length);
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// ─── Per-Event Processing ────────────────────────────────────────────────────

/**
 * Claim → handle → finalize a single candidate.
 * Returns one of: "processed" | "requeued" | "failed" | "skipped"
 */
async function processEvent({
  Outbox,
  candidate,
  dbLabel,
  conn
}) {
  // ── Step 1: atomic claim ────────────────────────────────────────────
  const claimed = await Outbox.findOneAndUpdate({
    _id: candidate._id,
    status: "pending"
  }, {
    $set: {
      status: "processing",
      lastAttemptAt: new Date()
    },
    $inc: {
      attempts: 1
    }
  }, {
    returnDocument: "after"
  });
  if (!claimed) {
    // Another instance (live worker or another retry worker) grabbed it
    logger.debug({
      event: "RETRY_WORKER",
      db: dbLabel,
      eventId: String(candidate._id),
      result: "skipped"
    }, "[RetryWorker] Candidate not claimable (already in-flight)");
    return "skipped";
  }

  // ── Step 2: ceiling check (unified: >= not >) ───────────────────────
  if (claimed.attempts >= MAX_RETRIES) {
    await dlqService.markAsDLQ({
      conn,
      event: claimed,
      category: "SYSTEM_ERROR",
      reason: "MAX_RETRIES_EXHAUSTED",
      actorType: "system",
      actorId: "retryWorker",
      dbLabel
    });
    logger.warn({
      event: "RETRY_WORKER",
      db: dbLabel,
      eventId: String(claimed._id),
      eventType: claimed.eventType,
      retryCount: claimed.attempts,
      result: "failed"
    }, "[RetryWorker] Max retries exhausted — moved to DLQ");
    return "failed";
  }

  // ── Step 3: unhandled event → DLQ immediately ───────────────────────
  if (!handlerRegistry.has(claimed.eventType)) {
    await dlqService.markAsDLQ({
      conn,
      event: claimed,
      category: "UNHANDLED_EVENT",
      reason: "NO_HANDLER_REGISTERED",
      actorType: "system",
      actorId: "retryWorker",
      dbLabel
    });
    logger.warn({
      event: "RETRY_WORKER",
      db: dbLabel,
      eventId: String(claimed._id),
      eventType: claimed.eventType,
      result: "failed",
      reason: "NO_HANDLER_REGISTERED"
    }, "[RetryWorker] Unhandled event type — moved to DLQ");
    return "failed";
  }
  const result = await handlerRegistry.invoke(claimed.eventType, {
    payload: claimed.payload,
    record: claimed,
    ctx: {
      dbLabel,
      origin: "retryWorker"
    }
  });

  // ── Step 4: finalize ────────────────────────────────────────────────
  if (result.ok) {
    await Outbox.updateOne({
      _id: claimed._id
    }, {
      $set: {
        status: "processed",
        processedAt: new Date(),
        lastError: null
      }
    });
    // If this was a replay, close out the last pending history entry
    try {
      await dlqService.finalizeReplayResult({
        conn,
        event: claimed,
        result: "success"
      });
    } catch (_) {/* non-fatal */}
    logger.info({
      event: "RETRY_WORKER",
      db: dbLabel,
      eventId: String(claimed._id),
      eventType: claimed.eventType,
      retryCount: claimed.attempts,
      handler: result.handler,
      result: "processed"
    }, "[RetryWorker] Event processed");
    return "processed";
  }

  // Failure: decide requeue vs DLQ
  const exhausted = claimed.attempts >= MAX_RETRIES;

  // Always append error to history (preserves full retry chain)
  const historyEntry = {
    message: result.err ? result.err.message : "unknown",
    stack: process.env.NODE_ENV !== "production" ? result.err?.stack : undefined,
    at: new Date()
  };
  if (exhausted) {
    const {
      category,
      reason
    } = dlqService.categorizeError(result.err);
    await dlqService.markAsDLQ({
      conn,
      event: claimed,
      category,
      reason,
      err: result.err,
      actorType: "system",
      actorId: "retryWorker",
      dbLabel
    });
    await Outbox.updateOne({
      _id: claimed._id
    }, {
      $push: {
        errorHistory: historyEntry
      }
    });
    try {
      await dlqService.finalizeReplayResult({
        conn,
        event: claimed,
        result: "failed"
      });
    } catch (_) {/* non-fatal */}
  } else {
    await Outbox.updateOne({
      _id: claimed._id
    }, {
      $set: {
        status: "pending",
        lastError: result.err ? result.err.message : "unknown"
      },
      $push: {
        errorHistory: historyEntry
      }
    });
  }
  logger.warn({
    event: "RETRY_WORKER",
    db: dbLabel,
    eventId: String(claimed._id),
    eventType: claimed.eventType,
    retryCount: claimed.attempts,
    result: exhausted ? "failed" : "requeued",
    err: result.err ? result.err.message : undefined
  }, `[RetryWorker] Event ${exhausted ? "failed" : "requeued"}`);
  return exhausted ? "failed" : "requeued";
}

// ─── Per-DB Scan ─────────────────────────────────────────────────────────────

/**
 * Scan a single DB connection and process up to RETRY_BATCH_SIZE stale
 * pending events.
 */
async function processConnection({
  conn,
  dbLabel
}) {
  const Outbox = getModel(conn, EventOutboxDef);

  // ── Stuck-processing reclaim ────────────────────────────────────────────
  // Before scanning for new candidates, surface any events orphaned in
  // "processing" by a prior process crash. This must run every cycle.
  try {
    await reclaimStuckProcessing(Outbox, dbLabel);
  } catch (reclaimErr) {
    logger.warn({
      db: dbLabel,
      err: reclaimErr.message
    }, "[RetryWorker] Stuck-processing reclaim failed (non-fatal)");
  }
  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
  const candidates = await Outbox.find({
    status: "pending",
    attempts: {
      $lt: MAX_RETRIES
    },
    createdAt: {
      $lte: staleCutoff
    }
  }).sort({
    createdAt: 1
  }).limit(RETRY_BATCH_SIZE).lean();
  const stats = {
    scanned: candidates.length,
    processed: 0,
    requeued: 0,
    failed: 0,
    skipped: 0
  };
  if (candidates.length === 0) return stats;
  logger.debug({
    event: "RETRY_WORKER_SCAN",
    db: dbLabel,
    candidates: candidates.length
  }, `[RetryWorker] ${dbLabel}: ${candidates.length} stale candidate(s)`);
  const tasks = candidates.map(candidate => () => processEvent({
    Outbox,
    candidate,
    dbLabel,
    conn
  }));
  const results = await runWithConcurrency(tasks, RETRY_CONCURRENCY);
  for (const r of results) {
    if (r.status !== "fulfilled") {
      stats.failed++;
      logger.error({
        event: "RETRY_WORKER",
        db: dbLabel,
        err: r.reason?.message
      }, "[RetryWorker] processEvent threw unexpectedly");
      continue;
    }
    switch (r.value) {
      case "processed":
        stats.processed++;
        break;
      case "requeued":
        stats.requeued++;
        break;
      case "failed":
        stats.failed++;
        break;
      case "skipped":
        stats.skipped++;
        break;
    }
  }
  return stats;
}

// ─── Cycle Orchestration ─────────────────────────────────────────────────────

/**
 * One full retry cycle: platform DB + every tenant DB.
 * Returns aggregate stats.
 */
async function runCycle() {
  const started = Date.now();
  const agg = {
    scannedDbs: 0,
    scanned: 0,
    processed: 0,
    requeued: 0,
    failed: 0,
    skipped: 0,
    errors: 0
  };

  // ── Platform DB ─────────────────────────────────────────────────────
  try {
    const conn = platformConnection.get();
    if (!conn || conn.readyState !== 1) {
      throw new Error("platform connection not ready");
    }
    const stats = await processConnection({
      conn,
      dbLabel: "platform"
    });
    agg.scannedDbs++;
    agg.scanned += stats.scanned;
    agg.processed += stats.processed;
    agg.requeued += stats.requeued;
    agg.failed += stats.failed;
    agg.skipped += stats.skipped;
  } catch (err) {
    agg.errors++;
    logger.error({
      event: "RETRY_WORKER",
      db: "platform",
      err: err.message
    }, "[RetryWorker] Platform scan failed");
  }

  // ── Tenant DBs ──────────────────────────────────────────────────────
  let orgs = [];
  try {
    orgs = await Organization().find({}, {
      _id: 1
    }).lean();
  } catch (err) {
    agg.errors++;
    logger.error({
      event: "RETRY_WORKER",
      err: err.message
    }, "[RetryWorker] Failed to enumerate organizations — skipping tenant scan");
  }
  for (const org of orgs) {
    const orgId = String(org._id);
    let conn = null;
    try {
      conn = await dbManager.getConnection(orgId);
      const stats = await processConnection({
        conn,
        dbLabel: `org:${orgId}`
      });
      agg.scannedDbs++;
      agg.scanned += stats.scanned;
      agg.processed += stats.processed;
      agg.requeued += stats.requeued;
      agg.failed += stats.failed;
      agg.skipped += stats.skipped;
    } catch (err) {
      agg.errors++;
      logger.error({
        event: "RETRY_WORKER",
        db: `org:${orgId}`,
        err: err.message
      }, "[RetryWorker] Tenant scan failed");
    } finally {
      if (conn) {
        try {
          dbManager.releaseConnection(orgId);
        } catch (_) {/* ignore */}
      }
    }
  }
  const durationMs = Date.now() - started;
  if (agg.scanned > 0 || agg.errors > 0) {
    logger.info({
      event: "RETRY_WORKER_CYCLE",
      durationMs,
      ...agg
    }, "[RetryWorker] Cycle complete");
  }
  return {
    ...agg,
    durationMs
  };
}
module.exports = {
  runCycle,
  processConnection,
  processEvent,
  config: {
    MAX_RETRIES,
    RETRY_BATCH_SIZE,
    STALE_THRESHOLD_MS,
    RETRY_CONCURRENCY
  }
};