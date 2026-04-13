/**
 * emailQueue.js
 * Platform Infrastructure — BullMQ Email Queue
 * v3.0 — PII-Safe EmailEvent logging
 *
 * PLANE: Platform / Shared
 */

"use strict";

const { Queue } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const logger = require("../../utils/logger");

const EMAIL_QUEUE_NAME = "emailQueue";

const emailQueue = new Queue(EMAIL_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: "exponential",
            delay: 5000       // 5s, 10s, 20s, 40s, 80s
        },
        removeOnComplete: { count: 500, age: 86400 },
        removeOnFail: { count: 200, age: 604800 }
    }
});

emailQueue.on("error", (err) => {
    logger.error({ err: err.message, queue: EMAIL_QUEUE_NAME }, "[emailQueue] Queue error");
});

const TYPE_MAP = {
    MAGIC_LINK: "magicLink", PASSWORD_RESET: "resetPassword",
    EMAIL_OTP: "otp", EMAIL_VERIFY: "emailVerify",
    INVOICE: "invoice",
    REFUND: "refund", TICKET_REPLY: "ticketReply",
    GRACE: "grace", SUSPENSION: "suspension",
    RETRY_FAILED: "retryFailed",
};

/**
 * enqueueEmail
 * Adds an email job to the queue and creates an initial PII-safe EmailEvent record.
 *
 * @param {string} type     - Email type key (e.g. "MAGIC_LINK")
 * @param {object} payload  - Template data + { email }
 * @param {object} [opts]   - BullMQ JobsOptions overrides
 * @returns {Promise<Job>}
 */
async function enqueueEmail(type, payload, opts = {}) {
    if (!type) throw new Error("[emailQueue] enqueueEmail: type is required");
    if (!payload?.email) throw new Error("[emailQueue] enqueueEmail: payload.email is required");

    const job = await emailQueue.add(
        `email:${type.toLowerCase()}`,
        { type, payload },
        opts
    );

    // Lazy-load PII utilities to avoid circular require at module init time
    try {
        const { EmailEvent, hashRecipient, maskEmail, getDomain } = require("../../platform/models/EmailEvent.model");
        const masked = maskEmail(payload.email);

        logger.info(
            { jobId: job.id, emailType: type, recipientMasked: masked },
            "[emailQueue] Email job enqueued"
        );

        await EmailEvent.create({
            jobId: job.id,
            template: TYPE_MAP[type] || type.toLowerCase(),
            channel: "email",
            subject: payload.subject || "",
            status: "queued",
            recipientHash: hashRecipient(payload.email),
            recipientMasked: masked,
            recipientDomain: getDomain(payload.email),
            meta: { type },
        });
    } catch { /* Inspector logging is best-effort — never fail the enqueue */ }

    return job;
}

module.exports = { emailQueue, enqueueEmail, EMAIL_QUEUE_NAME };
