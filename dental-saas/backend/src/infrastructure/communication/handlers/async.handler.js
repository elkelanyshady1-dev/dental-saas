/**
 * async.handler.js
 * Hybrid Execution Model — ASYNC path.
 *
 * Phase 2 behavior:
 *   - ENABLE_QUEUE=true  → enqueue via sendCommunication (BullMQ transport).
 *     Wrapped in try/catch so queue-enqueue failures are visible in logs
 *     as [QUEUE FAILED] before the error propagates to the caller.
 *   - ENABLE_QUEUE=false → transparently deliver synchronously. This keeps
 *     dev environments working without Redis/Bull workers and lets prod
 *     fall through in case of a queue incident (operator-toggled).
 *
 * The error is rethrown on failure so the verification listener's
 * channel-fallback loop can try the next channel.
 *
 * @per-plane Infrastructure
 */

"use strict";

const logger = require("@utils/logger");
const config = require("@config/communication.config");
const { sendCommunication } = require("@services/communicationService");
const { deliverSync } = require("./sync.handler");

async function deliverAsync({ channel, type, payload }) {
    if (!config.ENABLE_QUEUE) {
        logger.warn(
            { channel, type },
            "[ASYNC→SYNC FALLBACK] ENABLE_QUEUE=false — delivering synchronously"
        );
        const syncResult = await deliverSync({ channel, type, payload });
        return { mode: "async-fallback-sync", result: syncResult };
    }

    try {
        const result = await sendCommunication({ channel, type, payload });
        return { mode: "async", result };
    } catch (err) {
        logger.error(
            { channel, type, err: err.message },
            "[QUEUE FAILED] sendCommunication enqueue failed"
        );
        throw err;
    }
}

module.exports = { deliverAsync };
