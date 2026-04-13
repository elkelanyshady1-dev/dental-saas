/**
 * clinicalEvent.service.js — Unified Clinical Event Engine V1
 *
 * ROLE: Audit trail service (non-blocking writes)
 *
 * INVARIANTS:
 *   - logEvent() is NON-BLOCKING (fire-and-forget)
 *   - logEventSync() is BLOCKING (use inside transactions)
 *   - Payload size limited to 10KB
 *   - Per-org DB isolation enforced
 */

"use strict";

const crypto              = require("crypto");
const ClinicalEventDef    = require("../models/ClinicalEvent.model");
const CaseSequenceDef     = require("../models/CaseSequence.model");
const VisitRecordDef      = require("../models/VisitRecord.model");
const getModel            = require("../../../core/db/getModel");
const enforceDbIsolation  = require("../../../core/db/dbIsolation.guard");
const logger              = require("@utils/logger");

const MAX_PAYLOAD_SIZE      = 10 * 1024;
const CURRENT_EVENT_VERSION = 1; // bump when event schema has breaking changes

// ─── P0-2: Event types that REQUIRE a stable entity _id in the payload ────────
const ENTITY_ID_REQUIRED_TYPES = new Set([
  "ELASTIC_APPLIED",
  "POWERCHAIN_APPLIED",
  "ACCESSORY_APPLIED",
  "ACCESSORY_ADDED",
  "LIGATURE_ADDED",
  "IPR_ADDED",
  "SPACE_MARKER_ADDED",
  "TAD_INSERTED",
  "BONDING_APPLIED",
]);

/**
 * validateClinicalEvent — P0-2: Contract enforcement at write time.
 *
 * Called BEFORE any DB insert (both logEvent and logEventSync).
 * Ensures all mutation events carry the fields the reducer demands.
 *
 * Throws a typed error on contract violation — NEVER swallowed silently.
 */
function validateClinicalEvent(event) {
  if (!event.eventId) {
    throw Object.assign(
      new Error("EVENT_ID_REQUIRED: eventId must be set before persist"),
      { code: "EVENT_ID_REQUIRED", statusCode: 400 }
    );
  }
  if (!event.type) {
    throw Object.assign(
      new Error("EVENT_TYPE_REQUIRED: event.type must be a non-empty string"),
      { code: "EVENT_TYPE_REQUIRED", statusCode: 400 }
    );
  }
  if (!event.payload || typeof event.payload !== "object") {
    throw Object.assign(
      new Error("EVENT_PAYLOAD_REQUIRED: event.payload must be a non-null object"),
      { code: "EVENT_PAYLOAD_REQUIRED", statusCode: 400 }
    );
  }
  // Enforce stable entity ID for all mutation events
  if (ENTITY_ID_REQUIRED_TYPES.has(event.type) && !event.payload._id) {
    throw Object.assign(
      new Error(`MISSING_ENTITY_ID for ${event.type}: payload._id is required`),
      { code: "MISSING_ENTITY_ID", eventType: event.type, statusCode: 400 }
    );
  }
}

// ─── Phase 5.2: getNextSequence — atomic per-case monotonic counter ───────────
//
// Uses findOneAndUpdate($inc) on CaseSequence collection.
// Guaranteed no duplicate sequence numbers under ANY concurrent write rate.
// Transaction-safe: pass the MongoDB session from logEventSync() for atomicity.

async function getNextSequence(req, caseId, session) {
  const CaseSequence = getModel(req.dbConnection, CaseSequenceDef);
  const result = await CaseSequence.findOneAndUpdate(
    { caseId, organizationId: req.context.organizationId },
    { $inc: { currentSequence: 1 } },
    { new: true, upsert: true, session },
  );
  return result.currentSequence;
}

function _getModel(req) {
  enforceDbIsolation(req);
  return getModel(req.dbConnection, ClinicalEventDef);
}

/**
 * logEvent — DEPRECATED and FORBIDDEN for new code.
 *
 * @deprecated F-02 — This function is HARD BLOCKED in dev/staging.
 *                    In production, it logs a CRITICAL warning and falls through.
 *                    ALL callers MUST migrate to logEventSync() inside a MongoDB transaction.
 *
 * This function was a NON-BLOCKING audit log write. It remains exported only for
 * backward-compat with legacy callers that have not yet been migrated, but is
 * now actively rejected to enforce migration.
 *
 * ⚠️ DO NOT add new callers.
 * ✅ ALL new clinical mutations MUST use: await logEventSync(req, event, { session })
 *
 * @returns {Promise<Object|null>} — Throws in dev/staging; logs warning in production
 */
async function logEvent(req, event) {
  // F-02: logEvent is DEPRECATED and FORBIDDEN for new code.
  // All callers MUST use logEventSync() inside a MongoDB transaction.
  // This function will be fully removed in the next release.
  const msg = "[DEPRECATED] logEvent() called — use logEventSync() with a transaction instead. " +
              `Event type: ${event?.type}, caseId: ${event?.caseId}`;

  if (process.env.NODE_ENV !== "production") {
    throw new Error(msg);
  }

  // Production: log CRITICAL warning but allow the write (graceful degradation)
  logger.error({ event: "DEPRECATED_LOG_EVENT_CALLED", type: event?.type, caseId: event?.caseId },
    "[ClinicalEvent] CRITICAL: logEvent() is deprecated — migrate to logEventSync()");

  // Fall through to original implementation for production safety...
  const ClinicalEvent = _getModel(req);

  // ── Phase 2: Hard guard — visitId REQUIRED ────────────────────────────────
  if (!event.visitId) {
    logger.error({
      event:  "CLINICAL_EVENT_VISIT_ID_MISSING",
      type:   event.type,
      caseId: event.caseId,
      orgId:  req.context.organizationId,
    }, "[ClinicalEvent] REJECTED: visitId is required for all clinical events (Phase 2)");
    // Non-blocking — return null instead of throwing (caller is fire-and-forget)
    return null;
  }

  // ── P0-2: Event contract validation ──────────────────────────────────────
  // Assign a deterministic eventId BEFORE validation so the check passes.
  if (!event.eventId) event = { ...event, eventId: require("crypto").randomUUID() };
  try {
    validateClinicalEvent(event);
  } catch (validationErr) {
    logger.error({
      event:     "CLINICAL_EVENT_CONTRACT_VIOLATION",
      type:      event.type,
      caseId:    event.caseId,
      error:     validationErr.message,
      code:      validationErr.code,
      orgId:     req.context.organizationId,
    }, "[ClinicalEvent] REJECTED: contract violation — " + validationErr.message);
    return null; // fire-and-forget path — log and discard rather than crash
  }

  const payloadSize = JSON.stringify(event.payload).length;
  if (payloadSize > MAX_PAYLOAD_SIZE) {
    logger.warn({
      event:      "CLINICAL_EVENT_PAYLOAD_TOO_LARGE",
      type:       event.type,
      caseId:     event.caseId,
      payloadSize,
      maxAllowed: MAX_PAYLOAD_SIZE,
      orgId:      req.context.organizationId,
    });
    return null;
  }

  // Phase 5.2: idempotency key + ATOMIC monotonic sequence
  const eventId  = event.eventId ?? crypto.randomUUID();
  const sequence = await getNextSequence(req, event.caseId, undefined);

  try {
    const doc = await ClinicalEvent.create({
      organizationId: req.context.organizationId,
      caseId:         event.caseId,
      visitId:        event.visitId,          // 🔴 Phase 2: required
      doctorId:       event.doctorId ?? req.context.userId,  // 🔴 Phase 6: required
      snapshotId:     event.snapshotId ?? null,
      patientId:      event.patientId  ?? null,
      type:           event.type,
      severity:       event.severity   ?? 'info',
      payload:        event.payload,
      metadata:       event.metadata   ?? {},
      createdBy:      req.context.userId,
      // Phase 5.2 hardening fields
      version:        CURRENT_EVENT_VERSION,
      eventId,
      sequence,
    });

    logger.info({
      event:    "CLINICAL_EVENT_LOGGED",
      type:     event.type,
      severity: event.severity ?? 'info',
      caseId:   event.caseId,
      visitId:  String(event.visitId),
      eventId,
      sequence,
      orgId:    req.context.organizationId,
    });

    // ── Phase 6: Auto-compaction trigger ───────────────────────────────────
    // Every 100 events, create a compaction snapshot to cap future replay cost.
    // Fire-and-forget: NEVER await — must not block the event write response.
    if (sequence && sequence % 100 === 0) {
      const { autoCompactIfNeeded } = require('./eventReplay.service');
      autoCompactIfNeeded(req, event.caseId, sequence).catch(() => {});
    }

    return doc;
  } catch (err) {
    // E11000: duplicate eventId — caller provided a pre-existing eventId (idempotent retry)
    if (err.code === 11000 && err.message?.includes('eventId')) {
      logger.info({
        event:   "CLINICAL_EVENT_IDEMPOTENT_SKIP",
        type:    event.type,
        eventId,
        orgId:   req.context.organizationId,
      }, "[ClinicalEvent] Duplicate eventId — event already logged (idempotent skip)");
      return null;
    }

    logger.error({
      event:  "CLINICAL_EVENT_LOG_FAILED",
      type:   event.type,
      caseId: event.caseId,
      error:  err.message,
      orgId:  req.context.organizationId,
    });
    return null;
  }
}

/**
 * logEventSync — BLOCKING variant for critical events.
 * Use when event MUST succeed (e.g., inside MongoDB transaction).
 *
 * Phase 2: visitId is REQUIRED. Throws VISIT_ID_REQUIRED_FOR_EVENT if missing.
 *
 * @param {Object} options.session — MongoDB session for atomic writes
 * @returns {Promise<Object>} — Resolves to doc (throws on error)
 */
async function logEventSync(req, event, { session } = {}) {
  const ClinicalEvent = _getModel(req);

  // ── Phase 2: Hard guard — visitId REQUIRED ────────────────────────────────
  if (!event.visitId) {
    throw Object.assign(
      new Error('visitId is required for all clinical events. Ensure an active visit session exists before logging events.'),
      { code: 'VISIT_ID_REQUIRED_FOR_EVENT', statusCode: 409 }
    );
  }

  // ── P0-2: Event contract validation (throws — this path is transactional) ─
  // Assign eventId before validation if not yet set.
  if (!event.eventId) event = { ...event, eventId: require("crypto").randomUUID() };
  validateClinicalEvent(event);

  // ── Phase 6D: Visit status + case integrity validation ───────────────────
  // For logEventSync (blocking path) we validate the visit is active AND belongs
  // to the same case as the event. This prevents events being logged against a
  // closed visit or a visit from a different case.
  {
    const VisitRecord = getModel(req.dbConnection, VisitRecordDef);
    const visit = await VisitRecord.findOne(
      { _id: event.visitId, organizationId: req.context.organizationId },
      { status: 1, caseId: 1 }
    ).lean();

    if (!visit) {
      throw Object.assign(
        new Error(`Visit ${event.visitId} not found. Cannot log event.`),
        { code: 'INVALID_EVENT_VISIT', statusCode: 409 }
      );
    }
    if (visit.status !== 'active') {
      throw Object.assign(
        new Error(`Visit ${event.visitId} is ${visit.status}. Events can only be logged to active visits.`),
        { code: 'INVALID_EVENT_VISIT', statusCode: 409 }
      );
    }
    if (event.caseId && visit.caseId.toString() !== event.caseId.toString()) {
      throw Object.assign(
        new Error(`Event caseId (${event.caseId}) does not match visit caseId (${visit.caseId}). Possible data integrity violation.`),
        { code: 'EVENT_CASE_MISMATCH', statusCode: 400 }
      );
    }
  }

  const payloadSize = JSON.stringify(event.payload).length;
  if (payloadSize > MAX_PAYLOAD_SIZE) {
    throw Object.assign(
      new Error(`Payload size ${payloadSize} exceeds limit ${MAX_PAYLOAD_SIZE}`),
      { code: 'PAYLOAD_TOO_LARGE' }
    );
  }

  // Phase 5.2: idempotency key + ATOMIC monotonic sequence (session-safe)
  const eventId  = event.eventId ?? crypto.randomUUID();
  // getNextSequence passes the session — increment is atomic within the same transaction
  const sequence = await getNextSequence(req, event.caseId, session);

  const docPayload = {
    organizationId: req.context.organizationId,
    caseId:         event.caseId,
    visitId:        event.visitId,          // 🔴 Phase 2: required
    doctorId:       event.doctorId ?? req.context.userId,  // 🔴 Phase 6: required
    snapshotId:     event.snapshotId ?? null,
    patientId:      event.patientId  ?? null,
    type:           event.type,
    severity:       event.severity   ?? 'info',
    payload:        event.payload,
    metadata:       event.metadata   ?? {},
    createdBy:      req.context.userId,
    // Phase 5.2 hardening fields
    version:        CURRENT_EVENT_VERSION,
    eventId,
    sequence,
  };

  try {
    if (session) {
      const [doc] = await ClinicalEvent.create([docPayload], { session });
      return doc.toObject();
    }
    return ClinicalEvent.create(docPayload);
  } catch (err) {
    // E11000: duplicate eventId inside a transaction — idempotent retry
    if (err.code === 11000 && err.message?.includes('eventId')) {
      const existing = await ClinicalEvent.findOne({ eventId }).lean();
      if (existing) return existing; // return the already-persisted event
    }
    throw err; // re-throw non-idempotency errors
  }
}

/**
 * getEventsByCase — Fetch all events for a case (timeline).
 */
async function getEventsByCase(req, caseId, { limit = 100, type, severity } = {}) {
  const ClinicalEvent = _getModel(req);

  const query = {
    organizationId: req.context.organizationId,
    caseId,
  };

  if (type) query.type = type;
  if (severity) query.severity = severity;

  return ClinicalEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * getEventsBySnapshot — Fetch events for a specific snapshot.
 */
async function getEventsBySnapshot(req, snapshotId) {
  const ClinicalEvent = _getModel(req);

  return ClinicalEvent.find({
    organizationId: req.context.organizationId,
    snapshotId,
  })
    .sort({ createdAt: 1 })
    .lean();
}

/**
 * getRecentEvents — Fetch recent events across all cases (dashboard).
 */
async function getRecentEvents(req, { limit = 50, types, severity } = {}) {
  const ClinicalEvent = _getModel(req);

  const query = {
    organizationId: req.context.organizationId,
  };

  if (types && types.length > 0) {
    query.type = { $in: types };
  }
  if (severity) {
    query.severity = severity;
  }

  return ClinicalEvent.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * getCriticalEvents — Fetch unresolved critical events (for alerts).
 */
async function getCriticalEvents(req, { limit = 20 } = {}) {
  const ClinicalEvent = _getModel(req);

  return ClinicalEvent.find({
    organizationId: req.context.organizationId,
    severity: "critical",
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

// ─── P1-3: getEventsAfterSnapshot removed — use eventReplay.service.js ───────
//
// The implementation previously inline here was a duplicate of the authoritative
// version in eventReplay.service.js. Having two independent implementations
// created a divergence risk: one filtered by `createdAt`, the other by the
// snapshot's `eventOffset` sequence counter (Phase 6 snapshots).
//
// Any caller that imported getEventsAfterSnapshot from this module MUST be
// updated to import from eventReplay.service.js instead:
//
//   ❌  const { getEventsAfterSnapshot } = require("./clinicalEvent.service");
//   ✅  const { getEventsAfterSnapshot } = require("./eventReplay.service");
//
// A temporary re-export is provided below to catch usages that haven't been
// migrated yet — it emits a deprecation warning in non-production environments.
// Remove this re-export once all callers are updated.

/** @deprecated Import from eventReplay.service.js instead. Will be removed. */
function getEventsAfterSnapshot(...args) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[clinicalEvent.service] getEventsAfterSnapshot() is deprecated here. " +
      "Import from eventReplay.service.js instead."
    );
  }
  // Lazy-require to avoid circular dependency at module load time.
  const eventReplayService = require("./eventReplay.service");
  return eventReplayService.getEventsAfterSnapshot(...args);
}

module.exports = {
  /** @deprecated F-02: WILL THROW in dev/staging. Use logEventSync() instead. */
  logEvent,
  logEventSync,
  validateClinicalEvent,
  getNextSequence,
  getEventsByCase,
  getEventsBySnapshot,
  getRecentEvents,
  getCriticalEvents,
  /** @deprecated Use eventReplay.service.js */
  getEventsAfterSnapshot,
};
