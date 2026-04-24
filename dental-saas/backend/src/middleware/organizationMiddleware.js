const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("../shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const logger = require("../utils/logger");
const {
  normalizeRegion
} = require("@shared/utils/regionNormalizer");
const {
  classifySubscriptionState
} = require("./orgSubscriptionGuard");
const organizationContext = async (req, res, next) => {
  try {
    if (!req.user.organizationId) {
      return res.status(403).json({
        message: "User not assigned to organization"
      });
    }
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({
        message: "Organization not found"
      });
    }
    if (!organization.isActive) {
      return res.status(403).json({
        message: "Organization is disabled"
      });
    }

    // BUG-5 FIX: Use SSOT classifySubscriptionState instead of legacy
    // organization.subscription.status field. Aligns with authService.validateLogin
    // which uses the same classifier. Passing null for contract since we only
    // need to check the basic subscription state at this middleware level —
    // full contract-aware entitlement check happens in requireEntitlement.
    const subState = classifySubscriptionState(organization, null);
    if (subState.state === "expired" || subState.state === "unknown") {
      return res.status(403).json({
        success: false,
        message: "Subscription not active",
        error: {
          code: "SUBSCRIPTION_INACTIVE",
          reason: subState.reason
        }
      });
    }

    // Phase 8: authMiddleware sets a trap on req.organization.
    // Override it here for routes that still intentionally use organizationContext.
    Object.defineProperty(req, "organization", {
      value: organization,
      writable: true,
      configurable: true,
      enumerable: true
    });

    // ── Region Context Failsafe (v31.0) ──────────────────────────────
    // authMiddleware normally sets req.regionCode from JWT payload.
    // However, if the JWT was issued before regionCode was mandatory,
    // or the org's regionCode was not yet assigned at login time,
    // req.regionCode may still be null/undefined.
    //
    // The organization document is the authoritative source-of-truth
    // for region. Fill it in as a failsafe so downstream services
    // (audit, billing, ledger) always have a region context.
    if (!req.regionCode && organization.regionCode) {
      req.regionCode = organization.regionCode;
      logger.warn({
        event: "REGION_CONTEXT_FALLBACK",
        state: "CRITICAL_STATE",
        source: "organization_document",
        organizationId: organization._id,
        resolvedRegion: req.regionCode
      }, "Region context missing from JWT — fell back to organization.regionCode");
    }

    // If the org itself has no regionCode (pre-provisioning state),
    // fall back to the org's country-derived region.
    if (!req.regionCode) {
      req.regionCode = normalizeRegion(organization.country) || "MEA";
      logger.warn({
        event: "REGION_CONTEXT_FALLBACK",
        state: "CRITICAL_STATE",
        source: "country_normalization",
        organizationId: organization._id,
        country: organization.country,
        resolvedRegion: req.regionCode
      }, "Region fallback triggered — org has no regionCode, derived from country");
    }
    next();
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};
module.exports = organizationContext;