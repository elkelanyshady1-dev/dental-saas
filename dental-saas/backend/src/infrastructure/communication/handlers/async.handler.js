/**
 * async.handler.js
 * Hybrid Execution Model — ASYNC path.
 *
 * Phase 1: pass-through to the existing BullMQ-backed sendCommunication
 * service. Keeping this as a thin wrapper lets later phases switch the
 * transport (ENABLE_QUEUE gate in Phase 2, QStash in Phase 4) without
 * touching callers.
 *
 * @per-plane Infrastructure
 */

"use strict";

const { sendCommunication } = require("@services/communicationService");

async function deliverAsync({ channel, type, payload }) {
    const result = await sendCommunication({ channel, type, payload });
    return { mode: "async", result };
}

module.exports = { deliverAsync };
