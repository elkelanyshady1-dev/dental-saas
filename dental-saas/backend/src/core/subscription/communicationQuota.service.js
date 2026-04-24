// TODO(5e-B-manual): 1 .default import(s) not auto-migrated:
//   - CommunicationUsage (../../modules/communicationDomain/models/communicationUsage.model) — tenant + no req access (worker/utility)
/**
 * communicationQuota.service.js
 * Phase v5.4 — Communication Quota Engine
 */

"use strict";

const {
  buildEffectivePlan
} = require("./effectivePlanBuilder");
const CommunicationUsage = require("../../modules/communicationDomain/models/communicationUsage.model").default;

/**
 * getCurrentBillingCycle
 * Returns the current month's start and end boundaries.
 * v5.4 simplified strategy.
 */
function getCurrentBillingCycle() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return {
    start,
    end
  };
}

/**
 * assertCommunicationQuota
 * Checks if the organization has remaining quota or allowed overage.
 * 
 * @param {string} organizationId 
 * @param {string} type - 'smsUsed', 'whatsappUsed', 'emailUsed'
 * @throws {Error} if quota exceeded and no overage
 */
async function assertCommunicationQuota(organizationId, type) {
  const plan = await buildEffectivePlan(organizationId);
  if (!plan || !plan.modules.communication?.enabled) {
    throw new Error("COMMUNICATION_MODULE_DISABLED");
  }
  const {
    start,
    end
  } = getCurrentBillingCycle();

  // Find or create usage record for this cycle
  let usage = await CommunicationUsage.findOne({
    organizationId,
    billingCycleStart: start
  });
  if (!usage) {
    // We don't create here to avoid empty records on just checks.
    // If no record exists, usage is 0.
    usage = {
      smsUsed: 0,
      whatsappUsed: 0,
      emailUsed: 0
    };
  }
  const quotaKey = type.replace('Used', 'Quota'); // e.g. smsUsed -> smsQuota
  const quota = plan.modules.communication[quotaKey] || 0;
  const currentUsage = usage[type] || 0;
  if (currentUsage >= quota) {
    const overagePrice = plan.modules.communication.overage[`${type.replace('Used', '')}Price`];
    if (!overagePrice || overagePrice <= 0) {
      const err = new Error("COMMUNICATION_QUOTA_EXCEEDED");
      err.code = "QUOTA_EXCEEDED";
      err.quota = quota;
      err.type = type;
      throw err;
    }

    // Overage allowed. 
    // Note: Actual charge increment happens in the subscriber post-send.
    return {
      allowed: true,
      isOverage: true,
      price: overagePrice
    };
  }
  return {
    allowed: true,
    isOverage: false
  };
}
module.exports = {
  getCurrentBillingCycle,
  assertCommunicationQuota
};