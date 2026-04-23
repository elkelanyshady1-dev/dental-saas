"use strict";

/**
 * treatmentPlanVersion.routes.js — Orthodontic Treatment Plan Versioning
 *
 * Mounted at: /api/v1/org/plan-versions (via featureRegistry "plan-versions" entry)
 * Guards:     orgProtect → organizationContext → requireEntitlement("orthodontics") → autoAudit
 *
 * URL layout:
 *   GET    /:caseId                         → list versions (ordered by version asc)
 *   GET    /:caseId/active                  → single active version
 *   GET    /:caseId/approved                → single approved version
 *   GET    /:caseId/compare?from=&to=       → diff two versions
 *   GET    /:caseId/version/:versionId      → single version
 *   POST   /:caseId/draft                   → create DRAFT (PRE only)
 *   PUT    /:caseId/version/:versionId      → edit DRAFT (optimistic-locked)
 *   DELETE /:caseId/version/:versionId      → delete DRAFT (PRE only)
 *   POST   /:caseId/version/:versionId/approve → approve DRAFT → APPROVED
 *   POST   /:caseId/revision                → create REVISION (MID only)
 */

const express = require("express");
const router  = express.Router();

const orgProtect         = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");
const { autoAudit }       = require("@middleware/auditInterceptor");
const { fieldFilterMiddleware } = require("@rbac/fieldFilter");

const ctrl = require("../controllers/treatmentPlanVersion.controller");

router.use(
    orgProtect,
    organizationContext,
    requireEntitlement("orthodontics"),
    autoAudit("TreatmentPlanVersion"),
);

// ─── Health (hardening §2.3) ──────────────────────────────────────────────────
// Intentionally declared BEFORE /:caseId so the literal path wins over the
// case-id param matcher. `_indexes` uses a leading underscore to keep it out
// of the ObjectId namespace.

router.get("/_indexes", ctrl.indexHealth);

// ─── Reads ────────────────────────────────────────────────────────────────────

router.get("/:caseId",                     fieldFilterMiddleware("treatmentPlanVersion"), ctrl.list);
router.get("/:caseId/active",              fieldFilterMiddleware("treatmentPlanVersion"), ctrl.getActive);
router.get("/:caseId/approved",            fieldFilterMiddleware("treatmentPlanVersion"), ctrl.getApproved);
router.get("/:caseId/compare",             fieldFilterMiddleware("treatmentPlanVersion"), ctrl.compare);
router.get("/:caseId/version/:versionId",  fieldFilterMiddleware("treatmentPlanVersion"), ctrl.getOne);

// ─── Writes ───────────────────────────────────────────────────────────────────

router.post  ("/:caseId/draft",                            ctrl.createDraft);
router.put   ("/:caseId/version/:versionId",               ctrl.editDraft);
router.delete("/:caseId/version/:versionId",               ctrl.deleteDraft);
router.post  ("/:caseId/version/:versionId/approve",       ctrl.approve);
router.post  ("/:caseId/revision",                         ctrl.createRevision);

module.exports = router;
