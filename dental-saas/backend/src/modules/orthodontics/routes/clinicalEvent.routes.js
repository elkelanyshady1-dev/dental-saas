/**
 * clinicalEvent.routes.js — Unified Clinical Event Engine V1
 *
 * Mounted at: /api/v1/org/events (via featureRegistry "clinicalEvents" entry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * ENDPOINTS:
 *   GET /events/case/:caseId   — Timeline for a case
 *   GET /events/recent        — Recent events (dashboard)
 *   GET /events/critical      — Critical events (alerts)
 */

"use strict";

const express = require("express");
const router = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");
const { autoAudit }       = require("@middleware/auditInterceptor");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");

const clinicalEventController = require("../controllers/clinicalEvent.controller");

// ── Guard chain (matches all other orthodontic routes) ────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("ClinicalEvent"));

router.get("/case/:caseId", fieldFilterMiddleware("clinicalEvent"), clinicalEventController.getCaseEvents);
router.get("/recent", fieldFilterMiddleware("clinicalEvent"), clinicalEventController.getRecentEvents);
router.get("/critical", fieldFilterMiddleware("clinicalEvent"), clinicalEventController.getCriticalEvents);

module.exports = router;
