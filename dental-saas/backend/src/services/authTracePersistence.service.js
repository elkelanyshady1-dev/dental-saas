/**
 * authTracePersistence.service.js — Async Auth Trace Persistence
 * v2.0 — Phase 6 cleanup (BullMQ queue removed)
 *
 * Non-blocking persistence layer for AUTH_TRACE events.
 * Writes to MongoDB asynchronously using setImmediate() so that
 * trace storage NEVER delays the HTTP response lifecycle.
 *
 * Features:
 *   - Configurable sampling rate (AUTH_TRACE_SAMPLE_RATE)
 *   - Always-store denials (AUTH_TRACE_DENY_ALWAYS)
 *   - Resource context enrichment
 *   - Post-persist hooks for anomaly detection
 *
 * v1.x routed writes through a BullMQ authTrace.queue worker; the
 * queue + worker were removed in Phase 6. Direct setImmediate() writes
 * were already the v1.x fallback path — now the only path.
 *
 * Environment Variables:
 *   AUTH_TRACE_SAMPLE_RATE   — float 0.0–1.0, default 1.0 (100% storage)
 *   AUTH_TRACE_DENY_ALWAYS   — "true"/"false", default "true"
 *   AUTH_TRACE_ENABLED       — "true"/"false", default "true" (kill switch)
 *
 * PLANE: Org only.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const AuthTraceDef = require("@shared/models/AuthTrace");
const AuthTrace = getPlatformModel(AuthTraceDef);
const logger = require("@utils/logger");

// ─── Configuration ──────────────────────────────────────────────────────────

function _getConfig() {
  return {
    enabled: process.env.AUTH_TRACE_ENABLED !== "false",
    sampleRate: parseFloat(process.env.AUTH_TRACE_SAMPLE_RATE) || 1.0,
    denyAlways: process.env.AUTH_TRACE_DENY_ALWAYS !== "false"
  };
}

// ─── Sampling Decision ──────────────────────────────────────────────────────

/**
 * Determine whether this trace should be persisted.
 *
 * @param {boolean} hasDenial — whether the trace contains a DENY step
 * @returns {boolean}
 */
function shouldPersist(hasDenial) {
  const config = _getConfig();
  if (!config.enabled) return false;

  // Always store denials
  if (hasDenial && config.denyAlways) return true;

  // Sample rate check
  if (config.sampleRate >= 1.0) return true;
  if (config.sampleRate <= 0.0) return false;
  return Math.random() < config.sampleRate;
}

// ─── Post-Persist Hooks ─────────────────────────────────────────────────────
//
// Registered callbacks run async after trace is persisted.
// Used by anomaly detection (TASK-AUTH-INT-003) to inspect stored traces.

const _postPersistHooks = [];

/**
 * Register a callback to run after trace persistence.
 * Callback receives the persisted trace document.
 *
 * @param {Function} fn — async function(traceDoc)
 */
function onTracePersisted(fn) {
  if (typeof fn === "function") {
    _postPersistHooks.push(fn);
  }
}

// ─── Core: Build Trace Document ─────────────────────────────────────────────

/**
 * Build a trace document from the request's authTrace context.
 *
 * @param {import("express").Request} req
 * @returns {Object|null} — trace document or null if no trace data
 */
function buildTraceDocument(req) {
  if (!req.authTrace || !req.authTrace.steps || req.authTrace.steps.length === 0) {
    return null;
  }
  const trace = req.authTrace;
  const steps = trace.steps;

  // Determine denial info
  const denialStep = steps.find(s => s.result === "DENY");
  const hasDenial = !!denialStep;
  const denialLayer = denialStep?.layer || null;

  // Extract organizationId
  const organizationId = req.organizationId || req.user?.organizationId;
  if (!organizationId) return null; // Cannot persist without org context

  return {
    requestId: trace.requestId,
    userId: req.user?._id || null,
    organizationId,
    role: req.user?.roleId?.name || req.user?.role || null,
    method: trace.method || req.method,
    path: trace.path || req.originalUrl,
    statusCode: trace.statusCode || null,
    duration: trace.duration || Date.now() - trace.startTime,
    stepCount: steps.length,
    hasDenial,
    denialLayer,
    // Resource context (TASK-AUTH-INT-002)
    resourceType: trace.resourceType || null,
    resourceId: trace.resourceId || null,
    ownerId: trace.ownerId || null,
    // Steps
    steps: steps.map(s => ({
      layer: s.layer,
      result: s.result,
      permission: s.permission || null,
      resource: s.resource || null,
      reason: s.reason || null,
      details: s.details || null,
      elapsed: s.elapsed || null,
      timestamp: s.timestamp || null
    }))
  };
}

// ─── Core: Async Persist ────────────────────────────────────────────────────

/**
 * Persist an auth trace asynchronously (non-blocking).
 *
 * Call this from the res.on("finish") handler in authTraceMiddleware.
 * Uses setImmediate() to keep the write off the response path.
 *
 * @param {import("express").Request} req
 */
function persistTraceAsync(req) {
  const doc = buildTraceDocument(req);
  if (!doc) return;

  // Sampling decision
  if (!shouldPersist(doc.hasDenial)) return;
  _directPersist(doc);
}

/**
 * Direct MongoDB persistence via setImmediate (non-blocking).
 * @param {Object} doc
 */
function _directPersist(doc) {
  setImmediate(async () => {
    try {
      const savedTrace = await AuthTrace.create(doc);

      // Run post-persist hooks (anomaly detection, etc.)
      for (const hook of _postPersistHooks) {
        try {
          await hook(savedTrace);
        } catch (hookErr) {
          logger.error({
            err: hookErr.message,
            hook: hook.name || "anonymous"
          }, "[AuthTracePersistence] Post-persist hook error");
        }
      }
    } catch (err) {
      // Log but never throw — persistence failures must NEVER crash the process
      logger.error({
        err: err.message,
        requestId: doc.requestId,
        path: doc.path,
        service: "authTracePersistence"
      }, "[AuthTracePersistence] Failed to persist trace");
    }
  });
}

// ─── Query Helpers (for analytics service) ──────────────────────────────────

/**
 * Get traces for an organization within a time range.
 *
 * @param {string} organizationId
 * @param {Object} options — { startDate, endDate, hasDenial, userId, resourceType, page, limit }
 * @returns {{ traces: Array, pagination: Object }}
 */
async function getTraces(organizationId, options = {}) {
  const {
    startDate,
    endDate,
    hasDenial,
    userId,
    resourceType,
    page = 1,
    limit = 50
  } = options;
  const filter = {
    organizationId
  };
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  if (hasDenial !== undefined) filter.hasDenial = hasDenial;
  if (userId) filter.userId = userId;
  if (resourceType) filter.resourceType = resourceType;
  const safeLimit = Math.min(Number(limit) || 50, 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;
  const [traces, total] = await Promise.all([AuthTrace.find(filter).sort({
    createdAt: -1
  }).skip(skip).limit(safeLimit).lean(), AuthTrace.countDocuments(filter)]);
  return {
    traces,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit)
    }
  };
}

/**
 * Get a single trace by requestId and organizationId.
 */
async function getTraceByRequestId(requestId, organizationId) {
  // @rls-platform-service — system-wide auth trace persistence, no org-scoped req
  return AuthTrace.findOne({
    requestId,
    organizationId
  }).lean();
}

/**
 * Delete traces older than the given date (for retention cleanup).
 *
 * @param {Date} olderThan
 * @returns {number} — number of deleted documents
 */
async function deleteTracesOlderThan(olderThan) {
  // @rls-platform-service — system-wide auth trace persistence, no org-scoped req
  const result = await AuthTrace.deleteMany({
    createdAt: {
      $lt: olderThan
    }
  });
  return result.deletedCount || 0;
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  persistTraceAsync,
  buildTraceDocument,
  shouldPersist,
  onTracePersisted,
  getTraces,
  getTraceByRequestId,
  deleteTracesOlderThan
};