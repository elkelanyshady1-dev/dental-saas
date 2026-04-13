/**
 * sequence.routes.js — Treatment Sequence Engine Routes
 *
 * Mounted at: /api/v1/org/sequence (via featureRegistry "sequence" entry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * Endpoints:
 *   GET    /:caseId   → get sequence plan for a case
 *   POST   /:caseId   → create / upsert sequence plan
 *   DELETE /:caseId   → delete sequence plan for a case
 *   POST   /progress  → update step progress on a snapshot
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement = require("@middleware/requireEntitlement");
const { autoAudit } = require("@middleware/auditInterceptor");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");

const ctrl = require("../controllers/sequence.controller");

// ── Guard chain (same auth chain as bonding + TAD routes) ──────────────────
router.use(
  orgProtect,
  organizationContext,
  requireEntitlement("orthodontics"),
  autoAudit("Sequence")
);

// ─── Fixed paths BEFORE /:caseId ─────────────────────────────────────────────
// IMPORTANT: /progress must be declared before /:caseId to avoid Express
// treating "progress" as a caseId param match.

// POST  /sequence/progress → update sequenceProgress on a snapshot
router.post("/progress", ctrl.updateProgress);

// ─── Per-Case Operations ──────────────────────────────────────────────────────

// GET    /sequence/:caseId → get plan (null if none)
router.get("/:caseId", fieldFilterMiddleware("sequence"), ctrl.getSequence);

// POST   /sequence/:caseId → create / upsert plan
router.post("/:caseId", ctrl.upsertSequence);

// DELETE /sequence/:caseId → delete plan
router.delete("/:caseId", ctrl.deleteSequence);

module.exports = router;
