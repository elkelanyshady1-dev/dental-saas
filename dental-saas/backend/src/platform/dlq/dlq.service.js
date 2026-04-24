/**
 * dlq.service.js
 * Platform — Dead Letter Queue
 *
 * The DLQ is NOT a separate collection. An outbox event with
 * status === "failed" IS the DLQ entry.
 *
 * RESPONSIBILITIES:
 *   1. markAsDLQ()          — single entry point used by workers + replay
 *   2. listFailedEvents()   — inspection query across platform + tenants
 *   3. getSummary()         — aggregate counts for dashboard
 *   4. replayFailedEvent()  — safe, audited replay of a single event
 *   5. categorizeError()    — deterministic error → failureCategory mapping
 *   6. finalizeReplayResult() — update pending replayHistory entry after
 *                               the worker actually processes the replayed
 *                               event (success or failure)
 *
 * IDEMPOTENCY:
 *   - markAsDLQ is idempotent: if the document is already failed, a
 *     second call does NOT overwrite DLQ metadata — it only appends
 *     audit-friendly context if missing.
 *   - replayFailedEvent uses a conditional update matching the "failed"
 *     status. If the event has already been requeued, the call is a
 *     no-op and returns { replayed: false, reason: "not-in-failed-state" }.
 *
 * MULTI-TENANT:
 *   Every scan iterates the platform DB + all tenant DBs via dbManager.
 *
 * AUDIT:
 *   Every DLQ transition emits an auditService.createAuditRecord() call
 *   with the contract documented in the DLQ spec:
 *     - EVENT_DLQ_ENTERED
 *     - EVENT_REPLAYED
 *     - EVENT_REPLAY_SUCCESS
 *     - EVENT_REPLAY_FAILED
 *
 * PLANE: Platform (inspection + control), Core Infra (markAsDLQ helper
 *        is called by per-tenant workers too).
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const platformConnection = require("@core/db/platformConnection");
const mongoose = require("mongoose");
const getModel = require("../../core/db/getModel");
const EventOutboxDef = require("../../core/outbox/EventOutbox.model");
const dbManager = require("../../core/db/dbManager");
const logger = require("@utils/logger");
const auditService = require("../../services/auditService");
const OrganizationDef = require("../../shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const PLATFORM_SENTINEL_ID = "000000000000000000000000";

// ─── Enums (mirror schema) ───────────────────────────────────────────────────

const FAILURE_CATEGORIES = Object.freeze(["SYSTEM_ERROR", "VALIDATION_ERROR", "DEPENDENCY_ERROR", "TIMEOUT", "UNHANDLED_EVENT", "POISON_EVENT", "SECURITY_BLOCKED"]);

// ─── Error Classification ────────────────────────────────────────────────────

/**
 * Deterministic error → failureCategory mapping.
 * Safe to call with any throwable (including non-Errors).
 *
 * @returns {{ category: string, reason: string }}
 */
function categorizeError(err) {
  if (!err) return {
    category: "SYSTEM_ERROR",
    reason: "UNKNOWN_ERROR"
  };
  const name = err.name || "";
  const msg = (err.message || "").toUpperCase();
  const code = err.code || err.errorCode || "";

  // Timeouts
  if (name === "TimeoutError" || /TIMEOUT|ETIMEDOUT|ESOCKETTIMEDOUT/.test(msg)) {
    return {
      category: "TIMEOUT",
      reason: "HANDLER_TIMEOUT"
    };
  }

  // Validation (Zod, Mongoose ValidationError, JSON schema)
  if (name === "ZodError" || name === "ValidationError" || code === "VALIDATION_ERROR") {
    return {
      category: "VALIDATION_ERROR",
      reason: name.toUpperCase() || "VALIDATION_ERROR"
    };
  }

  // Security / permission
  if (name === "ForbiddenError" || name === "UnauthorizedError" || /FORBIDDEN|UNAUTHORIZED|PERMISSION|RBAC|TENANT_MISMATCH/.test(msg)) {
    return {
      category: "SECURITY_BLOCKED",
      reason: name.toUpperCase() || "SECURITY_BLOCKED"
    };
  }

  // Dependency errors (external services, Stripe, SMTP, HTTP)
  if (/STRIPE|SMTP|ECONNREFUSED|ENOTFOUND|502|503|504|FETCH|AXIOS/.test(msg) || /STRIPE|HTTP/.test(name)) {
    return {
      category: "DEPENDENCY_ERROR",
      reason: "EXTERNAL_SERVICE_FAILURE"
    };
  }

  // Deterministic DB-level poison
  if (/E11000|DUPLICATE KEY|CAST/.test(msg)) {
    return {
      category: "POISON_EVENT",
      reason: "DETERMINISTIC_DB_FAILURE"
    };
  }
  return {
    category: "SYSTEM_ERROR",
    reason: code || name.toUpperCase() || "HANDLER_EXCEPTION"
  };
}

// ─── Audit Helper ────────────────────────────────────────────────────────────

async function _writeAudit({
  action,
  eventId,
  organizationId,
  details,
  actorId,
  actorType
}) {
  try {
    await auditService.createAuditRecord({
      actorId: actorId || "system",
      actorType: actorType || "system",
      action,
      entity: "EventOutbox",
      entityId: String(eventId),
      organizationId: organizationId || PLATFORM_SENTINEL_ID,
      branchId: PLATFORM_SENTINEL_ID,
      success: true,
      details,
      signatureVersion: 1
    });
  } catch (auditErr) {
    // Audit failure must NOT break DLQ transitions, but must be logged.
    logger.error({
      event: "DLQ_AUDIT_WRITE_FAILED",
      action,
      eventId: String(eventId),
      err: auditErr.message
    }, "[DLQ] Audit write failed");
  }
}

// ─── markAsDLQ ───────────────────────────────────────────────────────────────

/**
 * Transition an outbox event into the DLQ (status = "failed").
 *
 * Idempotent: if the doc is already failed, only fills in missing marker
 * fields — it does NOT overwrite existing DLQ metadata.
 *
 * @param {Object} params
 * @param {mongoose.Connection} params.conn
 * @param {Object}  params.event        — outbox document (lean or hydrated)
 * @param {string}  params.category     — one of FAILURE_CATEGORIES
 * @param {string}  params.reason       — fine-grained reason code
 * @param {Error}   [params.err]        — original exception
 * @param {string}  [params.actorId]    — who caused the transition (worker/user)
 * @param {string}  [params.actorType]  — "system" | "platform_user"
 * @param {string}  [params.dbLabel]    — "platform" or "org:<id>"
 */
async function markAsDLQ({
  conn,
  event,
  category,
  reason,
  err,
  actorId,
  actorType,
  dbLabel
}) {
  if (!FAILURE_CATEGORIES.includes(category)) {
    throw new Error(`markAsDLQ: invalid failureCategory "${category}"`);
  }
  if (!reason || typeof reason !== "string") {
    throw new Error("markAsDLQ: failureReason is required");
  }
  const Outbox = getModel(conn, EventOutboxDef);
  const now = new Date();
  const errorMessage = err?.message || reason;
  const errorStack = process.env.NODE_ENV === "production" ? undefined : err?.stack;

  // Idempotent transition:
  //   - If already failed → only $setOnInsert-style fields via updateOne with
  //     a match on NOT-failed — so we don't clobber existing DLQ metadata.
  //   - If not failed    → full DLQ transition.
  const conditionalSet = {
    status: "failed",
    failedAt: now,
    failureReason: reason,
    failureCategory: category,
    errorMessage,
    lastAttemptAt: now,
    retryCount: event.attempts ?? 0,
    maxRetries: event.maxAttempts ?? 5,
    lastError: errorMessage,
    "dlq.enteredAt": now,
    "dlq.isQuarantined": category === "POISON_EVENT"
  };
  if (errorStack) conditionalSet.errorStack = errorStack;
  const res = await Outbox.updateOne({
    _id: event._id,
    status: {
      $ne: "failed"
    }
  }, {
    $set: conditionalSet,
    $setOnInsert: {}
  });
  const firstEntry = res.modifiedCount > 0;

  // Audit only on the initial DLQ transition
  if (firstEntry) {
    await _writeAudit({
      action: "EVENT_DLQ_ENTERED",
      eventId: event._id,
      organizationId: event.organizationId,
      actorId,
      actorType,
      details: {
        failureCategory: category,
        failureReason: reason,
        eventType: event.eventType,
        retryCount: event.attempts ?? 0,
        dbLabel: dbLabel || null
      }
    });
    logger.warn({
      event: "DLQ_ENTERED",
      db: dbLabel,
      eventId: String(event._id),
      eventType: event.eventType,
      failureCategory: category,
      failureReason: reason,
      retryCount: event.attempts ?? 0
    }, "[DLQ] Event moved to Dead Letter Queue");
  }
  return {
    firstEntry
  };
}

// ─── finalizeReplayResult ────────────────────────────────────────────────────

/**
 * Called by the worker AFTER a replayed event has been processed (success or
 * failure). Updates the last "pending" replayHistory entry in place.
 *
 * Safe to call even if no replay is in progress — it only touches the doc
 * when the last history entry has result === "pending".
 */
async function finalizeReplayResult({
  conn,
  event,
  result
}) {
  if (!["success", "failed"].includes(result)) {
    throw new Error(`finalizeReplayResult: invalid result "${result}"`);
  }
  const history = event?.dlq?.replayHistory;
  if (!Array.isArray(history) || history.length === 0) return;
  const lastIdx = history.length - 1;
  if (history[lastIdx]?.result !== "pending") return;
  const Outbox = getModel(conn, EventOutboxDef);
  await Outbox.updateOne({
    _id: event._id,
    [`dlq.replayHistory.${lastIdx}.result`]: "pending"
  }, {
    $set: {
      [`dlq.replayHistory.${lastIdx}.result`]: result
    }
  });
  await _writeAudit({
    action: result === "success" ? "EVENT_REPLAY_SUCCESS" : "EVENT_REPLAY_FAILED",
    eventId: event._id,
    organizationId: event.organizationId,
    actorId: history[lastIdx].actorId,
    actorType: "system",
    details: {
      eventType: event.eventType,
      replayIndex: lastIdx
    }
  });
}

// ─── DB Iteration Helper ─────────────────────────────────────────────────────

/**
 * Yields { conn, dbLabel, orgId } for platform + (optionally) every tenant DB.
 * Caller is responsible for dbManager.releaseConnection(orgId) — this helper
 * acquires tenant connections and reports the orgId back so the caller can
 * release cleanly.
 *
 * Because the helper uses async iteration, cleanup is deterministic even on
 * early break (use with `for await ... of`).
 */
async function* iterateAllDbs({
  includeTenants = true
} = {}) {
  // Platform
  yield {
    conn: platformConnection.get(),
    dbLabel: "platform",
    orgId: null
  };
  if (!includeTenants) return;
  const orgs = await Organization.find({}, {
    _id: 1
  }).lean();
  for (const org of orgs) {
    const orgId = String(org._id);
    let conn = null;
    try {
      conn = await dbManager.getConnection(orgId);
      yield {
        conn,
        dbLabel: `org:${orgId}`,
        orgId
      };
    } catch (err) {
      logger.error({
        event: "DLQ_TENANT_CONN_FAILED",
        orgId,
        err: err.message
      }, "[DLQ] Tenant connection failed — skipping");
    } finally {
      if (conn) {
        try {
          dbManager.releaseConnection(orgId);
        } catch (_) {/* ignore */}
      }
    }
  }
}

// ─── listFailedEvents ────────────────────────────────────────────────────────

/**
 * Aggregate failed events across platform + tenant DBs.
 *
 * @param {Object}  filter
 * @param {string}  [filter.eventType]
 * @param {string}  [filter.orgId]           — restrict to one tenant (or "platform")
 * @param {string}  [filter.failureCategory]
 * @param {number}  [filter.limit=50]
 */
async function listFailedEvents(filter = {}) {
  const limit = Math.min(parseInt(filter.limit, 10) || 50, 500);
  const query = {
    status: "failed"
  };
  if (filter.eventType) query.eventType = filter.eventType;
  if (filter.failureCategory) {
    if (!FAILURE_CATEGORIES.includes(filter.failureCategory)) {
      const e = new Error(`invalid failureCategory: ${filter.failureCategory}`);
      e.status = 400;
      throw e;
    }
    query.failureCategory = filter.failureCategory;
  }
  const results = [];
  let remaining = limit;

  // Scope: "platform" | specific org id | undefined=all
  const scopeOnlyPlatform = filter.orgId === "platform";
  const scopeSpecificOrg = filter.orgId && filter.orgId !== "platform";
  for await (const {
    conn,
    dbLabel,
    orgId
  } of iterateAllDbs({
    includeTenants: !scopeOnlyPlatform
  })) {
    if (scopeSpecificOrg && orgId !== filter.orgId) continue;
    if (remaining <= 0) break;
    const Outbox = getModel(conn, EventOutboxDef);
    const docs = await Outbox.find(query).sort({
      failedAt: -1,
      createdAt: -1
    }).limit(remaining).lean();
    for (const d of docs) {
      results.push({
        _id: String(d._id),
        dbLabel,
        orgId: orgId || "platform",
        eventType: d.eventType,
        aggregateType: d.aggregateType,
        aggregateId: String(d.aggregateId),
        failureCategory: d.failureCategory,
        failureReason: d.failureReason,
        errorMessage: d.errorMessage,
        retryCount: d.retryCount ?? d.attempts ?? 0,
        maxRetries: d.maxRetries ?? d.maxAttempts ?? 5,
        failedAt: d.failedAt,
        lastAttemptAt: d.lastAttemptAt,
        createdAt: d.createdAt,
        dlq: d.dlq || null
        // NOTE: errorStack, payload intentionally omitted from list DTO
      });
      remaining--;
      if (remaining <= 0) break;
    }
  }
  return {
    total: results.length,
    events: results
  };
}

// ─── getSummary ──────────────────────────────────────────────────────────────

async function getSummary() {
  const byCategory = {};
  const byEventType = {};
  const byScope = {};
  let totalFailed = 0;
  for await (const {
    conn,
    dbLabel
  } of iterateAllDbs({
    includeTenants: true
  })) {
    const Outbox = getModel(conn, EventOutboxDef);
    const rows = await Outbox.aggregate([{
      $match: {
        status: "failed"
      }
    }, {
      $group: {
        _id: {
          category: "$failureCategory",
          eventType: "$eventType"
        },
        count: {
          $sum: 1
        }
      }
    }]);
    for (const row of rows) {
      const cat = row._id.category || "UNKNOWN";
      const et = row._id.eventType || "unknown";
      byCategory[cat] = (byCategory[cat] || 0) + row.count;
      byEventType[et] = (byEventType[et] || 0) + row.count;
      byScope[dbLabel] = (byScope[dbLabel] || 0) + row.count;
      totalFailed += row.count;
    }
  }
  return {
    totalFailed,
    byCategory,
    byEventType,
    byScope
  };
}

// ─── replayFailedEvent ───────────────────────────────────────────────────────

/**
 * Manually replay one failed event.
 *
 * Behavior (strict per spec):
 *   status       = "pending"
 *   attempts     = 0      (live counter reset — outbox.worker reads this)
 *   retryCount   = 0      (snapshot reset)
 *   nextRetryAt  = now
 *   dlq.replayCount += 1
 *   dlq.lastReplayedAt = now
 *   dlq.replayHistory.push({ replayedAt, actorId, mode: "manual", result: "pending" })
 *
 * NEVER clears: failedAt, failureCategory, failureReason, errorMessage,
 * dlq.enteredAt, dlq.replayHistory — full history is preserved.
 *
 * @param {Object} params
 * @param {string} params.eventId
 * @param {string} params.actorId    — req.platformUser._id
 * @param {string} [params.scope]    — "platform" | "org:<id>" | undefined=search all
 */
async function replayFailedEvent({
  eventId,
  actorId,
  scope
}) {
  if (!eventId) {
    const e = new Error("eventId is required");
    e.status = 400;
    throw e;
  }
  if (!actorId) {
    const e = new Error("actorId is required");
    e.status = 400;
    throw e;
  }
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    const e = new Error("invalid eventId");
    e.status = 400;
    throw e;
  }
  const now = new Date();
  const objectId = new mongoose.Types.ObjectId(eventId);

  // Locate the event — platform first, then tenants (unless scope restricts)
  const scopeOnlyPlatform = scope === "platform";
  const scopeSpecificOrg = scope && scope.startsWith("org:");
  const targetOrgId = scopeSpecificOrg ? scope.slice(4) : null;
  for await (const {
    conn,
    dbLabel,
    orgId
  } of iterateAllDbs({
    includeTenants: !scopeOnlyPlatform
  })) {
    if (scopeSpecificOrg && orgId !== targetOrgId) continue;
    const Outbox = getModel(conn, EventOutboxDef);
    const existing = await Outbox.findOne({
      _id: objectId
    }).lean();
    if (!existing) continue;
    if (existing.status !== "failed") {
      const e = new Error(`cannot replay event in status "${existing.status}" — must be "failed"`);
      e.status = 409;
      throw e;
    }

    // Atomic, conditional replay transition
    const replayEntry = {
      replayedAt: now,
      actorId: String(actorId),
      mode: "manual",
      result: "pending"
    };
    const res = await Outbox.updateOne({
      _id: objectId,
      status: "failed"
    }, {
      $set: {
        status: "pending",
        attempts: 0,
        retryCount: 0,
        nextRetryAt: now,
        lastError: null,
        "dlq.lastReplayedAt": now
      },
      $inc: {
        "dlq.replayCount": 1
      },
      $push: {
        "dlq.replayHistory": replayEntry
      }
    });
    if (res.modifiedCount === 0) {
      // Someone else replayed concurrently
      const e = new Error("event is no longer in failed state");
      e.status = 409;
      throw e;
    }
    await _writeAudit({
      action: "EVENT_REPLAYED",
      eventId: objectId,
      organizationId: existing.organizationId,
      actorId,
      actorType: "platform_user",
      details: {
        eventType: existing.eventType,
        previousFailureCategory: existing.failureCategory,
        previousFailureReason: existing.failureReason,
        dbLabel,
        replayCount: (existing.dlq?.replayCount || 0) + 1
      }
    });
    logger.info({
      event: "DLQ_REPLAY",
      db: dbLabel,
      eventId: String(objectId),
      eventType: existing.eventType,
      actorId
    }, "[DLQ] Event replayed");
    return {
      replayed: true,
      eventId: String(objectId),
      dbLabel,
      orgId: orgId || "platform",
      replayCount: (existing.dlq?.replayCount || 0) + 1
    };
  }
  const e = new Error(`event ${eventId} not found in any DLQ`);
  e.status = 404;
  throw e;
}

// ─── getQueueHealth ──────────────────────────────────────────────────────────

const STUCK_PROCESSING_THRESHOLD_MS = parseInt(process.env.OUTBOX_PROCESSING_TIMEOUT_MS || String(5 * 60 * 1000), 10);

/**
 * Queue health snapshot across platform + all tenant DBs.
 *
 * Returns aggregate counts by status, plus a dedicated stuckProcessing
 * count (events with status="processing" and lastAttemptAt older than
 * OUTBOX_PROCESSING_TIMEOUT_MS).
 *
 * @returns {Promise<{
 *   pending: number,
 *   processing: number,
 *   processed: number,
 *   failed: number,
 *   stuckProcessing: number,
 *   byDb: Record<string, { pending, processing, processed, failed, stuckProcessing }>
 * }>}
 */
async function getQueueHealth() {
  const totals = {
    pending: 0,
    processing: 0,
    processed: 0,
    failed: 0,
    stuckProcessing: 0
  };
  const byDb = {};
  const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_THRESHOLD_MS);
  for await (const {
    conn,
    dbLabel
  } of iterateAllDbs({
    includeTenants: true
  })) {
    const Outbox = getModel(conn, EventOutboxDef);
    const [statusRows, stuckCount] = await Promise.all([Outbox.aggregate([{
      $group: {
        _id: "$status",
        count: {
          $sum: 1
        }
      }
    }]), Outbox.countDocuments({
      status: "processing",
      $or: [{
        lastAttemptAt: {
          $lt: stuckCutoff
        }
      }, {
        lastAttemptAt: {
          $exists: false
        },
        updatedAt: {
          $lt: stuckCutoff
        }
      }]
    })]);
    const dbStats = {
      pending: 0,
      processing: 0,
      processed: 0,
      failed: 0,
      stuckProcessing: stuckCount
    };
    for (const row of statusRows) {
      const key = row._id;
      if (key in dbStats) dbStats[key] = row.count;
    }
    dbStats.stuckProcessing = stuckCount;
    byDb[dbLabel] = dbStats;
    totals.pending += dbStats.pending;
    totals.processing += dbStats.processing;
    totals.processed += dbStats.processed;
    totals.failed += dbStats.failed;
    totals.stuckProcessing += stuckCount;
  }

  // UI contract: expose `stuck` as alias for stuckProcessing
  return {
    ...totals,
    stuck: totals.stuckProcessing,
    byDb
  };
}
module.exports = {
  // Core transitions
  markAsDLQ,
  finalizeReplayResult,
  // Inspection
  listFailedEvents,
  getSummary,
  getQueueHealth,
  // Control
  replayFailedEvent,
  // Helpers
  categorizeError,
  FAILURE_CATEGORIES
};