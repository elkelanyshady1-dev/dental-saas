"use strict";

/**
 * castAnalysis.routes.js
 * Domain: clinical-snapshots
 * Layer: Interfaces › Routes
 *
 * Mounted at: /api/v1/cast-analysis (via featureRegistry)
 * Guard stack: orgProtect → organizationContext → requireEntitlement("orthodontics")
 *
 * ROUTES:
 *   POST   /cast-analysis                  → createCastAnalysis
 *   GET    /cast-analysis?patientId=       → getByPatient
 *   GET    /cast-analysis/:id              → getById
 *
 * IMMUTABLE: No PUT/PATCH/DELETE (write-once records).
 */

const express = require("express");
const router  = express.Router();

const orgProtect          = require("@middleware/orgProtect");
const organizationContext = require("@middleware/organizationMiddleware");
const requireEntitlement  = require("@middleware/requireEntitlement");

const {
    createCastAnalysis,
    getByPatient,
    getById,
} = require("../controllers/castAnalysis.controller");

// ── Guard Stack ───────────────────────────────────────────────────────────────

router.use(orgProtect);
router.use(organizationContext);
router.use(requireEntitlement("orthodontics"));

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /cast-analysis
 * Body: { patientId, caseId?, input }
 * Returns: CastAnalysisDTO
 */
router.post("/", createCastAnalysis);

/**
 * GET /cast-analysis?patientId=<id>[&caseId=<id>][&limit=N][&skip=N]
 * Returns: CastAnalysisDTO[]
 */
router.get("/", getByPatient);

/**
 * GET /cast-analysis/:id
 * Returns: CastAnalysisDTO
 */
router.get("/:id", getById);

module.exports = router;
