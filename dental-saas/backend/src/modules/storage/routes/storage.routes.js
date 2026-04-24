/**
 * storage.routes.js
 * Module: storage
 * Layer: HTTP Routes
 *
 * Routes:
 *   GET /quota — Storage quota + usage status for the Settings page
 *
 * MOUNTING:
 *   app.use("/api/org/storage", orgProtect, dbContext, storageRouter)
 *
 * Note: The legacy GET /storage-usage route in orgV1Routes.js is still active.
 * This module's /quota route is the canonical endpoint for the Settings UI.
 *
 * PLANE: Organization
 */

"use strict";

const express = require("express");

const { P }                = require("@rbac/orgPermissions");
const requireOrgPermission = require("@middleware/requireOrgPermission");
const policyMiddleware     = require("@rbac/policyMiddleware");

const ctrl = require("../controllers/storage.controller");

const router = express.Router();

// ─── GET /quota ───────────────────────────────────────────────────────────────
router.get(
    "/quota",
    requireOrgPermission(P.STORAGE_READ),
    ctrl.getQuotaStatus
);

// ─── GET /available-addons ────────────────────────────────────────────────────
router.get(
    "/available-addons",
    requireOrgPermission(P.BILLING_READ),
    ctrl.listAvailableAddOns
);

// ─── POST /addon ──────────────────────────────────────────────────────────────
router.post(
    "/addon",
    requireOrgPermission(P.BILLING_WRITE),
    policyMiddleware(P.BILLING_WRITE),
    ctrl.purchaseAddOn
);

module.exports = router;
