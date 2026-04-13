/**
 * communicationUsage.subscriber.js
 * Phase v5.4 — Communication Quota Engine
 */

"use strict";

const CommunicationUsageDef = require("../models/communicationUsage.model");
const getModel = require("../../../core/db/getModel");
const dbManager = require("../../../core/db/dbManager");
const { getCurrentBillingCycle } = require("../../../core/subscription/communicationQuota.service");
const { resolvePlan } = require("../../../core/subscription/planResolver");
const { createAuditRecord } = require("../../../services/auditService");

async function handleCommunicationSent(payload) {
    const { organizationId, type, messageId, eventId } = payload;
    const { start, end } = getCurrentBillingCycle();

    // Resolve org connection for background context
    const conn = await dbManager.getConnection(organizationId);
    const CommunicationUsage = getModel(conn, CommunicationUsageDef);

    // v5.4 Rule: Use explicitly managed OAV for usage increments
    // We update/upsert the usage record for the current cycle.

    const plan = await resolvePlan(organizationId);
    const quotaKey = `${type}Quota`; // smsQuota
    const usageKey = `${type}Used`;  // smsUsed
    const overagePrice = plan.modules.communication.overage[`${type}Price`] || 0;
    const quota = plan.modules.communication[quotaKey] || 0;

    // Use findOne and update to handle OAV and overage logic correctly
    let usage = await CommunicationUsage.findOne({
        organizationId,
        billingCycleStart: start
    });

    if (!usage) {
        usage = await CommunicationUsage.create({
            organizationId,
            billingCycleStart: start,
            billingCycleEnd: end,
            currency: plan.pricing.baseCurrency || "USD"
        });
    }

    const isOverage = usage[usageKey] >= quota;
    const finalOveragePrice = isOverage ? overagePrice : 0;

    await CommunicationUsage.updateOne(
        { _id: usage._id, version: usage.version },
        {
            $inc: {
                [usageKey]: 1,
                overageChargesAccumulated: finalOveragePrice,
                version: 1
            }
        }
    );

    if (isOverage && finalOveragePrice > 0) {
        await createAuditRecord({
            organizationId,
            branchId: "000000000000000000000000",
            actorId: organizationId, // System event
            actorType: "system",
            action: "COMMUNICATION_OVERAGE_CHARGED",
            entity: "communicationUsage",
            entityId: usage._id,
            details: { type, amount: finalOveragePrice, messageId },
            success: true
        });
    }
}

module.exports = {
    handleCommunicationSent
};
