/**
 * eventReplay.service.js — Phase 5 Event as Source of Truth
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ROLE: Deterministic state reconstruction from events alone.
 *       Snapshots are optional performance caches — NOT required for correctness.
 *
 * FLOW (Phase 5 — snapshot-optional):
 *   IF snapshot exists:
 *     snapshot.chartState (checkpoint)
 *       → getEventsAfterSnapshot()   (DB fetch — events AFTER snapshot)
 *       → replayEvents()             (pure synchronous reducer)
 *       → derivedState               (current clinical truth)
 *   ELSE:
 *     getInitialClinicalState()      (canonical zero state — 32 healthy FDI teeth)
 *       → getAllEvents()             (DB fetch — ALL events for case, ASC)
 *       → replayEvents()             (pure synchronous reducer from zero)
 *       → derivedState               (current clinical truth, no snapshot needed)
 *
 * TIME-TRAVEL:
 *   Pass `until` timestamp → only replay events <= timestamp.
 *   Enables "what did the chart look like on day X?" queries.
 *
 * DEBUG MODE:
 *   Pass `debug: true` to replayEvents() → returns step-by-step replay trace.
 *
 * INVARIANTS:
 *   - replayEvents()         is PURE — no DB calls, no async, no side-effects
 *   - applyEvent()           is PURE — idempotent per event, deterministic
 *   - getInitialClinicalState() is PURE — always returns same default 32-tooth state
 *   - _validateEvent()       throws on malformed events (schema guard)
 *   - Event order:           ALWAYS chronological (createdAt ASC)
 *   - Phase 5 events:        buildStateFromEvents() — no snapshot required
 *   - Phase 4 events:        buildClinicalState() — snapshot-first, events-second
 *   - Phase 2/3 events:      SET_TOOTH_*, ARCHWIRE_PLACED, ELASTIC_APPLIED, etc.
 *   - Legacy events:         BONDING_APPLIED, TAD_INSERTED, etc. (read-only)
 *   - Unknown events:        SKIPPED with a warning log — never throw
 *
 * ════════════════════════════════════════════════════════════════════════════
 * STATE SHAPE (matches chartReducer.ts ChartState)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * {
 *   upperTeeth:   ToothData[],   // FDI 11–28
 *   lowerTeeth:   ToothData[],   // FDI 31–48
 *   miniscrews:   Miniscrew[],
 *   elastics:     ElasticConnection[],
 *   powerChains:  PowerChainConfig[],
 *   accessories:  Accessory[],
 *   ligatures:    LigatureConfig[],
 *   iprMarkers:   IPRMarker[],
 *   spaceMarkers: SpaceMarker[],
 *   upperArchwire: WireConfig | null,
 *   lowerArchwire: WireConfig | null,
 * }
 *
 * @per-org-compliant — all DB calls enforce req.dbConnection isolation
 */

"use strict";

const ClinicalEventDef    = require("../models/ClinicalEvent.model");
const getModel            = require("../../../core/db/getModel");
const enforceDbIsolation  = require("../../../core/db/dbIsolation.guard");
const logger              = require("@utils/logger");
const { applyClinicalEvent, upgradeEvent } = require("../shared/clinicalReducer");

// ─── Phase 6: In-Memory Replay Cache (LRU-style) ─────────────────────────────
//
// Key: `${caseId}:${snapshotId|'zero'}:${lastEventSequence|'empty'}`
// Value: full buildClinicalState() result object
//
// Invalidation is implicit: new events change the last sequence → new cache key.
// Old entries are evicted by LRU when the cache exceeds CACHE_MAX_SIZE.
// Cache is NOT shared across processes — per-instance only (Node.js single proc is fine).

const _REPLAY_CACHE    = new Map();
const _CACHE_MAX_SIZE  = 100;

function _cacheSet(key, value) {
  if (_REPLAY_CACHE.size >= _CACHE_MAX_SIZE) {
    // Evict oldest (Map preserves insertion order)
    _REPLAY_CACHE.delete(_REPLAY_CACHE.keys().next().value);
  }
  _REPLAY_CACHE.set(key, value);
}

function _makeCacheKey(caseId, checkpointKey, lastSeq) {
  return `${caseId}:${checkpointKey}:${lastSeq ?? 'empty'}`;
}

// ─── FDI tooth type lookup (position digit → tooth type) ─────────────────────
// FDI last digit encodes arch position: 1-2 = incisor, 3 = canine, 4-5 = premolar, 6-8 = molar
const _FDI_TOOTH_TYPES = { 1: 'incisor', 2: 'incisor', 3: 'canine', 4: 'premolar', 5: 'premolar', 6: 'molar', 7: 'molar', 8: 'molar' };

function _toothType(id) {
  return _FDI_TOOTH_TYPES[id % 10] ?? 'molar';
}

// ─── Phase 5: getInitialClinicalState — canonical zero state ─────────────────

/**
 * getInitialClinicalState
 *
 * Returns the canonical empty clinical state with all 32 FDI teeth in their
 * default healthy state. This is the starting point for zero-snapshot replay.
 *
 * PURE — always returns an identical structure. No DB calls.
 *
 * Tooth IDs follow FDI notation:
 *   Upper: 11–18 (UR quadrant), 21–28 (UL quadrant)
 *   Lower: 31–38 (LL quadrant), 41–48 (LR quadrant)
 *
 * Discriminator: toothId < 30 → upper, >= 30 → lower (matches applyEvent logic)
 */
function getInitialClinicalState() {
  const _makeTooth = (id, isUpper) => ({
    id,
    type:          _toothType(id),
    status:        'healthy',
    isUpper,
    clinicalStatus: { diagnosis: null, alignment: null, condition: null },
    clinicalAlerts: [],
  });

  return {
    upperTeeth:    [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28].map(id => _makeTooth(id, true)),
    lowerTeeth:    [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38].map(id => _makeTooth(id, false)),
    miniscrews:    [],
    upperArchwire: null,
    lowerArchwire: null,
    elastics:      [],
    appliances:    [],
    powerChains:   [],
    accessories:   [],
    ligatures:     [],
    iprMarkers:    [],
    spaceMarkers:  [],
  };
}

// ─── Phase 5: _validateEvent — schema guard before apply ──────────────────────

/**
 * _validateEvent
 *
 * Throws a typed error for malformed events before they enter the replay chain.
 * Called inside replayEvents() before each applyEvent() call.
 *
 * Rejects: missing type, missing payload, payload not an object.
 * Does NOT validate payload field semantics — applyEvent guards those with null checks.
 */
function _validateEvent(event) {
  if (!event || typeof event !== 'object') {
    throw Object.assign(new Error('Event must be an object'), { code: 'INVALID_EVENT_SHAPE' });
  }
  if (!event.type || typeof event.type !== 'string') {
    throw Object.assign(new Error('Event.type must be a non-empty string'), { code: 'INVALID_EVENT_TYPE' });
  }
  if (event.payload !== undefined && typeof event.payload !== 'object') {
    throw Object.assign(new Error('Event.payload must be an object or undefined'), { code: 'INVALID_EVENT_PAYLOAD' });
  }
}

// ─── applyEvent — thin wrapper around shared clinicalReducer ─────────────────

/**
 * applyEvent
 *
 * Applies a single ClinicalEvent to a chart state.
 * PURE — no DB calls, no async.
 *
 * Delegates all state logic to the shared clinicalReducer.js.
 * This wrapper adds: event version upgrade + unknown-type logging.
 *
 * @param {Object} state  — current chart state (immutable — returns new object)
 * @param {Object} event  — ClinicalEvent document (from DB, .lean())
 * @returns {Object}      — new chart state
 */
function applyEvent(state, event) {
  // Version migration: normalize event to current schema before applying
  const upgradedEvent = upgradeEvent(event);

  const nextState = applyClinicalEvent(state, upgradedEvent);

  // Log unknown types (applyClinicalEvent returns unchanged state silently)
  // We detect "unknown" by checking if the type appears in the known event set.
  // Rather than maintaining a separate known-types list, we compare state identity:
  // if state reference is unchanged AND the event isn't a known no-op, it was unknown.
  // Simpler: just check the type directly.
  if (nextState === state && !_isKnownNoOp(upgradedEvent.type)) {
    logger.warn({
      event:     "EVENT_REPLAY_UNKNOWN_TYPE",
      eventType: upgradedEvent.type,
      eventId:   upgradedEvent.eventId,
    }, `[EventReplay] Unknown event type '${upgradedEvent.type}' — skipped`);
  }

  return nextState;
}

/**
 * Types that legitimately return unchanged state — not "unknown".
 * Used to suppress false-positive warnings from applyEvent().
 */
const _KNOWN_NO_OP_TYPES = new Set([
  'BONDING_APPLIED', 'BONDING_REBONDED', 'BONDING_REMOVED', 'BRACKET_REPOSITIONED',
  'SEQUENCE_STEP_COMPLETED', 'SEQUENCE_PLAN_CREATED', 'SEQUENCE_PLAN_UPDATED',
  'EXTRACTION_DONE', 'NOTE_ADDED', 'WIRE_PLACED', 'ELASTICS_APPLIED',
]);

function _isKnownNoOp(type) {
  return _KNOWN_NO_OP_TYPES.has(type);
}

// ─── replayEvents — pure batch reducer ────────────────────────────────────────

/**
 * replayEvents
 *
 * Applies a chronological ordered list of ClinicalEvents to a base chart state.
 *
 * PURE — no side effects. Input state is never mutated.
 * Events MUST be sorted ascending by createdAt (oldest first).
 *
 * @param {Object}   baseState         — initial or snapshot chart state (the checkpoint)
 * @param {Object[]} events            — ordered array of ClinicalEvent lean documents
 * @param {Object}   [opts]
 * @param {boolean}  [opts.debug=false] — if true, returns { state, steps } instead of state
 * @returns {Object|{state,steps}}     — derived chart state, or debug envelope
 */
function replayEvents(baseState, events, { debug = false } = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    if (debug) return { state: { ...baseState }, steps: [] };
    return { ...baseState };
  }

  const steps        = debug ? [] : null;
  // Phase 5.1 idempotency: track processed eventIds to skip duplicates
  const seenEventIds = new Set();

  const finalState = events.reduce((state, event) => {
    try {
      // ── Idempotency guard (Phase 5.1) ─────────────────────────────────
      // eventId is a UUID set at creation time. Duplicate eventIds indicate
      // a bug in the event pipeline (double-write, retry without dedup).
      // We skip them to preserve state correctness under replay.
      if (event.eventId) {
        if (seenEventIds.has(event.eventId)) {
          logger.warn({
            event:     "EVENT_REPLAY_DUPLICATE_SKIPPED",
            eventId:   event.eventId,
            eventType: event.type,
            sequence:  event.sequence,
          }, "[EventReplay] Duplicate eventId detected — skipped for idempotency");
          return state;
        }
        seenEventIds.add(event.eventId);
      }

      _validateEvent(event);
      const nextState = applyEvent(state, event);
      if (steps) {
        steps.push({
          event: {
            _id:      event._id,
            eventId:  event.eventId,
            type:     event.type,
            sequence: event.sequence,
            version:  event.version ?? 1,
            createdAt: event.createdAt,
            payload:  event.payload,
          },
          stateAfter: nextState,
        });
      }
      return nextState;
    } catch (err) {
      // Never let a single corrupted event break the entire replay chain
      logger.error({
        event:     "EVENT_REPLAY_APPLY_FAILED",
        eventId:   event.eventId ?? event._id,
        eventType: event.type,
        sequence:  event.sequence,
        error:     err.message,
      }, "[EventReplay] Event application failed — skipped");
      return state;
    }
  }, { ...baseState });

  if (debug) return { state: finalState, steps };
  return finalState;
}

// ─── getEventsAfterSnapshot — DB fetch (after a checkpoint) ──────────────────

/**
 * getEventsAfterSnapshot
 *
 * Fetches all ClinicalEvents for a case that occurred AFTER snapshotDate.
 * Sorted ascending (oldest first) — required for deterministic replay.
 *
 * @param {Object} req          — Express request (per-org DB connection)
 * @param {string} caseId       — OrthodonticCase._id
 * @param {Date}   snapshotDate — the snapshot's createdAt / snapshotDate
 * @returns {Promise<Object[]>} — lean event documents
 */
async function getEventsAfterSnapshot(req, caseId, snapshotDate) {
  enforceDbIsolation(req);
  const ClinicalEvent = getModel(req.dbConnection, ClinicalEventDef);

  return ClinicalEvent.find({
    organizationId: req.context.organizationId,
    caseId,
    createdAt: { $gt: new Date(snapshotDate) },
  })
    // Phase 5.2: sequence is the SOLE sort key — atomic counter guarantees no ties.
    .sort({ sequence: 1 })
    .lean();
}

// ─── Phase 6: getEventsAfterOffset — sequence-based partial fetch ────────────

/**
 * getEventsAfterOffset
 *
 * Phase 6: Fetches ClinicalEvents with sequence > eventOffset.
 * Replaces createdAt-based getEventsAfterSnapshot() for Phase 6 snapshots.
 *
 * Uses the { organizationId, caseId, sequence: 1 } index (replay_sequence) directly.
 * O(k) where k = events since last snapshot — no full table scan.
 *
 * @param {Object} req          — Express request (per-org DB connection)
 * @param {string} caseId       — OrthodonticCase._id
 * @param {number} eventOffset  — snapshot.eventOffset (latest sequence at snapshot time)
 * @returns {Promise<Object[]>} — lean event documents sorted by sequence ASC
 */
async function getEventsAfterOffset(req, caseId, eventOffset) {
  enforceDbIsolation(req);
  const ClinicalEvent = getModel(req.dbConnection, ClinicalEventDef);

  return ClinicalEvent.find({
    organizationId: req.context.organizationId,
    caseId,
    sequence: { $gt: eventOffset },
  })
    .sort({ sequence: 1 })
    .lean();
}

// ─── Phase 5: getAllEventsForCase — full event fetch (no snapshot) ────────────

/**
 * getAllEventsForCase
 *
 * Fetches ALL ClinicalEvents for a case in chronological order.
 * Used by buildStateFromEvents() when no snapshot checkpoint exists.
 *
 * Supports time-travel via the `until` option: events <= until are returned.
 *
 * @param {Object} req         — Express request (per-org DB connection)
 * @param {string} caseId      — OrthodonticCase._id
 * @param {Object} [opts]
 * @param {Date}   [opts.until] — if provided, only return events on or before this timestamp
 * @returns {Promise<Object[]>} — lean event documents sorted ASC
 */
async function getAllEventsForCase(req, caseId, { until } = {}) {
  enforceDbIsolation(req);
  const ClinicalEvent = getModel(req.dbConnection, ClinicalEventDef);

  const query = {
    organizationId: req.context.organizationId,
    caseId,
  };

  if (until) {
    query.createdAt = { $lte: new Date(until) };
  }

  return ClinicalEvent.find(query)
    // Phase 5.2: sequence is the SOLE sort key — atomic counter guarantees no ties.
    .sort({ sequence: 1 })
    .lean();
}

// ─── Phase 5: buildStateFromEvents — zero-snapshot full replay ────────────────

/**
 * buildStateFromEvents
 *
 * Phase 5 primary entry point. Derives full clinical state by replaying ALL
 * events from zero — NO snapshot required.
 *
 * This is the correctness path: the system works even if every snapshot is deleted.
 * Snapshots (used in buildClinicalState) are purely a performance optimization.
 *
 * Time-travel: pass `until` to replay only events up to a given timestamp.
 *
 * @param {Object} req         — Express request (per-org DB connection + context)
 * @param {string} caseId      — OrthodonticCase._id
 * @param {Object} [opts]
 * @param {string|Date} [opts.until] — replay only events <= this timestamp (time-travel)
 * @param {boolean}     [opts.debug] — if true, include step-by-step replay trace
 * @returns {Promise<Object>}  — { derivedState, events, eventCount, fromZero, steps? }
 */
async function buildStateFromEvents(req, caseId, { until, debug = false } = {}) {
  enforceDbIsolation(req);

  const events = await getAllEventsForCase(req, caseId, { until });
  const baseState = getInitialClinicalState();

  const replayResult = replayEvents(baseState, events, { debug });

  const derivedState = debug ? replayResult.state : replayResult;
  const steps        = debug ? replayResult.steps : undefined;

  logger.info({
    event:        "CLINICAL_STATE_BUILT_FROM_ZERO",
    caseId,
    eventCount:   events.length,
    timeTravelTo: until ? new Date(until).toISOString() : null,
    orgId:        req.context.organizationId,
  }, "[EventReplay] Derived clinical state built from zero (no snapshot)");

  return {
    derivedState,
    events,
    eventCount:  events.length,
    fromZero:    true,
    snapshotId:  null,
    snapshot:    null,
    ...(debug && { steps }),
  };
}

// ─── buildClinicalState — snapshot-first orchestrator (Phase 4 + 5) ──────────

/**
 * buildClinicalState
 *
 * Constructs the current derived clinical state.
 *
 * Phase 5 behavior: snapshot is a performance cache, NOT required.
 * If snapshot is null/undefined, delegates to buildStateFromEvents() (zero replay).
 * If snapshot exists, replays only events AFTER the snapshot (faster).
 *
 * @param {Object} req              — Express request (per-org DB connection + context)
 * @param {string} caseId           — OrthodonticCase._id
 * @param {Object|null} snapshot    — Full snapshot document (null → zero replay)
 * @param {Object} [opts]
 * @param {boolean} [opts.debug]    — if true, include step-by-step trace
 * @returns {Promise<Object>}       — { snapshot, events, derivedState, eventCount, eventOffset?, steps? }
 */
async function buildClinicalState(req, caseId, snapshot, { debug = false } = {}) {
  // Phase 5: no snapshot → full replay from zero (system still works)
  if (!snapshot) {
    return buildStateFromEvents(req, caseId, { debug });
  }

  const t0 = Date.now();

  // Phase 6: prefer sequence-based offset (O(k)) over createdAt scan (O(n))
  let events;
  if (snapshot.eventOffset != null) {
    // Fast path: query only events after the stored sequence checkpoint
    events = await getEventsAfterOffset(req, caseId, snapshot.eventOffset);
  } else {
    // Fallback: pre-Phase 6 snapshot without eventOffset — use date-based scan
    const checkpointDate = snapshot.snapshotDate ?? snapshot.createdAt;
    events = await getEventsAfterSnapshot(req, caseId, checkpointDate);
  }

  // ── Phase 6: Cache lookup ─────────────────────────────────────────────────
  const lastSeq  = events.length > 0 ? events[events.length - 1].sequence : null;
  const cacheKey = _makeCacheKey(caseId, snapshot._id?.toString() ?? 'nosnap', lastSeq);

  if (!debug) {
    const cached = _REPLAY_CACHE.get(cacheKey);
    if (cached) {
      return { ...cached, cacheHit: true, replayTimeMs: 0 };
    }
  }

  const baseState    = snapshot.chartState ?? getInitialClinicalState();
  const replayResult = replayEvents(baseState, events, { debug });

  const derivedState = debug ? replayResult.state : replayResult;
  const steps        = debug ? replayResult.steps : undefined;

  const replayTimeMs  = Date.now() - t0;
  const deltaOffset   = events.length; // # of events replayed on top of snapshot

  logger.info({
    event:        "CLINICAL_STATE_BUILT",
    caseId,
    snapshotId:   snapshot._id?.toString(),
    usedOffset:   snapshot.eventOffset != null,
    eventCount:   events.length,
    replayTimeMs,
    orgId:        req.context.organizationId,
  }, "[EventReplay] Derived clinical state built from snapshot + events");

  const result = {
    snapshot,
    events,
    derivedState,
    eventCount:   events.length,
    snapshotId:   snapshot._id?.toString(),
    eventOffset:  deltaOffset,
    fromZero:     false,
    replayTimeMs,
    cacheHit:     false,
    ...(debug && { steps }),
  };

  // Store in cache (skip debug responses — they are too large to cache safely)
  if (!debug) _cacheSet(cacheKey, result);

  return result;
}

// ─── Phase 6: autoCompactIfNeeded — fire-and-forget snapshot compaction ──────

/**
 * autoCompactIfNeeded
 *
 * Creates a lightweight "compaction" checkpoint snapshot when event chains grow long.
 * Called fire-and-forget from clinicalEvent.service.logEvent() when sequence % 100 === 0.
 *
 * FLOW:
 *   1. Build current chart state from all events (full replay)
 *   2. Write a ClinicalSnapshot of type "compaction" with eventOffset = sequence
 *   3. Future buildClinicalState() calls use this as the new checkpoint (O(k) again)
 *
 * INVARIANTS:
 *   - Never throws — all errors are caught and logged as warnings
 *   - Does NOT create VisitRecord or increment visitCounter (compaction type)
 *   - Always awaitable but MUST be called without await (fire-and-forget)
 *
 * @param {Object} req      — Express request (per-org DB connection + context)
 * @param {string} caseId   — OrthodonticCase._id
 * @param {number} sequence — The event sequence number that triggered compaction
 */
async function autoCompactIfNeeded(req, caseId, sequence) {
  try {
    // Lazy require to avoid circular dep: eventReplay ↔ snapshot repo
    const snapshotRepo = require('../clinical/repositories/clinicalSnapshot.repository');

    const result = await buildStateFromEvents(req, caseId);

    await snapshotRepo.create(req, {
      caseId,
      type:           'compaction',
      snapshotDate:    new Date(),
      chartState:      result.derivedState,
      eventOffset:     sequence,    // all events up to and including this sequence are baked in
      procedures:      [],
      notes:           { text: `Auto-compaction at sequence ${sequence}`, tags: ['auto-compaction'], warnings: [] },
      attachments:     [],
      bondingSnapshot: [],
      tadSnapshot:     [],
      version:         1,
      isActiveVersion: false,
    });

    logger.info({
      event:    'AUTO_COMPACTION_SNAPSHOT_CREATED',
      caseId,
      sequence,
      eventCount: result.eventCount,
      orgId:    req.context.organizationId,
    }, '[EventReplay] Auto-compaction snapshot created — replay O(k) restored');
  } catch (err) {
    // Non-fatal: compaction failure does not affect correctness
    logger.warn({
      err,
      event:    'AUTO_COMPACTION_FAILED',
      caseId,
      sequence,
      orgId:    req.context.organizationId,
    }, '[EventReplay] Auto-compaction failed — replay remains correct but may be slow');
  }
}

// ─── Phase 5: getTimelineEvents — filtered event log ─────────────────────────

/**
 * getTimelineEvents
 *
 * Returns all ClinicalEvents for a case in chronological order.
 * Supports optional server-side filtering by visitId, type, and toothId.
 *
 * Used by the ClinicalTimelinePanel to show the full event log.
 *
 * @param {Object} req           — Express request (per-org DB connection + context)
 * @param {string} caseId        — OrthodonticCase._id
 * @param {Object} [filters]
 * @param {string} [filters.visitId]  — filter by visit session ObjectId
 * @param {string} [filters.type]     — filter by event type (e.g. "SET_TOOTH_STATUS")
 * @param {number} [filters.toothId]  — filter by payload.toothId (FDI number)
 * @returns {Promise<Object[]>}   — lean event documents sorted by sequence ASC
 */
async function getTimelineEvents(req, caseId, { visitId, type, toothId } = {}) {
  enforceDbIsolation(req);
  const ClinicalEvent = getModel(req.dbConnection, ClinicalEventDef);

  const query = {
    organizationId: req.context.organizationId,
    caseId,
  };

  if (visitId) query.visitId = visitId;
  if (type)    query.type    = type;
  if (toothId != null) query['payload.toothId'] = Number(toothId);

  return ClinicalEvent.find(query).sort({ sequence: 1 }).lean();
}

// ─── Phase 5: getStateAtEvent — time travel to a specific event ───────────────

/**
 * getStateAtEvent
 *
 * Replays all events up to and including the given eventId (by sequence).
 * Enables "time travel" — reconstructs the chart as it was at a specific event.
 *
 * INVARIANT: replay is deterministic — same eventId always produces same state.
 *
 * @param {Object} req      — Express request (per-org DB connection + context)
 * @param {string} caseId   — OrthodonticCase._id
 * @param {string} eventId  — ClinicalEvent._id (ObjectId)
 * @returns {Promise<Object>} — { targetEvent, derivedState, events, eventCount, replayedUpTo }
 */
async function getStateAtEvent(req, caseId, eventId) {
  enforceDbIsolation(req);
  const ClinicalEvent = getModel(req.dbConnection, ClinicalEventDef);

  // Resolve the target event to get its sequence number
  const targetEvent = await ClinicalEvent.findOne({
    organizationId: req.context.organizationId,
    caseId,
    _id:            eventId,
  }).lean();

  if (!targetEvent) {
    const err = new Error('Event not found');
    err.code       = 'EVENT_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  // Fetch all events up to and including this event's sequence
  const events = await ClinicalEvent.find({
    organizationId: req.context.organizationId,
    caseId,
    sequence: { $lte: targetEvent.sequence },
  })
    .sort({ sequence: 1 })
    .lean();

  const baseState    = getInitialClinicalState();
  const derivedState = replayEvents(baseState, events);

  logger.info({
    event:         'CLINICAL_STATE_AT_EVENT',
    caseId,
    targetEventId: eventId,
    sequence:      targetEvent.sequence,
    eventCount:    events.length,
    orgId:         req.context.organizationId,
  }, '[EventReplay] Time-travel replay to specific event');

  return {
    targetEvent,
    derivedState,
    events,
    eventCount:    events.length,
    replayedUpTo:  targetEvent.sequence,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Pure helpers (exported for testing)
  applyEvent,
  replayEvents,
  getInitialClinicalState,
  // DB fetch helpers
  getEventsAfterSnapshot,
  getEventsAfterOffset,
  getAllEventsForCase,
  // Orchestrators
  buildStateFromEvents,
  buildClinicalState,
  // Phase 5: Timeline & Time Travel
  getTimelineEvents,
  getStateAtEvent,
  // Phase 6
  autoCompactIfNeeded,
};
