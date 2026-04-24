/**
 * recallDomain.routes.js — Full Recall Domain Routes
 *
 * Mounted at: /api/v1/org/recalls (via featureRegistry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics")
 *       → requireOrgPermission → policyMiddleware → autoAudit
 *
 * Endpoints:
 *   GET    /recalls            → list (paginated, filtered)
 *   GET    /recalls/stats      → dashboard counters
 *   GET    /recalls/:id        → single recall detail
 *   PATCH  /recalls/:id/status → transition status
 *   DELETE /recalls/:id        → cancel recall
 *   POST   /recalls            → create recall (from visit RecallModal)
 */

"use strict";

const express = require("express");
const router  = express.Router();

const orgProtect              = require("@middleware/orgProtect");
const organizationContext     = require("@middleware/organizationMiddleware");
const requireEntitlement      = require("@middleware/requireEntitlement");
const requireOrgPermission    = require("@middleware/requireOrgPermission");
const policyMiddleware        = require("@rbac/policyMiddleware");
const { P }                   = require("@rbac/orgPermissions");
const { autoAudit }           = require("@middleware/auditInterceptor");

const domainCtrl = require("../controllers/recallDomain.controller");

// Also import the visit-linked recall creator (from orthodontics module)
const visitRecallCtrl = require("../../orthodontics/controllers/recall.controller");

// ── Guard chain (shared across all recall routes) ────────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("Recall"));

// ── Stats (must come before /:id to avoid route collision) ────────────────────
router.get("/stats",
    requireOrgPermission(P.RECALLS_READ),
    policyMiddleware(P.RECALLS_READ),
    domainCtrl.getRecallStatsController,
);

// ── List ──────────────────────────────────────────────────────────────────────
router.get("/",
    requireOrgPermission(P.RECALLS_READ),
    policyMiddleware(P.RECALLS_READ),
    domainCtrl.listRecallsController,
);

// ── Create (from visit RecallModal) ───────────────────────────────────────────
router.post("/",
    requireOrgPermission(P.RECALLS_CREATE),
    policyMiddleware(P.RECALLS_CREATE),
    visitRecallCtrl.createRecallController,
);

// ── Get by visit ──────────────────────────────────────────────────────────────
router.get("/visit/:visitId",
    requireOrgPermission(P.RECALLS_READ),
    policyMiddleware(P.RECALLS_READ),
    visitRecallCtrl.getRecallByVisitController,
);

// ── Single recall detail ─────────────────────────────────────────────────────
router.get("/:id",
    requireOrgPermission(P.RECALLS_READ),
    policyMiddleware(P.RECALLS_READ),
    domainCtrl.getRecallByIdController,
);

// ── Update status ─────────────────────────────────────────────────────────────
router.patch("/:id/status",
    requireOrgPermission(P.RECALLS_UPDATE),
    policyMiddleware(P.RECALLS_UPDATE),
    domainCtrl.updateRecallStatusController,
);

// ── Cancel (soft delete) ──────────────────────────────────────────────────────
router.delete("/:id",
    requireOrgPermission(P.RECALLS_DELETE),
    policyMiddleware(P.RECALLS_DELETE),
    domainCtrl.deleteRecallController,
);

module.exports = router;
