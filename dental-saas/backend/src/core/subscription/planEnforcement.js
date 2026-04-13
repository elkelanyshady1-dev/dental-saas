/**
 * planEnforcement.js
 * Phase v5.0 — Plan Policy Engine
 */

"use strict";

const { buildEffectivePlan } = require("./effectivePlanBuilder");
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("../../shared/models/User");
const BranchDef = require("../../shared/models/Branch");

/**
 * Custom Error Classes for Plan Governance
 */
class PlanLimitExceededError extends Error {
    constructor(limitType, limit, currentCount) {
        super(`Plan Limit Exceeded: ${limitType} limit of ${limit} reached (Current: ${currentCount}).`);
        this.name = "PlanLimitExceededError";
        this.code = "PLAN_LIMIT_EXCEEDED";
        this.statusCode = 403;
    }
}

class ModuleNotAllowedError extends Error {
    constructor(moduleName) {
        super(`Module Not Allowed: The '${moduleName}' module is not included in your current plan.`);
        this.name = "ModuleNotAllowedError";
        this.code = "MODULE_NOT_ALLOWED";
        this.statusCode = 403;
    }
}

class FeatureNotAllowedError extends Error {
    constructor(featureKey) {
        super(`Feature Not Allowed: The '${featureKey}' feature is not included in your current plan.`);
        this.name = "FeatureNotAllowedError";
        this.code = "FEATURE_NOT_ALLOWED";
        this.statusCode = 403;
    }
}

/**
 * assertUserLimit — Uses per-org DB connection to count users
 */
async function assertUserLimit(orgId) {
    const plan = await buildEffectivePlan(orgId);
    const orgConn = dbManager.getConnection(String(orgId));
    const User = getModel(orgConn, UserDef);
    const userCount = await User.countDocuments({ organizationId: orgId, isActive: true });

    if (plan.limits.maxUsers !== -1 && userCount >= plan.limits.maxUsers) {
        throw new PlanLimitExceededError("Users", plan.limits.maxUsers, userCount);
    }
}

/**
 * assertBranchLimit — Uses per-org DB connection to count branches
 */
async function assertBranchLimit(orgId) {
    const plan = await buildEffectivePlan(orgId);
    const orgConn = dbManager.getConnection(String(orgId));
    const Branch = getModel(orgConn, BranchDef);
    const branchCount = await Branch.countDocuments({ organizationId: orgId, isActive: true });

    if (plan.limits.maxBranches !== -1 && branchCount >= plan.limits.maxBranches) {
        throw new PlanLimitExceededError("Branches", plan.limits.maxBranches, branchCount);
    }
}

/**
 * assertModuleAccess
 */
async function assertModuleAccess(orgId, moduleName) {
    const plan = await buildEffectivePlan(orgId);
    const module = plan.modules[moduleName];
    const isEnabled = typeof module === 'boolean' ? module : module?.enabled;

    if (!isEnabled) {
        throw new ModuleNotAllowedError(moduleName);
    }
}

/**
 * assertFeatureAccess
 */
async function assertFeatureAccess(orgId, featureKey) {
    const plan = await buildEffectivePlan(orgId);
    if (!plan.modules[featureKey]) { // Mapping feature packs to modules schema
        throw new FeatureNotAllowedError(featureKey);
    }
}

module.exports = {
    assertUserLimit,
    assertBranchLimit,
    assertModuleAccess,
    assertFeatureAccess,
    PlanLimitExceededError,
    ModuleNotAllowedError,
    FeatureNotAllowedError
};
