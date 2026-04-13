/**
 * tad.routes.js — TADs (Miniscrews) Engine Routes
 *
 * Mounted at: /api/v1/tads
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics")
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement = require("@middleware/requireEntitlement");
const { autoAudit } = require("@middleware/auditInterceptor");
const requireActiveVisit = require("@middleware/requireActiveVisit"); // Phase 2
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");

const ctrl = require("../controllers/tad.controller");

// ── Guard chain (same as orthodontics module) ───────────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("Tad"));

// ─── TAD Lifecycle ────────────────────────────────────────────────────────────

// POST   /tads              → insert new TAD (Phase 2: requireActiveVisit gate)
router.post("/", requireActiveVisit, ctrl.createTad);

// GET    /tads?caseId=...   → list all TADs for a case (READ — no visit required)
router.get("/", fieldFilterMiddleware("tad"), ctrl.listTads);

// GET    /tads/:id          → get single TAD with full event history (READ — no visit required)
router.get("/:id", fieldFilterMiddleware("tad"), ctrl.getTad);

// ─── Lifecycle Mutations ──────────────────────────────────────────────────────

// POST   /tads/:id/mark-removal → flag as needs removal + set alert
router.post("/:id/mark-removal", requireActiveVisit, ctrl.markForRemoval);

// POST   /tads/:id/remove       → confirm physical removal
router.post("/:id/remove", requireActiveVisit, ctrl.removeTad);

// DELETE /tads/bulk?caseId=...  → soft-delete all ACTIVE TADs for a case
router.delete("/bulk", requireActiveVisit, ctrl.removeAllTads);

// POST   /tads/:id/fail         → record clinical failure
router.post("/:id/fail", requireActiveVisit, ctrl.failTad);

// POST   /tads/:id/reinsert     → reactivate previously removed/failed TAD
router.post("/:id/reinsert", requireActiveVisit, ctrl.reinsertTad);

// POST   /tads/:id/undo         → undo last TAD lifecycle event (P0-4)
router.post("/:id/undo", requireActiveVisit, ctrl.undoTad);

// ─── Analytics ────────────────────────────────────────────────────────────────

// GET    /tads/analytics/failure-rate?caseId=... (READ — no visit required)
router.get("/analytics/failure-rate", fieldFilterMiddleware("tad"), ctrl.getFailureRate);

// ─── Settings ─────────────────────────────────────────────────────────────────

// GET    /tads/settings     → get org brand/dimension config
router.get("/settings", fieldFilterMiddleware("tad"), ctrl.getSettings);

// PUT    /tads/settings     → update org brand/dimension config
router.put("/settings", ctrl.updateSettings);

module.exports = router;
