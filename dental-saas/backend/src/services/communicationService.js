/**
 * communicationService.js
 * Platform Service — Unified Communication Facade
 * v2.0 — thin wrapper around communication.dispatcher
 *
 * Single entry point for all platform outbound communications. Kept as a
 * facade so existing callers (verification.listener, subscriptionGuard,
 * communicationMetricsController) don't need to rewire; internally all
 * routing is delegated to communication.dispatcher, which handles sync
 * vs. async (QStash) delivery, idempotency, and provider calls.
 *
 * v1.0 routed to BullMQ per-channel queues (emailQueue / channelQueues)
 * which were deleted in Phase 6 (Redis eradication).
 *
 * Usage:
 *   const { sendCommunication } = require('../services/communicationService');
 *   await sendCommunication({ channel: 'email', type: 'PASSWORD_RESET', payload: { email, name } });
 *   await sendCommunication({ channel: 'sms',   type: 'OTP',           payload: { phone, code } });
 *
 * PLANE: Platform / Shared
 */

"use strict";

const { dispatch } = require("../infrastructure/communication/communication.dispatcher");
const logger = require("../utils/logger");

const SUPPORTED_CHANNELS = new Set(["email", "sms", "whatsapp"]);

/**
 * sendCommunication
 *
 * @param {Object} params
 * @param {"email"|"sms"|"whatsapp"} params.channel
 * @param {string}  params.type    - Message type (PASSWORD_RESET, OTP, etc.)
 * @param {Object}  params.payload - Channel-specific payload
 * @returns {Promise<{ mode: string, [k: string]: any }>} dispatcher result
 */
async function sendCommunication({ channel, type, payload }) {
    if (!channel || !type || !payload) {
        throw new Error("[CommunicationService] channel, type, and payload are required");
    }

    const normalizedChannel = channel.toLowerCase();
    if (!SUPPORTED_CHANNELS.has(normalizedChannel)) {
        throw new Error(`[CommunicationService] Unknown channel: "${channel}"`);
    }

    logger.info(
        { channel: normalizedChannel, type, recipient: payload.email || payload.phone },
        "[CommService] Dispatching"
    );

    return dispatch({ channel: normalizedChannel, type, payload });
}

/**
 * sendBulkCommunication
 *
 * Dispatches multiple messages in one call (e.g. bulk test sends).
 * Returns an array of per-item results (resolved/rejected).
 *
 * @param {Array<{ channel: string, type: string, payload: Object }>} items
 * @returns {Promise<Array<{status: "fulfilled"|"rejected", value?: any, reason?: any}>>}
 */
async function sendBulkCommunication(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("[CommunicationService] items must be a non-empty array");
    }
    const results = await Promise.allSettled(items.map((item) => sendCommunication(item)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
        logger.warn({ total: items.length, failed }, "[CommService] Some bulk dispatches failed");
    }
    return results;
}

module.exports = { sendCommunication, sendBulkCommunication };
