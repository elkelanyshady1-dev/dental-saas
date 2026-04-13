/**
 * communicationService.js
 * Platform Service — Unified Communication Dispatcher
 * v1.0
 *
 * Single entry point for all platform outbound communications.
 * Routes to the appropriate queue based on channel.
 *
 * Usage:
 *   const { sendCommunication } = require('../services/communicationService');
 *   await sendCommunication({ channel: 'email', type: 'PASSWORD_RESET', payload: { email, name } });
 *   await sendCommunication({ channel: 'sms',   type: 'OTP',           payload: { phone, code } });
 *
 * PLANE: Platform / Shared
 */

"use strict";

const { enqueueEmail } = require("../infrastructure/queues/emailQueue");
const { enqueueSms } = require("../infrastructure/queues/channelQueues");
const { enqueueWhatsapp } = require("../infrastructure/queues/channelQueues");
const logger = require("../utils/logger");

/**
 * sendCommunication
 *
 * @param {Object} params
 * @param {"email"|"sms"|"whatsapp"} params.channel
 * @param {string}  params.type    - Message type (PASSWORD_RESET, OTP, etc.)
 * @param {Object}  params.payload - Channel-specific payload
 * @returns {Promise<import("bullmq").Job>}
 */
async function sendCommunication({ channel, type, payload }) {
    if (!channel || !type || !payload) {
        throw new Error("[CommunicationService] channel, type, and payload are required");
    }

    logger.info({ channel, type, recipient: payload.email || payload.phone }, "[CommService] Enqueuing");

    switch (channel.toLowerCase()) {
        case "email":
            return enqueueEmail(type, payload);

        case "sms":
            return enqueueSms(type, payload);

        case "whatsapp":
            return enqueueWhatsapp(type, payload);

        default:
            throw new Error(`[CommunicationService] Unknown channel: "${channel}"`);
    }
}

/**
 * sendBulkCommunication
 *
 * Enqueues multiple messages in one call (e.g. bulk test sends).
 * Returns an array of job results (resolved/rejected).
 *
 * @param {Array<{ channel: string, type: string, payload: Object }>} items
 * @returns {Promise<Array<{status: "fulfilled"|"rejected", value?: any, reason?: any}>>}
 */
async function sendBulkCommunication(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("[CommunicationService] items must be a non-empty array");
    }
    const results = await Promise.allSettled(items.map(item => sendCommunication(item)));
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) {
        logger.warn({ total: items.length, failed }, "[CommService] Some bulk jobs failed to enqueue");
    }
    return results;
}

module.exports = { sendCommunication, sendBulkCommunication };
