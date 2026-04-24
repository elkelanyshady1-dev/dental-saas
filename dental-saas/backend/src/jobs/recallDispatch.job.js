/**
 * recallDispatch.job.js
 * Recall Automation — Hourly Dispatch Cron
 *
 * PURPOSE:
 *   Finds pending recalls whose dueDate has passed, dispatches reminder
 *   notifications via CommunicationService, and transitions each recall
 *   to "sent" on success. Runs hourly by default.
 *
 * WITHOUT THIS JOB, processDueRecalls() in recallController is dead code —
 * recalls stay in "pending" forever and patients never get reminded.
 *
 * EXECUTION:
 *   1. Enumerate all active orgs from the platform DB.
 *   2. For each org, acquire a per-org connection via dbManager.
 *   3. Query pending recalls due today/earlier (processDueRecalls).
 *   4. For each recall:
 *        a. Dispatch via communication.dispatcher (email → sms fallback).
 *        b. On success, atomically transition status "pending" → "sent".
 *        c. On failure, leave as "pending" so next tick retries.
 *   5. Release the per-org connection in finally.
 *
 * IDEMPOTENCY:
 *   Primary guard = the status transition. Once a recall is "sent" the
 *   `status: "pending"` predicate stops matching, so re-runs skip it.
 *   The dispatcher's in-memory dedup is a secondary per-process safeguard.
 *
 * RETRIES:
 *   A dispatch failure leaves the recall "pending". The next cron tick
 *   (hourly by default) will retry. No exponential backoff at this layer —
 *   the downstream async.handler has its own retry/DLQ machinery.
 *
 * SCHEDULE:
 *   Default: ":15 every hour" (CRON_RECALL_DISPATCH override).
 *   Disable via JOB_RECALL_DISPATCH=false.
 *
 * LOGGING:
 *   RECALL_DISPATCH_OK     → per-org summary (processed / sent / failed / skipped)
 *   RECALL_DISPATCH_FAILED → per-org unhandled error
 *
 * PLANE: Infrastructure/Jobs
 * READ-WRITE: Reads platform orgs; reads + writes per-org recalls.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const cron = require("node-cron");
const logger = require("../utils/logger");
const OrganizationDef = require("../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const dbManager = require("../core/db/dbManager");
const getModel = require("../core/db/getModel");
const RecallDef = require("../organization/models/Recall");
const {
  processDueRecalls
} = require("../organization/controllers/recallController");
const {
  dispatch
} = require("../infrastructure/communication/communication.dispatcher");
let _job = null;

// ── Dispatch helpers ──────────────────────────────────────────────────────

function _pickChannelAndSubject(patient) {
  if (patient?.email) return {
    channel: "email",
    subject: patient.email
  };
  if (patient?.phone) return {
    channel: "sms",
    subject: patient.phone
  };
  return {
    channel: null,
    subject: null
  };
}
async function _dispatchRecall({
  recall,
  organizationId
}) {
  const patient = recall.patientId || {};
  const branch = recall.branchId || {};
  const {
    channel,
    subject
  } = _pickChannelAndSubject(patient);
  if (!channel) {
    return {
      skipped: true,
      reason: "no-contact"
    };
  }
  const payload = {
    email: patient.email || null,
    phone: patient.phone || null,
    name: patient.name || "Patient",
    clinicName: branch.name || "",
    dueDate: recall.dueDate,
    reason: recall.reason || "follow-up",
    recallId: String(recall._id),
    organizationId: String(organizationId),
    // Subject is used by the dispatcher's idempotency key.
    to: subject
  };
  return dispatch({
    channel,
    type: "RECALL_REMINDER",
    payload
  });
}

// ── Per-org processing ─────────────────────────────────────────────────────

async function _processOrg(organizationId, correlationId) {
  // Acquire & release the per-org connection (dbManager contract).
  // Missing releaseConnection leaks the inUseCount so the connection
  // can never be evicted — mandatory try/finally.
  let conn;
  try {
    conn = dbManager.getConnection(organizationId);
  } catch (err) {
    logger.error({
      event: "RECALL_DISPATCH_FAILED",
      organizationId,
      correlationId,
      err: err.message
    }, "[RecallDispatchJob] DB connection acquisition failed");
    return {
      organizationId,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: true
    };
  }
  try {
    const dueRecalls = await processDueRecalls(organizationId, conn);
    if (!Array.isArray(dueRecalls) || dueRecalls.length === 0) {
      return {
        organizationId,
        processed: 0,
        sent: 0,
        failed: 0,
        skipped: 0
      };
    }
    const Recall = getModel(conn, RecallDef);
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const recall of dueRecalls) {
      try {
        const result = await _dispatchRecall({
          recall,
          organizationId
        });
        if (result?.skipped) {
          skipped++;
          continue;
        }

        // Idempotency guard: only transition if still pending.
        // A concurrent run or admin-initiated status change is respected.
        await Recall.updateOne({
          _id: recall._id,
          status: "pending"
        }, {
          $set: {
            status: "sent"
          }
        });
        sent++;
      } catch (err) {
        failed++;
        logger.error({
          event: "RECALL_DISPATCH_ITEM_FAILED",
          recallId: String(recall._id),
          organizationId,
          correlationId,
          err: err.message
        }, "[RecallDispatchJob] Recall dispatch failed — will retry next tick");
      }
    }
    logger.info({
      event: "RECALL_DISPATCH_OK",
      organizationId,
      correlationId,
      processed: dueRecalls.length,
      sent,
      failed,
      skipped
    }, "[RecallDispatchJob] Org processed");
    return {
      organizationId,
      processed: dueRecalls.length,
      sent,
      failed,
      skipped
    };
  } finally {
    dbManager.releaseConnection(organizationId);
  }
}

// ── Core run ───────────────────────────────────────────────────────────────

async function runRecallDispatch() {
  const correlationId = `recall-dispatch-${Date.now()}`;
  logger.info({
    job: "recallDispatch",
    correlationId,
    startedAt: new Date().toISOString()
  }, "[RecallDispatchJob] Starting");
  let activeOrgs;
  try {
    activeOrgs = await Organization().find({
      isActive: true
    }).select("_id").lean();
  } catch (err) {
    logger.error({
      event: "RECALL_DISPATCH_FAILED",
      correlationId,
      err: err.message
    }, "[RecallDispatchJob] Failed to enumerate active organizations");
    throw err;
  }
  const summary = {
    totalOrgs: activeOrgs.length,
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errorOrgs: 0
  };
  for (const org of activeOrgs) {
    const orgId = String(org._id);
    try {
      const result = await _processOrg(orgId, correlationId);
      if (result.error) {
        summary.errorOrgs++;
        continue;
      }
      summary.processed += result.processed;
      summary.sent += result.sent;
      summary.failed += result.failed;
      summary.skipped += result.skipped;
    } catch (err) {
      summary.errorOrgs++;
      logger.error({
        event: "RECALL_DISPATCH_FAILED",
        organizationId: orgId,
        correlationId,
        err: err.message
      }, "[RecallDispatchJob] Unhandled org error");
    }
  }
  logger.info({
    event: "RECALL_DISPATCH_COMPLETE",
    correlationId,
    ...summary
  }, "[RecallDispatchJob] Completed");
  return summary;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

function start(schedule = "15 * * * *") {
  if (_job) {
    _job.stop();
    logger.info("[RecallDispatchJob] Existing job stopped before restart");
  }
  _job = cron.schedule(schedule, async () => {
    try {
      await runRecallDispatch();
    } catch (_) {
      // Already logged — swallow so the scheduler keeps running.
    }
  }, {
    scheduled: true,
    timezone: process.env.CRON_TIMEZONE || "UTC"
  });
  logger.info({
    schedule
  }, "[RecallDispatchJob] Registered");
}
function stop() {
  if (_job) {
    _job.stop();
    _job = null;
    logger.info("[RecallDispatchJob] Stopped");
  }
}
async function runNow() {
  logger.info("[RecallDispatchJob] Manual trigger via runNow()");
  return runRecallDispatch();
}
module.exports = {
  start,
  stop,
  runNow,
  runRecallDispatch
};