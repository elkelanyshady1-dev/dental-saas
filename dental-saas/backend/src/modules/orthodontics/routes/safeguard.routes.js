/**
 * safeguard.routes.js — Clinical State Safeguard Routes (Phase 9)
 *
 * Mounted at: /api/v1/org/safeguard (via featureRegistry "safeguard" entry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * ENDPOINTS:
 *   POST /safeguard/verify-consistency/:caseId   — UI ↔ DB state comparison
 *   GET  /safeguard/validate-state/:caseId       — Server-side invariant check
 *   POST /safeguard/validate-event/:caseId       — Pre-commit event validation
 *   GET  /safeguard/replay-parity/:caseId        — Snapshot ↔ replay parity check
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");
const { autoAudit }       = require("@middleware/auditInterceptor");

const safeguardController = require("../controllers/safeguard.controller");

// ── Guard chain (matches all other orthodontic routes) ────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("Safeguard"));

// ── Consistency verification ────────────────────────────────────────────────
router.post("/verify-consistency/:caseId", safeguardController.verifyConsistency);

// ── State invariant validation ──────────────────────────────────────────────
router.get("/validate-state/:caseId", safeguardController.validateState);

// ── Pre-commit event validation ─────────────────────────────────────────────
router.post("/validate-event/:caseId", safeguardController.validateEvent);

// ── Snapshot ↔ replay parity check ──────────────────────────────────────────
router.get("/replay-parity/:caseId", safeguardController.replayParity);

module.exports = router;
