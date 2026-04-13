/**
 * usage.service.js
 * Phase v5.4 — Communication Domain
 * 
 * Clean interface for cross-domain usage queries.
 *
 * @per-org-transactional — Cross-domain service interface.
 * Called by billing orchestrator (not by HTTP controllers directly).
 * organizationId passed explicitly from caller (JWT-validated upstream).
 * No req context available at this layer.
 */

"use strict";

const CommunicationUsageDef = require("../models/communicationUsage.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");

/**
 * getUsageForCycle
 * Returns usage data for a specific organization and billing cycle.
 * Returns a plain object to prevent model leakage.
 */
async function getUsageForCycle(organizationId, startDate) {
    const conn = await dbManager.getConnection(organizationId);
    const CommunicationUsage = getModel(conn, CommunicationUsageDef);

    const usage = await CommunicationUsage.findOne({
        organizationId,
        billingCycleStart: startDate
    });

    if (!usage) return null;
    return usage.toObject();
}

module.exports = {
    getUsageForCycle
};
