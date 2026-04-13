/**
 * clinicalAction.routes.js — Phase 3 Clinical Appliance Routes
 *
 * Mounted at: /api/v1/org/clinical-actions (via featureRegistry "clinicalActions" entry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * All write endpoints require: authorize(req, "orthodontics.full")
 * All read  endpoints require: authorize(req, "orthodontics.read")
 *
 * Endpoints:
 *   GET  /list                    → listActiveByCase (query: caseId, domain?)
 *
 *   POST /archwire/apply          → applyArchwire
 *   POST /archwire/remove/:id     → removeArchwire
 *
 *   POST /elastic/apply           → applyElastic
 *   POST /elastic/remove/:id      → removeElastic
 *
 *   POST /powerchain/apply        → applyPowerchain
 *   POST /powerchain/remove/:id   → removePowerchain
 *
 *   POST /accessory/add           → addAccessory
 *   POST /accessory/remove/:id    → removeAccessory
 *
 *   POST /ligature/add            → addLigature
 *   POST /ligature/remove/:id     → removeLigature
 *
 *   POST /ipr/add                 → addIPR
 *   POST /ipr/remove/:id          → removeIPR
 *
 *   POST /space/add               → addSpaceMarker
 *   POST /space/remove/:id        → removeSpaceMarker
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");
const { autoAudit }       = require("@middleware/auditInterceptor");
const requireActiveVisit  = require("@middleware/requireActiveVisit"); // Phase 2
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");

const ctrl = require("../controllers/clinicalAction.controller");

// ── Guard chain ───────────────────────────────────────────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("ClinicalAction"));

// ── Read ──────────────────────────────────────────────────────────────────────

// GET /clinical-actions/list?caseId=...&domain=... (READ — no visit required)
router.get("/list", fieldFilterMiddleware("clinicalAction"), ctrl.listActiveByCase);

// ── Archwire ──────────────────────────────────────────────────────────────────

router.post("/archwire/apply",        requireActiveVisit, ctrl.applyArchwire);
router.post("/archwire/remove/:id",   requireActiveVisit, ctrl.removeArchwire);

// ── Elastic ───────────────────────────────────────────────────────────────────

router.post("/elastic/apply",         requireActiveVisit, ctrl.applyElastic);
router.post("/elastic/remove/:id",    requireActiveVisit, ctrl.removeElastic);

// ── PowerChain ────────────────────────────────────────────────────────────────

router.post("/powerchain/apply",      requireActiveVisit, ctrl.applyPowerchain);
router.post("/powerchain/remove/:id", requireActiveVisit, ctrl.removePowerchain);

// ── Accessory ────────────────────────────────────────────────────────────────

router.post("/accessory/add",         requireActiveVisit, ctrl.addAccessory);
router.post("/accessory/remove/:id",  requireActiveVisit, ctrl.removeAccessory);

// ── Ligature ─────────────────────────────────────────────────────────────────

router.post("/ligature/add",          requireActiveVisit, ctrl.addLigature);
router.post("/ligature/remove/:id",   requireActiveVisit, ctrl.removeLigature);

// ── IPR ───────────────────────────────────────────────────────────────────────

router.post("/ipr/add",               requireActiveVisit, ctrl.addIPR);
router.post("/ipr/remove/:id",        requireActiveVisit, ctrl.removeIPR);

// ── Space Marker ──────────────────────────────────────────────────────────────

router.post("/space/add",             requireActiveVisit, ctrl.addSpaceMarker);
router.post("/space/remove/:id",      requireActiveVisit, ctrl.removeSpaceMarker);

module.exports = router;
