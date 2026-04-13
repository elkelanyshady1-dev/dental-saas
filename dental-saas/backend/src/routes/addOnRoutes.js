/**
 * addOnRoutes.js
 * Phase v6.0 — Add-On Monetization Engine
 * Phase 1 — Authorization Stabilization (roleMiddleware → requireOrgPermission)
 */

"use strict";

const express = require("express");
const router = express.Router();
const addOnController = require("../modules/billingDomain/controllers/addOnPurchase.controller");
const orgProtect = require("../middleware/orgProtect");
const organizationContext = require("../middleware/organizationMiddleware");
const requireOrgPermission = require("../middleware/requireOrgPermission");
const { P } = require("../rbac/orgPermissions");

router.post("/purchase", orgProtect, organizationContext, requireOrgPermission(P.ACCOUNTING_UPDATE), addOnController.purchaseAddOn);
router.delete("/:id", orgProtect, organizationContext, requireOrgPermission(P.ACCOUNTING_DELETE), addOnController.cancelAddOn);

module.exports = router;
