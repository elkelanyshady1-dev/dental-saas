/**
 * recall.routes.js — Recall Routes
 *
 * Mounted at: /api/v1/org/recalls (via featureRegistry)
 * Guards: orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * Endpoints:
 *   POST  /recalls              → create a recall draft
 *   GET   /recalls/visit/:visitId → get recall for a visit
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

const ctrl = require("../controllers/recall.controller");

// ── Guard chain ───────────────────────────────────────────────────────────────
router.use(orgProtect, organizationContext, requireEntitlement("orthodontics"), autoAudit("Recall"));

// POST /recalls — create recall draft
router.post("/", requireOrgPermission(P.ORTHO_FULL), ctrl.createRecallController);

// GET /recalls/visit/:visitId — get recall by visit
router.get("/visit/:visitId", requireOrgPermission(P.ORTHO_READ), ctrl.getRecallByVisitController);

module.exports = router;
