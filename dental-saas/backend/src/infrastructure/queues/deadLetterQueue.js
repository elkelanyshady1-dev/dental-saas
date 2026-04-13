/**
 * deadLetterQueue.js
 * Platform Infrastructure — Dead-Letter Queue Router
 * v1.0
 *
 * Routes exhausted jobs from any channel to their DLQ.
 * Called by workers after all retry attempts have been exhausted.
 *
 * DLQ Structure:
 *   emailDLQ     — exhausted email jobs
 *   smsDLQ       — exhausted SMS jobs
 *   whatsappDLQ  — exhausted WhatsApp jobs
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const { Queue } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const CommunicationRetryLog = require("../../platform/models/CommunicationRetryLog.model").default;
const CommunicationMetrics = require("../../platform/models/CommunicationMetrics.model").default;
const logger = require("../../utils/logger");

// ─── Email DLQ (emailQueue exhaustion sink) ────────────────────────────────────
const EMAIL_DLQ_NAME = "emailDLQ";

const emailDLQ = new Queue(EMAIL_DLQ_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 1000, age: 30 * 24 * 3600 }, // 30-day retention
        removeOnFail: { count: 1000, age: 30 * 24 * 3600 },
    },
});

/**
 * moveToDeadLetter
 *
 * Call from any worker's "failed" event handler when job.attemptsMade >= job.opts.attempts.
 * Copies the job to the channel's DLQ, writes a retry log entry, and increments DLQ metrics.
 *
 * @param {Object} job - BullMQ Job instance
 * @param {Error}  err - The error that caused final failure
 * @param {string} channel - "email" | "sms" | "whatsapp"
 */
async function moveToDeadLetter(job, err, channel = "email") {
    const isDLQ = job.attemptsMade >= (job.opts?.attempts ?? 1);
    if (!isDLQ) return; // Not exhausted — let BullMQ retry normally

    const dlqMap = {
        email: emailDLQ,
        sms: require("./channelQueues").smsDLQ,
        whatsapp: require("./channelQueues").whatsappDLQ,
    };

    const targetDLQ = dlqMap[channel];
    if (!targetDLQ) {
        logger.warn({ channel }, "[DLQ] Unknown channel — skipping DLQ routing");
        return;
    }

    try {
        // Add to DLQ with full job snapshot
        await targetDLQ.add(`DLQ-${job.data?.type || job.name}`, {
            originalJobId: job.id,
            originalQueue: job.queueName,
            channel,
            type: job.data?.type || job.name,
            payload: job.data?.payload || job.data,
            error: err.message,
            exhaustedAt: new Date().toISOString(),
            attempts: job.attemptsMade,
        });

        logger.warn(
            { jobId: job.id, channel, type: job.data?.type, attempts: job.attemptsMade, err: err.message },
            "[DLQ] Job moved to dead-letter queue"
        );
    } catch (dlqErr) {
        logger.error({ jobId: job.id, dlqErr: dlqErr.message }, "[DLQ] Failed to write to DLQ — critical");
    }

    // Write retry log
    try {
        await CommunicationRetryLog.create({
            channel,
            jobId: job.id,
            type: job.data?.type || job.name,
            recipient: job.data?.payload?.email || job.data?.payload?.phone || null,
            attempts: job.attemptsMade,
            maxAttempts: job.opts?.attempts ?? null,
            isDLQ: true,
            error: err.message,
            stack: process.env.NODE_ENV !== "production" ? err.stack?.slice(0, 500) : null,
            queueName: job.queueName,
            jobData: process.env.NODE_ENV !== "production" ? (job.data?.payload || job.data) : null,
        });
    } catch (logErr) {
        logger.error({ logErr: logErr.message }, "[DLQ] Failed to write retry log");
    }

    // Increment DLQ metric counter
    try {
        await CommunicationMetrics.increment(channel, job.data?.type || "ALL", "dlq");
    } catch { /* metrics failure is non-blocking */ }
}

/**
 * logRetryAttempt
 *
 * Call from any worker's "failed" event for non-exhausted failures
 * (job will be retried). Writes a retry log entry only.
 *
 * @param {Object} job - BullMQ Job instance
 * @param {Error}  err - The error
 * @param {string} channel - "email" | "sms" | "whatsapp"
 */
async function logRetryAttempt(job, err, channel = "email") {
    const isDLQ = job.attemptsMade >= (job.opts?.attempts ?? 1);
    if (isDLQ) return; // Already handled by moveToDeadLetter

    try {
        await CommunicationRetryLog.create({
            channel,
            jobId: job.id,
            type: job.data?.type || job.name,
            recipient: job.data?.payload?.email || job.data?.payload?.phone || null,
            attempts: job.attemptsMade,
            maxAttempts: job.opts?.attempts ?? null,
            isDLQ: false,
            error: err.message,
            stack: process.env.NODE_ENV !== "production" ? err.stack?.slice(0, 500) : null,
            queueName: job.queueName,
        });
    } catch (logErr) {
        logger.error({ logErr: logErr.message }, "[DLQ] Failed to write retry log");
    }

    try {
        await CommunicationMetrics.increment(channel, job.data?.type || "ALL", "retried");
    } catch { /* non-blocking */ }
}

module.exports = {
    emailDLQ,
    EMAIL_DLQ_NAME,
    moveToDeadLetter,
    logRetryAttempt,
};
