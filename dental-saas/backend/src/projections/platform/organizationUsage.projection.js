/**
 * Organization Usage Projection
 * Phase 9: Organization Usage API for Platform Dashboard.
 * 
 * Logic for cross-domain read-only aggregated usage metrics.
 */

"use strict";

const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("../../shared/models/User");
const BranchDef = require("../../shared/models/Branch");
const CommunicationUsageDef = require("../../shared/models/CommunicationUsage");
const StorageUsageDef = require("../../shared/models/StorageUsage");
const { buildEffectivePlan } = require("../../core/subscription/effectivePlanBuilder");
const { getCurrentBillingCycle } = require("../../core/subscription/communicationQuota.service");
const Money = require("../../utils/money");

/**
 * buildOrganizationUsage
 * Aggregates limits and usage metrics for an organization.
 * 
 * @param {string} orgId 
 * @returns {Promise<Object>} Usage DTO
 */
async function buildOrganizationUsage(orgId) {
    // 1. Resolve Effective Plan (Authoritative source for limits)
    const effectivePlan = await buildEffectivePlan(orgId);
    if (!effectivePlan) return null;

    // 2. Resolve Current Billing Cycle
    const { start } = getCurrentBillingCycle();

    // 3. Resolve per-org models
    const orgConn = dbManager.getConnection(String(orgId));
    const User = getModel(orgConn, UserDef);
    const Branch = getModel(orgConn, BranchDef);
    const StorageUsage = getModel(orgConn, StorageUsageDef);
    const CommunicationUsage = getModel(orgConn, CommunicationUsageDef);

    // 4. Gather Content Usage (User, Branches, Storage)
    const [userCount, branchCount, storageDoc] = await Promise.all([
        User.countDocuments({ organizationId: orgId, isActive: true }),
        Branch.countDocuments({ organizationId: orgId, isActive: true }),
        StorageUsage.findOne({ organizationId: orgId }).lean(),
    ]);

    // 5. Fetch Communication Usage for the current cycle
    const commUsage = await CommunicationUsage.findOne({
        organizationId: orgId,
        billingCycleStart: start
    }).lean() || { smsUsed: 0, whatsappUsed: 0, emailUsed: 0, overageChargesAccumulated: 0 };

    // 5. Build Response DTO with explicit calculation logic
    const maxStorageMB = effectivePlan.limits.maxStorageMB || -1; // -1 = unlimited
    const maxStorageBytes = maxStorageMB === -1 ? -1 : maxStorageMB * 1024 * 1024;
    const storageBytesUsed = storageDoc?.totalBytes || 0;

    const limits = {
        maxUsers: effectivePlan.limits.maxUsers,
        maxBranches: effectivePlan.limits.maxBranches,
        smsQuota: effectivePlan.modules.communication?.smsQuota || 0,
        whatsappQuota: effectivePlan.modules.communication?.whatsappQuota || 0,
        emailQuota: effectivePlan.modules.communication?.emailQuota || 0,
        maxStorageMB,
    };

    const usage = {
        users: userCount,
        branches: branchCount,
        smsUsed: commUsage.smsUsed,
        whatsappUsed: commUsage.whatsappUsed,
        emailUsed: commUsage.emailUsed,
        storageBytesUsed,
        storageMBUsed: Math.round((storageBytesUsed / (1024 * 1024)) * 100) / 100,
        storageFilesTotal: storageDoc?.totalFiles || 0,
        storageBreakdown: storageDoc?.breakdown || { photos: 0, stl: 0, audio: 0, documents: 0, other: 0 },
    };

    // Calculate Remaining (Ensuring no -1 (unlimited) issues)
    const calcRemaining = (limit, current) => {
        if (limit === -1) return "unlimited";
        return Math.max(0, limit - current);
    };

    const remaining = {
        users: calcRemaining(limits.maxUsers, userCount),
        branches: calcRemaining(limits.maxBranches, branchCount),
        sms: calcRemaining(limits.smsQuota, usage.smsUsed),
        whatsapp: calcRemaining(limits.whatsappQuota, usage.whatsappUsed),
        email: calcRemaining(limits.emailQuota, usage.emailUsed),
        storageMB: calcRemaining(maxStorageMB, usage.storageMBUsed),
    };

    // Calculate Overage (Usage exceeding quota)
    const calcOverage = (limit, current) => {
        if (limit === -1) return 0;
        return Math.max(0, current - limit);
    };

    const overage = {
        sms: calcOverage(limits.smsQuota, usage.smsUsed),
        whatsapp: calcOverage(limits.whatsappQuota, usage.whatsappUsed),
        email: calcOverage(limits.emailQuota, usage.emailUsed),
        storageMB: calcOverage(maxStorageMB, usage.storageMBUsed),
        charges: new Money(commUsage.overageChargesAccumulated).value()
    };

    return {
        limits,
        usage,
        remaining,
        overage
    };
}

module.exports = {
    buildOrganizationUsage
};

