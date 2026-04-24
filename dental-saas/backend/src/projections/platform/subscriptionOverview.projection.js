/**
 * Subscription Overview Projection
 * Phase 8: Subscription Overview API for Platform Panel.
 * 
 * Logic for cross-domain read-only views.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("../../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("../../shared/models/User");
const BranchDef = require("../../shared/models/Branch");
const CommunicationUsageDef = require("../../shared/models/CommunicationUsage");
const {
  buildEffectivePlan
} = require("../../core/subscription/effectivePlanBuilder");
const Money = require("../../utils/money");

/**
 * buildSubscriptionOverview
 * Resolves all necessary data for the subscription overview without mutating state.
 * 
 * @param {string} orgId 
 * @returns {Promise<Object>} Formatted subscription overview DTO
 */
async function buildSubscriptionOverview(orgId) {
  // 1. Resolve Organization (platform DB — correct)
  const organization = await Organization().findById(orgId).lean();
  if (!organization) return null;

  // 2. Compute Effective Plan
  const effectivePlan = await buildEffectivePlan(orgId);

  // 3. Gather Usage Summary (per-org DB)
  const orgConn = dbManager.getConnection(String(orgId));
  const User = getModel(orgConn, UserDef);
  const Branch = getModel(orgConn, BranchDef);
  const CommunicationUsage = getModel(orgConn, CommunicationUsageDef);
  const [userCount, branchCount] = await Promise.all([User.countDocuments({
    organizationId: orgId,
    isActive: true
  }), Branch.countDocuments({
    organizationId: orgId,
    isActive: true
  })]);

  // Find latest communication usage record
  const communicationUsage = await CommunicationUsage.findOne({
    organizationId: orgId
  }).sort({
    billingCycleStart: -1
  }).lean();

  // 4. Construct Response DTO
  return {
    organization: {
      id: organization._id,
      name: organization.name,
      slug: organization.slug
    },
    subscription: {
      planCode: effectivePlan.code,
      status: organization.subscription?.status || "inactive",
      tier: organization.subscription?.tier,
      billingCycle: organization.subscription?.autoRenew ? "monthly" : "prepaid",
      currency: organization.billingCurrency,
      currentPeriodStart: organization.subscription?.currentPeriodStart,
      currentPeriodEnd: organization.subscription?.currentPeriodEnd,
      nextBillingDate: organization.subscription?.currentPeriodEnd || organization.subscription?.trialEndsAt,
      isTrial: organization.trial?.isTrial || false,
      trialEndsAt: organization.trial?.trialEnd
    },
    limits: {
      maxUsers: effectivePlan.limits.maxUsers,
      maxBranches: effectivePlan.limits.maxBranches,
      smsQuota: effectivePlan.modules.communication?.smsQuota || 0,
      whatsappQuota: effectivePlan.modules.communication?.whatsappQuota || 0,
      emailQuota: effectivePlan.modules.communication?.emailQuota || 0
    },
    usage: {
      users: userCount,
      branches: branchCount,
      communication: {
        smsUsed: communicationUsage?.smsUsed || 0,
        whatsappUsed: communicationUsage?.whatsappUsed || 0,
        emailUsed: communicationUsage?.emailUsed || 0,
        overageCharges: communicationUsage ? new Money(communicationUsage.overageChargesAccumulated).value() : 0,
        billingCycleStart: communicationUsage?.billingCycleStart,
        billingCycleEnd: communicationUsage?.billingCycleEnd
      }
    },
    addOns: effectivePlan.activeAddOnCodes || [],
    financials: {
      creditBalance: new Money(organization.subscription?.creditBalance || 0).value()
    }
  };
}
module.exports = {
  buildSubscriptionOverview
};