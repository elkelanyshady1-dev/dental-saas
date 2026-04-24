/**
 * Platform Storage Routes
 * Mounted at: /api/platform (via platform/index.js)
 *
 * GET /storage/overview — admin storage dashboard with alert levels
 *
 * Auth: platformProtect + VIEW_ORGANIZATIONS + superAdminOnly
 * Plane: Platform — reads only platform DB. No per-org DB connections.
 */

"use strict";

const express = require("express");
const router  = express.Router();

const platformProtect              = require("../../middleware/platformProtect");
const superAdminOnly               = require("../../middleware/superAdminOnly");
const authorizePlatformPermission  = require("../../middleware/authorizePlatformPermission");
const { PLATFORM_CAPABILITIES: CAP } = require("@contracts/platformContract.cjs.js");

const storageCtrl = require("../../platform/domain/controllers/platformStorage.controller");

router.get(
    "/storage/overview",
    platformProtect,
    authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS),
    superAdminOnly,
    storageCtrl.getStorageOverview
);

router.get(
    "/storage/orgs/:orgId",
    platformProtect,
    authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS),
    superAdminOnly,
    storageCtrl.getOrgStorageDetail
);

module.exports = router;
