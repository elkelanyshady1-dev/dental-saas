/**
 * sla.job.js
 * v13.0 Geopolitical Sovereignty — Regional SLA Monitoring
 */
"use strict";

const mongoose = require("mongoose");
// v31.1 — Region list from in-memory registry (no DB query)
const { getActiveRegionCodes } = require("@infra/regions/regionRegistry");
const { getRegionContext } = require("@infra/regionRouter");
const { ticketSchema } = require("@shared/models/Ticket");
const { auditLogSchema } = require("@shared/models/AuditLog");
const { domainEventOutboxSchema } = require("@shared/models/DomainEventOutbox");
const { metrics } = require("@infra/metrics/metrics");
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");

/**
 * scanSlaBreaches
 * Iterates through all active regions to enforce SLA compliance independently.
 */
exports.scanSlaBreaches = async () => {
    const correlationId = `job-sla-${Date.now()}`;
    logger.info({ service: "sla_job", correlationId }, "Starting Global SLA breach scan...");

    try {
        // v31.1 — O(1) registry lookup replaces Region.find({ status: "ACTIVE" })
        const activeRegionCodes = getActiveRegionCodes();

        for (const regionCode of activeRegionCodes) {
            try {
                await processRegionSla(regionCode, correlationId);
            } catch (regionErr) {
                logger.error({ regionCode, err: regionErr.message }, "SLA processing failed for region");
            }
        }
    } catch (err) {
        logger.error({ err }, "Failed to fetch active regions for SLA job");
    }

    logger.info({ service: "sla_job", correlationId }, "Global SLA breach scan completed.");
};

/**
 * processRegionSla
 * Performs atomic escalation within a specific regional data plane.
 */
async function processRegionSla(regionCode, correlationId) {
    const { mongooseConnection } = await getRegionContext(regionCode);
    const RegionalTicket = mongooseConnection.model("Ticket", ticketSchema);
    const RegionalOutbox = mongooseConnection.model("DomainEventOutbox", domainEventOutboxSchema);

    const now = new Date();

    // 1. Find candidates in this region
    const candidates = await RegionalTicket.find({
        regionCode,
        status: { $nin: ["RESOLVED", "CLOSED", "REJECTED"] },
        slaDeadline: { $lt: now },
        breachFlag: false
    });

    if (candidates.length === 0) return;

    for (const ticket of candidates) {
        // 2. Atomic Filter + Update
        const updated = await RegionalTicket.findOneAndUpdate(
            {
                _id: ticket._id,
                regionCode,
                breachFlag: false
            },
            {
                $set: { breachFlag: true, status: "ESCALATED" },
                $inc: { escalationLevel: 1 }
            },
            { new: true }
        );

        if (!updated) continue;

        // 3. Regional Transactional Audit & Outbox
        const session = await mongooseConnection.startSession();
        try {
            await session.withTransaction(async (sess) => {
                await auditService.createAuditRecord({
                    regionCode,
                    organizationId: updated.organizationId,
                    branchId: "000000000000000000000000",
                    actorId: "000000000000000000000000",
                    actorType: "system",
                    action: "SLA_BREACH_ESCALATED",
                    entity: "TICKET",
                    entityId: updated._id,
                    details: {
                        priority: updated.priority,
                        level: updated.escalationLevel,
                        deadline: updated.slaDeadline,
                        correlationId
                    },
                    success: true
                }, sess);

                await RegionalOutbox.create([{
                    regionCode,
                    aggregateType: "Ticket",
                    aggregateId: updated._id,
                    eventType: "TICKET_SLA_BREACHED",
                    payload: {
                        organizationId: updated.organizationId,
                        escalationLevel: updated.escalationLevel,
                        category: updated.category
                    },
                    correlationId,
                    status: "PENDING"
                }], { session: sess });
            });

            metrics.ticketSlaBreachTotal.inc({ regionCode });
            metrics.ticketEscalationTotal.inc({ regionCode });
            logger.warn({ ticketId: updated._id, regionCode, level: updated.escalationLevel }, "SLA breach escalated in region");

        } catch (error) {
            logger.error({ error: { message: error.message }, ticketId: updated._id, regionCode }, "Failed regional escalation audit");
        } finally {
            session.endSession();
        }
    }
}
