/**
 * bonding.routes.js — Bonding Engine Routes
 *
 * Mounted at: /api/v1/bonding (via featureRegistry "bonding" entry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * Endpoints:
 *   POST   /          → applyBonding (bulk upsert — BONDED / REBONDED)
 *   GET    /          → listBondings for a case
 *   POST   /:id/debond      → debond a tooth
 *   POST   /:id/reposition  → reposition a bracket
 *   GET    /analytics        → debond rate for a case
 *   GET    /settings         → get org settings
 *   PUT    /settings         → update org settings
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

const ctrl = require("../controllers/bonding.controller");

// ── Guard chain (same as TADs — shares orthodontics entitlement) ────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("Bonding"));

// ─── Analytics & Settings (must be before /:id routes) ───────────────────────

// GET    /bonding/analytics?caseId=...   → debond rate
router.get("/analytics", fieldFilterMiddleware("bonding"), ctrl.getDebondRate);

// GET    /bonding/settings               → get org brand/slot config
router.get("/settings", fieldFilterMiddleware("bonding"), ctrl.getSettings);

// PUT    /bonding/settings               → update org settings
router.put("/settings", ctrl.updateSettings);

// ─── Core Bonding Operations ─────────────────────────────────────────────────

// POST   /bonding  → apply bonding (Phase 2: requireActiveVisit gate)
router.post("/", requireActiveVisit, ctrl.applyBonding);

// GET    /bonding?caseId= → list all bondings for a case (READ — no visit required)
router.get("/", fieldFilterMiddleware("bonding"), ctrl.listBondings);

// ─── Per-Record Mutations ────────────────────────────────────────────────────

// POST   /bonding/:id/debond     → mark tooth as debonded (Phase 2: requireActiveVisit)
router.post("/:id/debond", requireActiveVisit, ctrl.debondTooth);

// POST   /bonding/:id/reposition → reposition bracket (Phase 2: requireActiveVisit)
router.post("/:id/reposition", requireActiveVisit, ctrl.repositionBracket);

module.exports = router;
