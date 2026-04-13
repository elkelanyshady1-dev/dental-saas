/**
 * eventReplay.controller.js — Phase 5 Event as Source of Truth Controller
 *
 * Exposes derived clinical state (event-first) to the frontend.
 *
 * SECURITY MODEL:
 *   1. authorize(req, "orthodontics.read")  ← RBAC
 *   2. checkCaseOwnership()                 ← Case-level isolation
 *   3. Service call                         ← Business logic
 *
 * Endpoints:
 *   GET /clinical-state/:caseId
 *     → Phase 5: if no snapshot → buildStateFromEvents (replay from zero)
 *     → If snapshot exists → buildClinicalState (snapshot + delta events)
 *     → Query: ?until=ISO8601  enables time-travel (partial replay)
 *     → Query: ?debug=true     includes step-by-step replay trace (dev only)
 *
 *   GET /clinical-state/:caseId/snapshots/:snapshotId
 *     → buildClinicalState from a specific snapshot checkpoint
 *
 *   GET /clinical-state/:caseId/events-since/:snapshotId
 *     → raw events only (lightweight poll)
 *
 *   GET /clinical-state/:caseId/zero
 *     → buildStateFromEvents regardless of snapshots (for testing Phase 5)
 *     → DEV only — blocked in production
 *
 * organizationId ALWAYS from req.context (JWT SSOT).
 */

"use strict";

const mongoose              = require("mongoose");
const { authorize }         = require("../../../utils/authorize");
const { checkCaseOwnership } = require("../utils/ownership.guard");
const eventReplayService    = require("../services/eventReplay.service");
const isDev = process.env.NODE_ENV !== 'production';
const snapshotRepo          = require("../clinical/repositories/clinicalSnapshot.repository");
const logger                = require("@utils/logger");

const isValidId = (id) => mongoose.isValidObjectId(id);

// ─── Shared: resolve caseId param ─────────────────────────────────────────────
function _assertCaseId(req, res) {
  const { caseId } = req.params;
  if (!caseId || !isValidId(caseId)) {
    res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "caseId must be a valid ObjectId" } });
    return null;
  }
  return caseId;
}

// ─── GET /clinical-state/:caseId ──────────────────────────────────────────────
// Phase 5: Builds derived state from events.
// If a snapshot exists, uses it as a performance checkpoint + replays delta events.
// If NO snapshot exists, replays ALL events from zero — system still works.
// Supports ?until=ISO8601 for time-travel, ?debug=true for step trace.

async function buildFromLatest(req, res) {
  try {
    authorize(req, "orthodontics.read");
    const caseId = _assertCaseId(req, res);
    if (!caseId) return;

    await checkCaseOwnership(req, caseId);

    // Parse optional query params
    const until      = req.query.until ? new Date(req.query.until) : null;
    const debug      = isDev && req.query.debug === 'true';
    const debugPerf  = req.query.debugPerformance === 'true';

    if (until && isNaN(until.getTime())) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "'until' must be a valid ISO 8601 timestamp" } });
    }

    // Time-travel: if `until` is specified, skip snapshot lookup and replay from zero
    // to guarantee we don't accidentally include state from a snapshot newer than `until`.
    if (until) {
      const result = await eventReplayService.buildStateFromEvents(req, caseId, { until, debug });
      return res.json({
        success: true,
        data: {
          snapshotId:  null,
          snapshot:    null,
          events:      result.events,
          derivedState: result.derivedState,
          eventCount:  result.eventCount,
          fromZero:    true,
          timeTravelTo: until.toISOString(),
          ...(debug && { steps: result.steps }),
        },
      });
    }

    // Standard path: try snapshot-first for performance
    const snapshots = await snapshotRepo.findByCase(req, caseId, {
      limit:             1,
      includeChartState: true,
    });

    const snapshot = snapshots?.[0] ?? null;

    // Phase 5: null snapshot → zero replay (correctness path)
    const result = await eventReplayService.buildClinicalState(req, caseId, snapshot, { debug });

    logger.info({
      event:      "CLINICAL_STATE_SERVED",
      caseId,
      snapshotId: result.snapshotId ?? null,
      eventCount: result.eventCount,
      fromZero:   result.fromZero,
      orgId:      req.context.organizationId,
    });

    return res.json({
      success: true,
      data: {
        snapshotId:   result.snapshotId ?? null,
        snapshot:     result.snapshot   ?? null,
        events:       result.events,
        derivedState: result.derivedState,
        eventCount:   result.eventCount,
        eventOffset:  result.eventOffset ?? null,
        fromZero:     result.fromZero,
        ...(debug && { steps: result.steps }),
        ...(debugPerf && {
          debugPerformance: {
            replayTimeMs: result.replayTimeMs ?? null,
            eventCount:   result.eventCount,
            usedSnapshot: !result.fromZero,
            cacheHit:     result.cacheHit ?? false,
          },
        }),
      },
    });

  } catch (err) {
    logger.error(`[EventReplay] buildFromLatest error: ${err.message}`);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "REPLAY_ERROR", message: err.message },
    });
  }
}

// ─── GET /clinical-state/:caseId/snapshots/:snapshotId ────────────────────────
// Builds derived state from a specific snapshot + all events after it.

async function buildFromSnapshot(req, res) {
  try {
    authorize(req, "orthodontics.read");
    const caseId     = _assertCaseId(req, res);
    if (!caseId) return;

    const { snapshotId } = req.params;
    if (!snapshotId || !isValidId(snapshotId)) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "snapshotId must be a valid ObjectId" } });
    }

    await checkCaseOwnership(req, caseId);

    const snapshot = await snapshotRepo.findById(req, snapshotId);
    if (!snapshot) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Snapshot not found" } });
    }

    // Security: snapshot must belong to this case
    if (snapshot.caseId?.toString() !== caseId) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Snapshot does not belong to this case" } });
    }

    const result = await eventReplayService.buildClinicalState(req, caseId, snapshot);

    return res.json({
      success: true,
      data: {
        snapshotId:   result.snapshotId,
        snapshot:     result.snapshot,
        events:       result.events,
        derivedState: result.derivedState,
        eventCount:   result.eventCount,
      },
    });

  } catch (err) {
    logger.error(`[EventReplay] buildFromSnapshot error: ${err.message}`);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "REPLAY_ERROR", message: err.message },
    });
  }
}

// ─── GET /clinical-state/:caseId/events-since/:snapshotId ─────────────────────
// Returns only the raw events since a snapshot (lightweight, for UI polling).

async function getEventsSinceSnapshot(req, res) {
  try {
    authorize(req, "orthodontics.read");
    const caseId = _assertCaseId(req, res);
    if (!caseId) return;

    const { snapshotId } = req.params;
    if (!snapshotId || !isValidId(snapshotId)) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "snapshotId must be a valid ObjectId" } });
    }

    await checkCaseOwnership(req, caseId);

    const snapshot = await snapshotRepo.findById(req, snapshotId);
    if (!snapshot) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Snapshot not found" } });
    }

    const checkpointDate = snapshot.snapshotDate ?? snapshot.createdAt;
    const events = await eventReplayService.getEventsAfterSnapshot(req, caseId, checkpointDate);

    return res.json({
      success: true,
      data: {
        snapshotId,
        checkpointDate,
        events,
        eventCount: events.length,
      },
    });

  } catch (err) {
    logger.error(`[EventReplay] getEventsSinceSnapshot error: ${err.message}`);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "EVENTS_FETCH_ERROR", message: err.message },
    });
  }
}

// ─── GET /clinical-state/:caseId/zero ─────────────────────────────────────────
// Phase 5 correctness test: always replay from zero, ignoring any snapshots.
// Blocked in production. Used to verify: "delete all snapshots → state still correct."

async function buildFromZero(req, res) {
  if (!isDev) {
    return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "Zero-replay endpoint is only available in development" } });
  }

  try {
    authorize(req, "orthodontics.read");
    const caseId = _assertCaseId(req, res);
    if (!caseId) return;

    await checkCaseOwnership(req, caseId);

    const debug = req.query.debug === 'true';
    const result = await eventReplayService.buildStateFromEvents(req, caseId, { debug });

    return res.json({
      success: true,
      data: {
        snapshotId:   null,
        snapshot:     null,
        events:       result.events,
        derivedState: result.derivedState,
        eventCount:   result.eventCount,
        fromZero:     true,
        ...(debug && { steps: result.steps }),
      },
    });

  } catch (err) {
    logger.error(`[EventReplay] buildFromZero error: ${err.message}`);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "REPLAY_ERROR", message: err.message },
    });
  }
}

// ─── GET /clinical-state/:caseId/timeline ─────────────────────────────────────
// Phase 5: Full chronological event log with optional server-side filters.
// Query params: ?visitId=<id>  ?type=<type>  ?toothId=<fdiNumber>

async function getCaseTimeline(req, res) {
  try {
    authorize(req, "orthodontics.read");
    const caseId = _assertCaseId(req, res);
    if (!caseId) return;

    await checkCaseOwnership(req, caseId);

    const { visitId, type, toothId } = req.query;

    // visitId filter — validate if present
    if (visitId && !isValidId(visitId)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "visitId must be a valid ObjectId" },
      });
    }

    const events = await eventReplayService.getTimelineEvents(req, caseId, {
      visitId:  visitId  || undefined,
      type:     type     || undefined,
      toothId:  toothId != null ? Number(toothId) : undefined,
    });

    return res.json({
      success: true,
      data: { events, eventCount: events.length },
    });

  } catch (err) {
    logger.error(`[EventReplay] getCaseTimeline error: ${err.message}`);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "TIMELINE_ERROR", message: err.message },
    });
  }
}

// ─── GET /clinical-state/:caseId/events/:eventId/state ───────────────────────
// Phase 5: Time travel — rebuilds chart state as it was at a specific event.

async function getStateAtEvent(req, res) {
  try {
    authorize(req, "orthodontics.read");
    const caseId = _assertCaseId(req, res);
    if (!caseId) return;

    const { eventId } = req.params;
    if (!eventId || !isValidId(eventId)) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "eventId must be a valid ObjectId" },
      });
    }

    await checkCaseOwnership(req, caseId);

    const result = await eventReplayService.getStateAtEvent(req, caseId, eventId);

    return res.json({
      success: true,
      data: {
        targetEvent:  result.targetEvent,
        derivedState: result.derivedState,
        eventCount:   result.eventCount,
        replayedUpTo: result.replayedUpTo,
      },
    });

  } catch (err) {
    if (err.code === "EVENT_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        error: { code: "EVENT_NOT_FOUND", message: err.message },
      });
    }
    logger.error(`[EventReplay] getStateAtEvent error: ${err.message}`);
    return res.status(err.statusCode || 500).json({
      success: false,
      error: { code: "REPLAY_ERROR", message: err.message },
    });
  }
}

module.exports = {
  buildFromLatest,
  buildFromSnapshot,
  getEventsSinceSnapshot,
  buildFromZero,
  getCaseTimeline,
  getStateAtEvent,
};
