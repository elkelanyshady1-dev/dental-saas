/**
 * outbox.enqueue.js — Side-Effect Outbox Write API
 * Layer: Infrastructure > Outbox
 * Version: v25.0 — Outbox Hardening
 *
 * PURPOSE:
 *   Provides a simple API for writing side-effect events to the outbox.
 *   Replaces `setImmediate(async () => { await someDbWrite() })` with
 *   crash-safe persistence.
 *
 * TWO MODES:
 *   1. Inside transaction:  enqueueSideEffect(params, { session })
 *      → Written atomically with the domain mutation. If transaction
 *        rolls back, the side effect is also rolled back.
 *
 *   2. Outside transaction: enqueueSideEffect(params)
 *      → Written immediately. Safe for controller post-response patterns
 *        where no transaction is available.
 *
 * IDEMPOTENCY:
 *   If `idempotencyKey` is provided and a duplicate exists, the call is
 *   silently ignored (returns null). This prevents double-execution.
 *
 * USAGE:
 *   const { enqueueSideEffect } = require("@platform/outbox/outbox.enqueue");
 *
 *   await enqueueSideEffect({
 *       eventType:      "BILLING_TIMELINE_WRITE",
 *       payload:        { organizationId, contractId, eventType: "CONTRACT_ACTIVATED", ... },
 *       idempotencyKey: `timeline:${contractId}:CONTRACT_ACTIVATED`,
 *       emitter:        "contractActivation.service",
 *   });
 */

"use strict";

const getSharedModel      = require("@core/db/getSharedModel");
const SideEffectOutboxDef = require("./SideEffectOutbox.model");
let _SideEffectOutbox_cache = null;
function SideEffectOutbox() {
    return _SideEffectOutbox_cache || (_SideEffectOutbox_cache = getSharedModel(SideEffectOutboxDef));
}
const logger           = require("@utils/logger");

/**
 * Enqueue a side-effect event for guaranteed background execution.
 *
 * @param {Object}  params
 * @param {string}  params.eventType       — Handler key (e.g. "BILLING_TIMELINE_WRITE")
 * @param {Object}  params.payload         — Full payload for the handler
 * @param {string}  [params.idempotencyKey] — Dedup key (prevents double-execution)
 * @param {string}  [params.emitter]       — Originating service name
 * @param {string}  [params.correlationId] — Tracing ID
 * @param {Object}  [opts]
 * @param {import("mongoose").ClientSession} [opts.session] — MongoDB session (optional)
 * @returns {Promise<Object|null>} Created outbox record, or null if duplicate
 */
async function enqueueSideEffect(
    { eventType, payload, idempotencyKey = null, emitter = "unknown", correlationId = null },
    { session = null } = {}
) {
    try {
        const doc = {
            eventType,
            payload,
            idempotencyKey: idempotencyKey || undefined,
            emitter,
            correlationId,
            status:     "pending",
            retryCount: 0,
        };

        const createOpts = session ? { session } : {};
        const [record] = await SideEffectOutbox().create([doc], createOpts);

        logger.debug({
            event:          "SIDE_EFFECT_ENQUEUED",
            eventType,
            idempotencyKey,
            emitter,
            outboxId:       record._id,
        }, `[SideEffectOutbox] Enqueued: ${eventType}`);

        return record;

    } catch (err) {
        // Handle duplicate (unique index on idempotencyKey)
        if (err.code === 11000) {
            logger.debug({
                event:          "SIDE_EFFECT_DUPLICATE",
                eventType,
                idempotencyKey,
            }, `[SideEffectOutbox] Duplicate — already enqueued (idempotent)`);
            return null;
        }

        // Non-fatal — log and swallow. The original setImmediate pattern also
        // swallowed errors. We upgrade to logging but never block the caller.
        logger.error({
            event:     "SIDE_EFFECT_ENQUEUE_FAILED",
            eventType,
            emitter,
            err:       err.message,
        }, `[SideEffectOutbox] Failed to enqueue: ${eventType}`);

        return null;
    }
}

module.exports = { enqueueSideEffect };
