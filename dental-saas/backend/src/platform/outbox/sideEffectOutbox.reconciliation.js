/**
 * sideEffectOutbox.reconciliation.js — Stuck Event Recovery
 * Layer: Infrastructure > Outbox
 * Version: v25.0 — Outbox Hardening — Part 7
 *
 * PURPOSE:
 *   Recovers events stuck in "processing" status due to worker crashes.
 *   If a worker claims an event (status="processing") but crashes before
 *   completing it, the event would be stuck forever without reconciliation.
 *
 * MECHANISM:
 *   1. Find all events with status="processing" and lockedAt older than timeout
 *   2. Reset them to "pending" so the worker retries
 *   3. Log each recovery for audit trail
 *
 * SCHEDULE:
 *   Run every 60 seconds via setInterval in server.js.
 *   (This setInterval is safe — it triggers the reconciliation check,
 *    not a fire-and-forget DB write.)
 */

"use strict";

const getSharedModel      = require("@core/db/getSharedModel");
const SideEffectOutboxDef = require("./SideEffectOutbox.model");
const SideEffectOutbox = getSharedModel(SideEffectOutboxDef);
const logger           = require("@utils/logger");

// Events stuck in "processing" for longer than this are considered crashed
const STUCK_TIMEOUT_MS = 60_000; // 1 minute

/**
 * Find and recover stuck events.
 * @returns {Promise<number>} Number of events recovered
 */
async function reconcile() {
    try {
        const cutoff = new Date(Date.now() - STUCK_TIMEOUT_MS);

        const stuck = await SideEffectOutbox.find({
            status:   "processing",
            lockedAt: { $lt: cutoff },
        }).lean();

        if (stuck.length === 0) return 0;

        for (const event of stuck) {
            await SideEffectOutbox.updateOne(
                { _id: event._id, status: "processing" },
                {
                    $set: {
                        status:   "pending",
                        lockedAt: null,
                        error:    `Recovered from stuck "processing" state after ${STUCK_TIMEOUT_MS}ms`,
                    },
                }
            );

            logger.warn({
                event:     "SIDE_EFFECT_OUTBOX_RECOVERED",
                outboxId:  event._id,
                eventType: event.eventType,
                lockedAt:  event.lockedAt,
                age:       Date.now() - new Date(event.lockedAt).getTime(),
            }, `[SideEffectOutbox] Recovered stuck event: ${event.eventType}`);
        }

        logger.info({
            event:     "SIDE_EFFECT_OUTBOX_RECONCILIATION",
            recovered: stuck.length,
        }, `[SideEffectOutbox] Reconciliation: recovered ${stuck.length} stuck event(s)`);

        return stuck.length;

    } catch (err) {
        logger.error({
            event: "SIDE_EFFECT_OUTBOX_RECONCILIATION_ERROR",
            err:   err.message,
        }, "[SideEffectOutbox] Reconciliation error");
        return 0;
    }
}

module.exports = { reconcile };
