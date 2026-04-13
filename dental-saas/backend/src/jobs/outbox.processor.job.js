/**
 * outbox.processor.job.js
 * v13.0 Geopolitical Sovereignty — Regional Outbox Processor
 */
"use strict";

// v31.1 — Region list from in-memory registry (no DB query)
const { getActiveRegionCodes } = require("@infra/regions/regionRegistry");
const { getRegionContext } = require("../infrastructure/regionRouter");
const { domainEventOutboxSchema } = require("../shared/models/DomainEventOutbox");
const { metrics } = require("@infra/metrics/metrics");
const logger = require("../utils/logger");

const BATCH_SIZE = 50;
const MAX_RETRIES = 5;
const processorId = `node-${process.pid}-${require("crypto").randomBytes(4).toString("hex")}`;
const RECLAIM_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * processOutbox
 * Iterates through all active regions to process their respective outboxes.
 */
async function processOutbox() {
    try {
        // v31.1 — O(1) registry lookup replaces Region.find({ status: "ACTIVE" })
        const activeRegionCodes = getActiveRegionCodes();

        for (const regionCode of activeRegionCodes) {
            try {
                await processRegionOutbox(regionCode);
            } catch (err) {
                logger.error({ regionCode, err: err.message }, "Outbox processing failed for region");
            }
        }
    } catch (err) {
        logger.error({ err }, "Failed to fetch active regions for Outbox job");
    }
}

/**
 * processRegionOutbox
 * Processes a batch of events for a specific regional data plane.
 */
async function processRegionOutbox(regionCode) {
    const { mongooseConnection } = await getRegionContext(regionCode);
    const RegionalOutbox = mongooseConnection.model("DomainEventOutbox", domainEventOutboxSchema);

    // 1. RECLAIM ORPHANED EVENTS in this region
    const staleThreshold = new Date(Date.now() - RECLAIM_THRESHOLD_MS);
    const reclaimed = await RegionalOutbox.updateMany(
        { regionCode, status: "CLAIMED", claimedAt: { $lt: staleThreshold } },
        { $set: { status: "PENDING" }, $unset: { claimedAt: 1, claimedBy: 1 } }
    );
    if (reclaimed.modifiedCount > 0) {
        metrics.outboxReclaimedTotal?.inc({ aggregateType: "All", regionCode }, reclaimed.modifiedCount);
    }

    // 2. ATOMIC CLAIM & PROCESS BATCH
    for (let i = 0; i < BATCH_SIZE; i++) {
        const event = await RegionalOutbox.findOneAndUpdate(
            { regionCode, status: "PENDING" },
            {
                $set: {
                    status: "CLAIMED",
                    claimedAt: new Date(),
                    claimedBy: processorId
                }
            },
            { sort: { createdAt: 1 }, returnDocument: "after" }
        );

        if (!event) break;

        try {
            metrics.outboxClaimedTotal?.inc({
                aggregateType: event.aggregateType,
                processorId,
                regionCode
            });

            await deliverEvent(event);

            event.status = "PROCESSED";
            event.processedAt = new Date();
            await event.save();

            metrics.outboxProcessedTotal?.inc({
                aggregateType: event.aggregateType,
                eventType: event.eventType,
                regionCode
            });

        } catch (err) {
            event.retryCount += 1;
            if (event.retryCount >= MAX_RETRIES) {
                event.status = "FAILED";
                logger.error({ err, eventId: event._id, regionCode }, "Regional domain event permanently failed");
            } else {
                event.status = "PENDING";
            }
            await event.save();
        }
    }
}

async function deliverEvent(event) {
    // Delivery logic (PubSub/Webhooks) - ensure cross-region isolation if needed
    logger.debug({ event: event.eventType, regionCode: event.regionCode }, "Regional event delivered");
}

module.exports = { processOutbox };
