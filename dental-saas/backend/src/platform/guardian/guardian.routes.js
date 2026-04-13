/**
 * guardian.routes.js
 * Platform Guardian — Route Definitions
 *
 * Mounts at /api/platform/guardian/*
 * All routes are protected by:
 *   1. platformProtect  — validates platform JWT token
 *   2. superAdminOnly   — restricts to platformRole === "superadmin"
 *
 * Routes:
 *   GET  /guardian/overview    — Health overview
 *   POST /guardian/run-scan    — Integrity scan trigger (persists audit log)
 *   GET  /guardian/export      — JSON report export
 *   GET  /guardian/history     — Last 50 scan audit logs
 *
 * PLANE: Platform. No org-plane imports.
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../middleware/platformProtect");
const superAdminOnly = require("../../middleware/superAdminOnly");

const {
    getGuardianOverview,
    runIntegrityScan,
    exportGuardianReport,
    getGuardianHistory
} = require("./guardian.controller");

// All guardian routes are superadmin-only
const guardianGuard = [platformProtect, superAdminOnly];

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get("/guardian/overview", guardianGuard, getGuardianOverview);
router.post("/guardian/run-scan", guardianGuard, runIntegrityScan);
router.get("/guardian/export", guardianGuard, exportGuardianReport);
router.get("/guardian/history", guardianGuard, getGuardianHistory);

module.exports = router;
