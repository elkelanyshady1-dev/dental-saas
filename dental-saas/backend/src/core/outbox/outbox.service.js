/**
 * outbox.service.js — Outbox Write API
 * Core Infrastructure — Event Durability
 *
 * Provides a simple API for writing events to the outbox INSIDE transactions.
 * Used by orchestrators and services that need guaranteed event delivery.
 *
 * USAGE:
 *   await outboxService.enqueue({
 *       organizationId,
 *       eventType: "PAYMENT_REFUNDED",
 *       aggregateType: "refund",
 *       aggregateId: refund._id,
 *       payload: { ... },
 *   }, session);
 *
 * INVARIANTS:
 * 1. enqueue() MUST be called inside a session/transaction
 * 2. Duplicate events are silently ignored (unique index)
 * 3. enqueue() is IDEMPOTENT
 */

"use strict";

const Outbox = require("./Outbox.model");
const logger = require("@utils/logger");

/**
 * Enqueue an event into the outbox within a transaction.
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.eventType — domain event name
 * @param {string} params.aggregateType — "invoice" | "payment" | "refund" etc.
 * @param {ObjectId} params.aggregateId — the source document ID
 * @param {Object} params.payload — event payload
 * @param {import("mongoose").ClientSession} session — REQUIRED MongoDB session
 * @returns {Promise<Object>} — created outbox record
 */
async function enqueue({ organizationId, eventType, aggregateType, aggregateId, payload }, session) {
    if (!session) {
        throw new Error("[Outbox] session is REQUIRED — outbox writes must be transactional.");
    }

    try {
        const [record] = await Outbox.create(
            [
                {
                    organizationId,
                    eventType,
                    aggregateType,
                    aggregateId,
                    payload,
                    status: "pending",
                },
            ],
            { session }
        );

        return record;
    } catch (err) {
        // Handle duplicate (unique index violation) — idempotent
        if (err.code === 11000) {
            logger.info(
                { eventType, aggregateType, aggregateId: aggregateId?.toString() },
                "[Outbox] Duplicate event — already enqueued (idempotent)"
            );
            return null;
        }
        throw err;
    }
}

module.exports = {
    enqueue,
};
