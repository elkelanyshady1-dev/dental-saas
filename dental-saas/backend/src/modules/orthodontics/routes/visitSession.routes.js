/**
 * visitSession.routes.js — Phase 1: Visit Session Foundation
 *
 * Mounted at: /api/v1/org/visit-sessions (via featureRegistry "visit-session" entry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * Endpoints:
 *   POST   /visit-sessions/:caseId/start   → open a new visit session
 *   PATCH  /visit-sessions/:visitId/end    → close a visit (completed)
 *   DELETE /visit-sessions/:visitId/cancel → abort a visit (cancelled)
 *   GET    /visit-sessions/:caseId/active  → get the current active visit (or null)
 *
 * INVARIANT: Only ONE active visit per case at any time.
 *   Enforced at both service (guard check) and DB (partial unique index) levels.
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");
const { autoAudit }       = require("@middleware/auditInterceptor");

const ctrl      = require("../controllers/visitSession.controller");
const draftCtrl = require("../controllers/visitDraft.controller");

// ── Guard chain ───────────────────────────────────────────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("VisitSession"));

// ── Visit session lifecycle ───────────────────────────────────────────────────

// POST /visit-sessions/:caseId/start
//   Body: { appointmentId?, phaseId?, visitType? }
//   Returns: { visit: VisitRecord }
router.post("/:caseId/start", ctrl.startVisitController);

// PATCH /visit-sessions/:visitId/end
//   Body: { snapshotId?, visitDate? }
//   Returns: { visit: VisitRecord }
router.patch("/:visitId/end", ctrl.endVisitController);

// DELETE /visit-sessions/:visitId/cancel
//   Returns: { visit: VisitRecord }
router.delete("/:visitId/cancel", ctrl.cancelVisitController);

// GET /visit-sessions/:caseId/active
//   Returns: { visit: VisitRecord | null }
router.get("/:caseId/active", ctrl.getActiveVisitController);

// PATCH /visit-sessions/:visitId/notes
//   Body: { notes: string }   — full overwrite, called by frontend debounced autosave
//   Returns: { visit: VisitRecord }
router.patch("/:visitId/notes", ctrl.updateVisitNotesController);

// POST /visit-sessions/:visitId/voice
//   Body: { url: string, duration?: number }
//   Returns: { visit: VisitRecord }
router.post("/:visitId/voice", ctrl.addVoiceNoteController);

// ── Phase 4: Lock & Heartbeat ─────────────────────────────────────────────────

// PATCH /visit-sessions/:visitId/heartbeat
//   Called every 30s by the browser to keep the soft lock alive.
//   Returns 204 No Content (fire-and-forget).
router.patch("/:visitId/heartbeat", ctrl.heartbeatController);

// PATCH /visit-sessions/:visitId/takeover
//   Transfers the soft lock to the requesting user.
//   Intended for admin/supervisor override when a visit is stale-locked.
//   Returns: { visit: VisitRecord }
router.patch("/:visitId/takeover", ctrl.takeoverController);

// ── Phase 6: Auto-Save Draft ──────────────────────────────────────────────────

// POST /visit-sessions/:visitId/draft
//   Body: { chartState, notes }
//   Called every 5s by the browser (fire-and-forget from client).
//   Returns: { draft }
router.post("/:visitId/draft", draftCtrl.saveDraftController);

// GET /visit-sessions/:visitId/draft
//   Returns: { draft } or { draft: null } if no draft exists.
//   Called ONCE on session resume to check for crash recovery.
router.get("/:visitId/draft", draftCtrl.getDraftController);

module.exports = router;
