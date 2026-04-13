/**
 * eventReplay.routes.js — Phase 5 Event as Source of Truth Routes
 *
 * Mounted at: /api/v1/org/clinical-state (via featureRegistry "clinicalState" entry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * Endpoints:
 *   GET /clinical-state/:caseId
 *     → buildFromLatest — Phase 5: zero replay if no snapshot, snapshot+events if exists
 *     → Query: ?until=ISO8601  enables time-travel (replay events <= timestamp)
 *     → Query: ?debug=true     includes step-by-step trace (dev only)
 *
 *   GET /clinical-state/:caseId/snapshots/:snapshotId
 *     → buildFromSnapshot — derived state from a specific snapshot checkpoint
 *
 *   GET /clinical-state/:caseId/events-since/:snapshotId
 *     → getEventsSinceSnapshot — raw events list only (lightweight poll)
 *
 *   GET /clinical-state/:caseId/zero
 *     → buildFromZero — always replay from zero, ignoring snapshots (DEV only)
 *     → Used to verify Phase 5 success criterion: state correct without any snapshots
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");
const { autoAudit }       = require("@middleware/auditInterceptor");

const ctrl = require("../controllers/eventReplay.controller");

// ── Guard chain ───────────────────────────────────────────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("ClinicalState"));

// ── Derived state endpoints ───────────────────────────────────────────────────

// GET /clinical-state/:caseId
//   Returns: latest snapshot + all events after it + derivedState
router.get("/:caseId", ctrl.buildFromLatest);

// GET /clinical-state/:caseId/snapshots/:snapshotId
//   Returns: specific snapshot + all events after it + derivedState
router.get("/:caseId/snapshots/:snapshotId", ctrl.buildFromSnapshot);

// GET /clinical-state/:caseId/events-since/:snapshotId
//   Returns: raw events only (used for lightweight polling / incremental sync)
router.get("/:caseId/events-since/:snapshotId", ctrl.getEventsSinceSnapshot);

// GET /clinical-state/:caseId/zero
//   Phase 5 correctness test: replay from zero regardless of snapshots (DEV only)
//   Verifies: system works with no snapshots at all
router.get("/:caseId/zero", ctrl.buildFromZero);

// GET /clinical-state/:caseId/timeline
//   Phase 5: Full chronological event log for the ClinicalTimelinePanel
//   Query: ?visitId=<id>  ?type=<eventType>  ?toothId=<fdiNumber>
//   Returns: { events: ClinicalEvent[], eventCount: number }
router.get("/:caseId/timeline", ctrl.getCaseTimeline);

// GET /clinical-state/:caseId/events/:eventId/state
//   Phase 5: Time travel — rebuild chart state as it was at a specific event
//   Returns: { targetEvent, derivedState, eventCount, replayedUpTo }
router.get("/:caseId/events/:eventId/state", ctrl.getStateAtEvent);

module.exports = router;
