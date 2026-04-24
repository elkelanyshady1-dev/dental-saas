/**
 * dlq.routes.js
 * Platform — Dead Letter Queue Routes
 *
 * Route matrix (mounted at /api/platform/dlq):
 *
 *   GET  /events               → paginated list of failed events
 *   GET  /summary              → aggregate counts by category / type
 *   POST /replay/:eventId      → replay a single failed event
 *
 * All routes require the DLQUEUE_MANAGE platform capability. Tenant
 * (org plane) users are blocked by platformProtect — there is no
 * org-plane mirror of these endpoints by design.
 *
 * PLANE: Platform
 */

"use strict";

const express = require("express");
const router = express.Router();

const platformProtect = require("../../middleware/platformProtect");
const requirePlatformCapability = require("../../middleware/requirePlatformCapability");
const asyncHandler = require("../../utils/asyncHandler");
const { PLATFORM_CAPABILITIES } = require("@contracts/platformContract.cjs.js");

const dlqCtrl = require("./dlq.controller");

// ─── Guard ───────────────────────────────────────────────────────────────────

const pDlqManage = [
    platformProtect,
    requirePlatformCapability(PLATFORM_CAPABILITIES.DLQUEUE_MANAGE),
];

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get("/events", ...pDlqManage, asyncHandler(dlqCtrl.listEvents));
router.get("/summary", ...pDlqManage, asyncHandler(dlqCtrl.getSummary));
router.post("/replay/:eventId", ...pDlqManage, asyncHandler(dlqCtrl.replayEvent));

module.exports = router;
