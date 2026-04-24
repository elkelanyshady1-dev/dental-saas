/**
 * replayEngine.js
 * Core Infrastructure — Event Replay / Outbox Recovery
 *
 * A safe, idempotent replay engine for stuck EventOutbox events across:
 *   - Platform DB  (dentalsaas-dev)
 *   - Tenant DBs   (dental_org_<orgId>)
 *
 * SAFETY GUARANTEES:
 *   - Dry-run by default: scans and reports without mutating anything
 *   - Atomic claim: findOneAndUpdate(status: "pending" → "processing")
 *     prevents double processing in multi-instance environments
 *   - Respects maxAttempts: never re-claims events past their retry ceiling
 *   - Idempotent by design: delegates to eventHandlerRegistry, whose
 *     default handler re-emits through the shared eventBus (same path as
 *     the live outbox.worker). Subscribers are already required to be
 *     idempotent.
 *   - Per-tenant isolation: tenant scans use dbManager.getConnection(orgId)
 *     inside a try/finally that always calls releaseConnection().
 *
 * INPUT FILTERS:
 *   - scope     : "platform" | "tenant" | "all"
 *   - orgIds    : optional array — limit tenant scope to these orgs
 *   - eventType : optional regex/exact string — filter by eventType
 *   - status    : LOCKED to ["pending"] — failed events MUST use
 *                 dlqService.replayFailedEvent (preserves DLQ audit trail)
 *   - maxAge    : optional ms — only replay events older than N ms
 *   - limit     : optional per-DB cap (default: 1000)
 *
 * OUTPUT:
 *   {
 *     mode: "dry" | "execute",
 *     scannedDbs: number,
 *     candidates: number,
 *     replayed:   number,
 *     skipped:    number,
 *     failed:     number,
 *     perDb: [ { db, candidates, replayed, skipped, failed, events: [...] } ],
 *   }
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
const logger = require("@utils/logger");
const {
  VISIBILITY_TIMEOUT_MS
} = require("../../config/outbox.config");
const OrganizationDef = require("../../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
} // ─── Defaults ────────────────────────────────────────────────────────────────
const DEFAULT_LIMIT = 1000;
// Reclaim threshold is owned by config/outbox.config.js so every worker
// (outbox.worker, replayEngine, regional processors) reclaims in lock-step.
// Do NOT reintroduce an env var or literal here.
const PROCESSING_TIMEOUT_MS = VISIBILITY_TIMEOUT_MS;

// ─── Query Builder ───────────────────────────────────────────────────────────

/**
 * Build a Mongo query for pending events.
 *
 * HARD RULE: status is locked to "pending".
 * Replaying failed (DLQ) events directly through the scanner bypasses the
 * DLQ audit contract. Those must flow through dlqService.replayFailedEvent().
 *
 * @throws {Error} if caller attempts to include "failed" or any non-pending status
 */
function buildQuery({
  eventType,
  status,
  maxAge
}) {
  // ── Hard block: no DLQ bypass ──────────────────────────────────────
  if (status && status.some(s => s !== "pending")) {
    throw new Error(`ReplayEngine only supports status="pending". ` + `Use the DLQ API to replay failed events: POST /api/platform/dlq/replay/:eventId`);
  }
  const q = {
    status: "pending"
  };
  if (eventType) {
    if (eventType instanceof RegExp) {
      q.eventType = eventType;
    } else if (typeof eventType === "string" && eventType.length) {
      q.eventType = eventType;
    }
  }
  if (maxAge && Number.isFinite(maxAge)) {
    q.createdAt = {
      $lte: new Date(Date.now() - maxAge)
    };
  }
  return q;
}

// ─── Stuck-Processing Reclaim ─────────────────────────────────────────────────

/**
 * Reset events orphaned in "processing" back to "pending".
 *
 * A crash between claim and finalize leaves events stuck at processing forever
 * since all worker queries filter on status="pending". This reclaim step runs
 * at the top of each processConnection cycle to surface those orphans.
 *
 * Uses lastAttemptAt (written on every claim) as the timeout discriminator.
 * Falls back to updatedAt if lastAttemptAt is unset (pre-migration docs).
 *
 * @param {mongoose.Model} Outbox
 * @param {string} dbLabel
 * @returns {Promise<number>} count of reclaimed events
 */
async function reclaimStuckProcessing(Outbox, dbLabel) {
  const cutoff = new Date(Date.now() - PROCESSING_TIMEOUT_MS);
  // updateMany is permitted here — it is bulk RECLAIM (reset-to-pending
  // for orphaned claims), NEVER bulk CLAIM. Actual claiming uses the
  // atomic findOneAndUpdate path in outbox.worker.js / processConnection.
  const res = await Outbox.updateMany({
    status: "processing",
    $or: [{
      lastAttemptAt: {
        $lt: cutoff
      }
    }, {
      lastAttemptAt: {
        $exists: false
      },
      updatedAt: {
        $lt: cutoff
      }
    }]
  },
  // Bump `attempts` when reclaiming so a handler that keeps crashing
  // mid-processing eventually trips the MAX_RETRIES → DLQ ceiling
  // instead of looping forever on the same event.
  {
    $set: {
      status: "pending"
    },
    $inc: {
      attempts: 1
    }
  });
  if (res.modifiedCount > 0) {
    logger.warn({
      event: "OUTBOX_STUCK_RECLAIMED",
      db: dbLabel,
      reclaimed: res.modifiedCount,
      timeoutMs: PROCESSING_TIMEOUT_MS
    }, `[Replay] Reclaimed ${res.modifiedCount} stuck-processing event(s) on ${dbLabel}`);
  }
  return res.modifiedCount;
}

// ─── Core: Process One DB Connection ─────────────────────────────────────────

/**
 * Scan + (optionally) replay events on a single connection.
 *
 * @param {Object} params
 * @param {mongoose.Connection} params.conn
 * @param {string} params.dbLabel — label for logging ("platform" or "org:<id>")
 * @param {Object} params.filter
 * @param {boolean} params.dryRun
 * @param {number}  params.limit
 */
async function processConnection({
  conn,
  dbLabel,
  filter,
  dryRun,
  limit
}) {
  const Outbox = getModel(conn, EventOutboxDef);

  // ── Phase 0: reclaim stuck-processing events ───────────────────────────
  // Must run even in dry-run mode — stuck events are a data-integrity
  // issue, not a "replay" action. Reclaim resets them to pending so
  // subsequent phases can pick them up.
  await reclaimStuckProcessing(Outbox, dbLabel);
  const query = buildQuery(filter);
  const report = {
    db: dbLabel,
    candidates: 0,
    replayed: 0,
    skipped: 0,
    failed: 0,
    events: []
  };

  // ── Phase 1: scan ──────────────────────────────────────────────────────
  const candidates = await Outbox.find(query).sort({
    createdAt: 1
  }).limit(limit).lean();
  report.candidates = candidates.length;
  if (candidates.length === 0) return report;
  logger.info({
    event: "REPLAY_SCAN",
    db: dbLabel,
    candidates: candidates.length,
    dryRun
  }, `[Replay] ${dbLabel}: ${candidates.length} candidate(s)`);
  if (dryRun) {
    // Report only — no mutations
    for (const c of candidates) {
      report.events.push({
        _id: String(c._id),
        eventType: c.eventType,
        aggregateType: c.aggregateType,
        aggregateId: String(c.aggregateId),
        status: c.status,
        attempts: c.attempts,
        maxAttempts: c.maxAttempts,
        createdAt: c.createdAt,
        action: "would-replay"
      });
    }
    report.skipped = candidates.length;
    return report;
  }

  // ── Phase 2: execute ───────────────────────────────────────────────────
  for (const c of candidates) {
    // Atomic claim — skip if another worker/replay grabbed it
    const claimed = await Outbox.findOneAndUpdate({
      _id: c._id,
      status: "pending" // locked — only pending is claimable
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
      report.skipped++;
      report.events.push({
        _id: String(c._id),
        eventType: c.eventType,
        action: "skipped-not-claimable"
      });
      continue;
    }

    // Respect retry ceiling → DLQ (unified: >= not >)
    if (claimed.attempts >= (claimed.maxAttempts || 5)) {
      await dlqService.markAsDLQ({
        conn,
        event: claimed,
        category: "SYSTEM_ERROR",
        reason: "MAX_ATTEMPTS_EXHAUSTED_AT_REPLAY",
        actorType: "system",
        actorId: "replayEngine",
        dbLabel
      });
      report.failed++;
      report.events.push({
        _id: String(claimed._id),
        eventType: claimed.eventType,
        action: "failed-max-attempts"
      });
      continue;
    }
    const result = await handlerRegistry.invoke(claimed.eventType, {
      payload: claimed.payload,
      record: claimed,
      ctx: {
        dbLabel
      }
    });
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
      try {
        await dlqService.finalizeReplayResult({
          conn,
          event: claimed,
          result: "success"
        });
      } catch (_) {/* non-fatal */}
      report.replayed++;
      report.events.push({
        _id: String(claimed._id),
        eventType: claimed.eventType,
        aggregateType: claimed.aggregateType,
        action: "replayed",
        handler: result.handler
      });
      logger.info({
        event: "REPLAY_OK",
        db: dbLabel,
        outboxId: String(claimed._id),
        eventType: claimed.eventType,
        handler: result.handler
      }, "[Replay] Event replayed");
    } else {
      // Return to pending for the live worker to keep retrying,
      // unless we've exhausted attempts → DLQ.
      const exhausted = claimed.attempts >= (claimed.maxAttempts || 5);
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
          actorId: "replayEngine",
          dbLabel
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
          }
        });
      }
      const nextStatus = exhausted ? "failed" : "pending";
      report.failed++;
      report.events.push({
        _id: String(claimed._id),
        eventType: claimed.eventType,
        action: nextStatus === "failed" ? "failed-handler" : "requeued",
        err: result.err ? result.err.message : "unknown"
      });
      logger.warn({
        event: "REPLAY_FAIL",
        db: dbLabel,
        outboxId: String(claimed._id),
        eventType: claimed.eventType,
        err: result.err ? result.err.message : undefined,
        nextStatus
      }, "[Replay] Event replay failed");
    }
  }
  return report;
}

// ─── Orchestration: run across platform + tenants ───────────────────────────

/**
 * Main entry. Scans the requested scope and (optionally) replays events.
 *
 * @param {Object} options
 * @param {"platform"|"tenant"|"all"} [options.scope="all"]
 * @param {string[]} [options.orgIds]
 * @param {string|RegExp} [options.eventType]
 * @param {string[]} [options.status=["pending"]]
 * @param {number} [options.maxAge]
 * @param {number} [options.limit=1000]
 * @param {boolean} [options.dryRun=true] — default SAFE
 */
async function run(options = {}) {
  const {
    scope = "all",
    orgIds = null,
    eventType = null,
    status = DEFAULT_STATUSES,
    maxAge = null,
    limit = DEFAULT_LIMIT,
    dryRun = true
  } = options;
  const filter = {
    eventType,
    status,
    maxAge
  };
  const summary = {
    mode: dryRun ? "dry" : "execute",
    scope,
    filter: {
      eventType: eventType ? String(eventType) : null,
      status,
      maxAge,
      orgIds
    },
    scannedDbs: 0,
    candidates: 0,
    replayed: 0,
    skipped: 0,
    failed: 0,
    perDb: []
  };

  // ── Platform DB ─────────────────────────────────────────────────────────
  if (scope === "platform" || scope === "all") {
    const conn = platformConnection.get();
    if (!conn || conn.readyState !== 1) {
      throw new Error("replayEngine: platform connection is not ready");
    }
    const report = await processConnection({
      conn,
      dbLabel: "platform",
      filter,
      dryRun,
      limit
    });
    summary.scannedDbs++;
    summary.candidates += report.candidates;
    summary.replayed += report.replayed;
    summary.skipped += report.skipped;
    summary.failed += report.failed;
    summary.perDb.push(report);
  }

  // ── Tenant DBs ──────────────────────────────────────────────────────────
  if (scope === "tenant" || scope === "all") {
    let targetOrgIds = orgIds;
    if (!targetOrgIds || targetOrgIds.length === 0) {
      const orgs = await Organization().find({}, {
        _id: 1
      }).lean();
      targetOrgIds = orgs.map(o => String(o._id));
    }
    for (const orgId of targetOrgIds) {
      let conn = null;
      try {
        conn = await dbManager.getConnection(orgId);
        const report = await processConnection({
          conn,
          dbLabel: `org:${orgId}`,
          filter,
          dryRun,
          limit
        });
        summary.scannedDbs++;
        summary.candidates += report.candidates;
        summary.replayed += report.replayed;
        summary.skipped += report.skipped;
        summary.failed += report.failed;
        summary.perDb.push(report);
      } catch (err) {
        logger.error({
          event: "REPLAY_TENANT_ERROR",
          orgId,
          err: err.message
        }, "[Replay] Tenant scan failed");
        summary.perDb.push({
          db: `org:${orgId}`,
          error: err.message,
          candidates: 0,
          replayed: 0,
          skipped: 0,
          failed: 0,
          events: []
        });
      } finally {
        if (conn) {
          try {
            dbManager.releaseConnection(orgId);
          } catch (_) {
            /* ignore */
          }
        }
      }
    }
  }
  logger.info({
    event: "REPLAY_COMPLETE",
    mode: summary.mode,
    scope: summary.scope,
    scannedDbs: summary.scannedDbs,
    candidates: summary.candidates,
    replayed: summary.replayed,
    skipped: summary.skipped,
    failed: summary.failed
  }, "[Replay] Cycle complete");
  return summary;
}
module.exports = {
  run,
  processConnection,
  buildQuery,
  reclaimStuckProcessing
};