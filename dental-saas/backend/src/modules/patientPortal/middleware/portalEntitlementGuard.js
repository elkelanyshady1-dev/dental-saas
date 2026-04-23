/**
 * portalEntitlementGuard.js — Patient Portal Entitlement Check
 * ═══════════════════════════════════════════════════════════════
 *
 * Verifies that the organization's plan includes the patient_portal module.
 *
 * Unlike requireEntitlement (org-plane), this guard works in the portal plane
 * where req.capabilities is NOT populated by the org middleware chain.
 * It resolves the org's active contract and checks the plan directly.
 *
 * Resolution:
 *   1. Get organizationId from req.context (JWT) or req.organizationId (header)
 *   2. Find active OrgContract for the organization
 *   3. Load the associated PlanVersion
 *   4. Check modules.patientPortal === true
 *   5. BYPASS_ENTITLEMENTS=true in non-production → skip check
 *
 * PLANE: Patient Portal only.
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");

// Lazy-loaded models to avoid circular dependencies at boot time
let _OrgContract = null;
let _PlanVersion = null;
function _getModels() {
  if (!_OrgContract) {
    const {
      OrgContractDef,
      PlanVersionDef
    } = require("@shared/services/billingContract.facade");
    _OrgContract = OrgContractDef.default;
    _PlanVersion = PlanVersionDef.default;
  }
  return {
    OrgContract: _OrgContract,
    PlanVersion: _PlanVersion
  };
}

/**
 * portalEntitlementGuard
 *
 * Express middleware. Blocks portal access if the org's plan does not
 * include patientPortal: true.
 */
async function portalEntitlementGuard(req, res, next) {
  // Dev/staging bypass (BLOCKED in production)
  if (process.env.BYPASS_ENTITLEMENTS === "true") {
    if (process.env.NODE_ENV === "production") {
      logger.error({
        event: "PORTAL_ENTITLEMENT_BYPASS_BLOCKED"
      }, "[PortalEntitlement] BYPASS_ENTITLEMENTS=true in production — BLOCKED");
      return res.status(500).json({
        success: false,
        error: {
          code: "UNSAFE_CONFIG",
          message: "Entitlement bypass is not allowed in production."
        }
      });
    }
    return next();
  }
  const orgId = req.context?.organizationId || req.organizationId;
  if (!orgId) {
    return res.status(401).json({
      success: false,
      error: {
        code: "ORG_CONTEXT_MISSING",
        message: "Organization context is required."
      }
    });
  }
  try {
    const {
      OrgContract,
      PlanVersion
    } = _getModels();

    // Find the active contract for this organization
    const contract = await OrgContract.findOne({
      status: "active"
    }).select("planVersionId").lean();
    if (!contract) {
      logger.warn({
        orgId,
        event: "PORTAL_NO_ACTIVE_CONTRACT"
      }, "[PortalEntitlement] No active contract — portal access denied");
      return res.status(403).json({
        success: false,
        error: {
          code: "FEATURE_NOT_ENABLED",
          feature: "patient_portal",
          message: "Patient portal is not available. No active subscription found."
        }
      });
    }

    // Check plan version modules
    const planVersion = await PlanVersion.findById(contract.planVersionId).select("modules.patientPortal").lean();
    if (!planVersion || !planVersion.modules?.patientPortal) {
      logger.warn({
        orgId,
        event: "PORTAL_NOT_IN_PLAN"
      }, "[PortalEntitlement] patientPortal not enabled in plan — access denied");
      return res.status(403).json({
        success: false,
        error: {
          code: "FEATURE_NOT_ENABLED",
          feature: "patient_portal",
          message: "Patient portal is not included in your current plan. Please contact your administrator to upgrade."
        }
      });
    }
    return next();
  } catch (err) {
    // Never block on entitlement resolution failure — log and allow
    logger.error({
      err,
      orgId,
      event: "PORTAL_ENTITLEMENT_ERROR"
    }, "[PortalEntitlement] Failed to resolve entitlements — allowing access");
    return next();
  }
}
module.exports = portalEntitlementGuard;