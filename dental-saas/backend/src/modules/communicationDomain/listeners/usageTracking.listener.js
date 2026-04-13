/**
 * usageTracking.listener.js
 * CommunicationDomain — Usage Tracking Listener (Phase 4 — Decoupling)
 *
 * PURPOSE:
 *   Listens for `usage.track.v1` events emitted by billingDomain when
 *   an invoice is created. This decouples billingDomain from any direct
 *   import of communicationDomain.
 *
 * EVENT CONTRACT (usage.track.v1):
 *   {
 *     orgId:    string   — Organization ID
 *     type:     string   — "invoice" | "payment" | ...
 *     entityId: ObjectId — The invoice/payment ID
 *     metadata: {
 *       amount:    number  — Invoice total
 *       patientId: ObjectId
 *     }
 *   }
 *
 * PLANE:  Org only
 * CQRS:   Communication domain — read-side tracking
 *
 * @module communicationDomain/listeners/usageTracking
 */

"use strict";

const logger = require("@utils/logger");
const eventBus = require("@core/eventBus");
const usageService = require("../services/usage.service");

const EVENT = "usage.track.v1";

/**
 * onUsageTrack
 *
 * Receives a usage tracking event from billingDomain and delegates
 * to the usage service. Errors are caught and logged — never rethrown
 * (fire-and-forget from billing perspective).
 *
 * @param {object} payload — event payload per EVENT CONTRACT above
 */
async function onUsageTrack(payload) {
    const { orgId, type, entityId, metadata } = payload;

    if (!orgId || !type) {
        logger.warn({
            event: EVENT,
            payload,
        }, "[communicationDomain:usage] Invalid payload — missing orgId or type. Skipping.");
        return;
    }

    logger.debug({
        event: EVENT,
        orgId,
        type,
        entityId,
    }, "[communicationDomain:usage] Received usage tracking event");

    try {
        // usageService.getUsageForCycle is a read interface.
        // For write-side tracking, the service layer is extended here.
        // Currently: no-op if the service only has getUsageForCycle.
        // Add usageService.trackUsage(payload) when the write path is implemented.
        if (typeof usageService.trackUsage === "function") {
            await usageService.trackUsage({ orgId, type, entityId, metadata });
        } else {
            // Graceful degradation — log only until write path is added
            logger.info({
                event: EVENT,
                orgId,
                type,
                entityId,
                metadata,
            }, "[communicationDomain:usage] Usage event received (write path pending implementation)");
        }
    } catch (err) {
        // Non-fatal — billing already completed. Log for observability.
        logger.error({
            event: EVENT,
            orgId,
            type,
            entityId,
            err: err.message,
        }, "[communicationDomain:usage] Failed to track usage — non-fatal");
    }
}

/**
 * register
 * Wire the listener into the event bus. Called during server boot.
 */
function register() {
    eventBus.on(EVENT, (payload) => {
        onUsageTrack(payload).catch((err) => {
            logger.error({
                event: EVENT,
                err: err.message,
            }, "[communicationDomain:usage] Unhandled error in usage tracking handler");
        });
    });

    logger.info(`[communicationDomain] Listener registered: ${EVENT}`);
}

module.exports = { register };
