/**
 * shared/services/orgContractReader.js
 *
 * Cross-plane-safe accessor for OrgContract data within the Organization plane.
 *
 * ARCHITECTURE RULE:
 *   Organization plane code must NOT import from src/platform/*.
 *   This shared accessor provides org controllers with read-only access to
 *   OrgContract fields via src/shared — the permitted bridge layer.
 *
 * Sprint 5 — introduced to resolve ORG_IMPORTS_PLATFORM violation in
 *   settingsController.js after contractResolver.service.js was moved to strict mode.
 *
 * PLANE: SHARED (safe for import by both platform and organization controllers)
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrgContractDef = require("../../platform/billing/models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
/**
 * loadActiveContractForOrg
 *
 * Returns the active OrgContract for an organization, or null if none exists.
 * Returns only the fields safe and needed by org-plane UI.
 *
 * @param {string|ObjectId} organizationId
 * @returns {Promise<{planCode, contractStatus, currency, effectiveTo, trialEndDate, autoRenew}|null>}
 */
async function loadActiveContractForOrg(organizationId) {
  if (!organizationId) return null;
  try {
    const contract = await OrgContract.findOne({
      organizationId,
      contractStatus: "active"
    }).select("planCode contractStatus currency effectiveTo trialEndDate autoRenew gracePeriodDays").sort({
      createdAt: -1
    }).lean();
    return contract || null;
  } catch (err) {
    // Non-throwing — org UI degrades gracefully if contract unresolvable
    return null;
  }
}
module.exports = {
  loadActiveContractForOrg
};