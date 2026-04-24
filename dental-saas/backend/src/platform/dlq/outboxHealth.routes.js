/**
 * outboxHealth.routes.js
 * Platform — Outbox Queue Health
 *
 * Exposes:
 *   GET /api/platform/outbox/health
 *
 * Returns a real-time snapshot of the event outbox queue across the
 * platform DB and all tenant DBs:
 *   {
 *     pending:        number,
 *     processing:     number,
 *     processed:      number,
 *     failed:         number,
 *     stuckProcessing: number,    ← processing + older than OUTBOX_PROCESSING_TIMEOUT_MS
 *     byDb: { "<db>": { ... } }
 *   }
 *
 * A non-zero stuckProcessing count indicates events orphaned by a crash.
 * The retry and outbox workers will auto-reclaim them on the next cycle,
 * but this endpoint lets operators detect the condition proactively.
 *
 * Requires: DLQUEUE_MANAGE platform capability.
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

const pDlqManage = [
    platformProtect,
    requirePlatformCapability(PLATFORM_CAPABILITIES.DLQUEUE_MANAGE),
];

router.get("/health", ...pDlqManage, asyncHandler(dlqCtrl.getQueueHealth));

module.exports = router;
