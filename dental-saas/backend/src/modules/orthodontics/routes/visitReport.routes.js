/**
 * visitReport.routes.js — Visit Report Routes (READ ONLY)
 *
 * Mounted at: /api/v1/org/visit-reports (via featureRegistry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * Endpoints:
 *   GET  /visit-reports/:visitId         → full read-only visit report
 *   GET  /visit-reports/case/:caseId     → visit timeline (card DTOs)
 *
 * HARD RULES:
 *   ❌ NO POST/PATCH/DELETE — read-only surface
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");
const { autoAudit }       = require("@middleware/auditInterceptor");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const { P }                = require("@rbac/orgPermissions");

const ctrl = require("../controllers/visitReport.controller");

// ── Guard chain ───────────────────────────────────────────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("VisitReport"));

// ── Read-only endpoints ───────────────────────────────────────────────────────

// GET /visit-reports/case/:caseId — visit timeline cards
// MUST come before /:visitId to avoid route collision
router.get("/case/:caseId", requireOrgPermission(P.ORTHO_READ), ctrl.getVisitTimelineController);

// GET /visit-reports/:visitId — full visit report
router.get("/:visitId", requireOrgPermission(P.ORTHO_READ), ctrl.getVisitReportController);

module.exports = router;
