/**
 * validatePlanCompatibility.js
 * Phase v5.1 — SaaS Governance
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("../../shared/models/User");
const BranchDef = require("../../shared/models/Branch");
const OrganizationDef = require("../../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const {
  createAuditRecord
} = require("../../services/auditService");

/**
 * validatePlanCompatibility
 * Checks if current organization usage fits within the new plan's limits.
 * If over limit, it marks the organization but DOES NOT block the change.
 * 
 * @param {string} organizationId 
 * @param {Object} newPlan - The proposed plan document
 * @param {string} actorId - The admin performing the change
 * @returns {Promise<Object>} Results of compatibility check
 */
async function validatePlanCompatibility(organizationId, newPlan, actorId) {
  const orgConn = dbManager.getConnection(String(organizationId));
  const User = getModel(orgConn, UserDef);
  const Branch = getModel(orgConn, BranchDef);
  const [userCount, branchCount] = await Promise.all([User.countDocuments({
    organizationId,
    isActive: true
  }), Branch.countDocuments({
    organizationId,
    isActive: true
  })]);
  const isUsersOver = userCount > newPlan.limits.maxUsers;
  const isBranchesOver = branchCount > newPlan.limits.maxBranches;
  const isOverLimit = isUsersOver || isBranchesOver;
  if (isOverLimit) {
    // Log downgrade warning in AuditLog
    await createAuditRecord({
      organizationId,
      branchId: "000000000000000000000000",
      // Platform/System constant
      actorId,
      actorType: "platform_user",
      action: "PLAN_DOWNGRADE_LIMIT_WARNING",
      entity: "organization",
      entityId: organizationId,
      details: {
        message: "Organization usage exceeds new plan limits.",
        newPlanCode: newPlan.code,
        limits: newPlan.limits,
        currentUsage: {
          users: userCount,
          branches: branchCount
        }
      },
      success: true
    });

    // Mark org as overLimit (future creations will be blocked)
    await Organization().findByIdAndUpdate(organizationId, {
      overLimit: true
    });
  } else {
    // Clear overLimit flag if moving to a compatible plan
    await Organization().findByIdAndUpdate(organizationId, {
      overLimit: false
    });
  }
  return {
    isOverLimit,
    userCount,
    branchCount,
    limits: newPlan.limits
  };
}
module.exports = {
  validatePlanCompatibility
};