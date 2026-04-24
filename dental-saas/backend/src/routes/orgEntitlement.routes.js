/**
 * orgEntitlement.routes.js
 * Sprint 2 — Tenant Entitlement Engine (Org-Plane Self-Serve)
 *
 * Route:
 *   GET /api/v1/org/entitlements
 *
 * Guard: orgProtect (org-plane auth — NOT platformProtect).
 * This is strictly org-plane. Platform-admin endpoints live in
 * billing.routes.js under /api/platform/org-entitlements/:orgId.
 *
 * PLANE: Org (org-plane only — intentionally NOT wired to platformProtect)
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const express = require("express");
const router = express.Router();
const OrgContractDef = require("../platform/billing/models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const PlanVersionDef = require("../platform/billing/models/PlanVersion.model");
let _PlanVersion_cache = null;
function PlanVersion() {
    return _PlanVersion_cache || (_PlanVersion_cache = getPlatformModel(PlanVersionDef));
}
const {
  resolveOrganizationEntitlements
} = require("../platform/billing/services/entitlementResolver.service");
const logger = require("../utils/logger");

/**
 * GET /api/v1/org/entitlements
 *
 * Returns the resolved entitlement object for the authenticated org.
 * Merges plan defaults + any platform-admin overrides.
 *
 * Powers: useOrgEntitlements() frontend hook.
 */
router.get("/", async (req, res) => {
  try {
    // Phase 8: req.organization is deprecated — use req.context
    const orgId = req.context?.organizationId;
    if (!orgId) {
      return res.status(401).json({
        success: false,
        error: "Organization context missing"
      });
    }
    const OrganizationDef = require("../shared/models/Organization");
    const Organization = getPlatformModel(OrganizationDef);
    const org = await Organization.findById(orgId).select("currentContractId").lean();
    if (!org) {
      return res.status(404).json({
        success: false,
        error: "Organization not found"
      });
    }

    // Load plan version from active contract
    let planVersion = null;
    if (org.currentContractId) {
      const contract = await OrgContract().findById(org.currentContractId).lean();
      if (contract?.planVersionId) {
        planVersion = await PlanVersion().findById(contract.planVersionId).lean();
      }
    }
    if (!planVersion) {
      // No active contract — return empty entitlement
      return res.status(200).json({
        success: true,
        data: {
          modules: {},
          limits: {},
          addons: [],
          capabilities: {}
        },
        _notice: "No active contract — entitlements unavailable"
      });
    }
    const entitlements = await resolveOrganizationEntitlements(orgId, planVersion);
    return res.status(200).json({
      success: true,
      data: entitlements
    });
  } catch (err) {
    logger.error({
      err
    }, "[OrgEntitlementRoute] GET /entitlements error");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
});
module.exports = router;