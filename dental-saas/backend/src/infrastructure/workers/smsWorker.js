/**
 * smsWorker.js
 * Platform Infrastructure — BullMQ SMS Worker
 * v1.0
 *
 * Processes jobs from the "smsQueue" BullMQ queue.
 * Job shape: { type: string, payload: { phone: string, body?: string, ... } }
 *
 * On failure: routes exhausted jobs to smsDLQ, logs retries.
 * Auto-scales concurrency based on queue depth (10s interval).
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const { Worker } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const { smsQueue, SMS_QUEUE_NAME } = require("../queues/channelQueues");
const { sendSms } = require("../communication/smsProvider");
const { moveToDeadLetter, logRetryAttempt } = require("../queues/deadLetterQueue");
const CommunicationMetrics = require("../../platform/models/CommunicationMetrics.model").default;
const { startWorkerScaler } = require("./workerScaler");
const logger = require("../../utils/logger");

// ─── Message body builder (type → text) ───────────────────────────────────────
function buildSmsBody(type, payload) {
    switch (type) {
        case "OTP":
            return `Your ${payload.platformName || "DentalSaaS"} verification code: ${payload.code}. Valid for ${payload.expiresInMinutes || 10} minutes.`;
        case "APPOINTMENT_REMINDER":
            return `Reminder: You have an appointment at ${payload.clinicName || "your clinic"} on ${payload.date} at ${payload.time}. Reply CONFIRM or CANCEL.`;
        case "GRACE_SMS":
            return `Action required: Your ${payload.platformName || "DentalSaaS"} subscription has expired. Please renew to avoid suspension.`;
        case "SUSPENSION_SMS":
            return `Your ${payload.platformName || "DentalSaaS"} account has been suspended due to non-payment. Renew at: ${payload.renewUrl || "your dashboard"}.`;
        default:
            return payload.body || `Message from DentalSaaS: ${type}`;
    }
}

const worker = new Worker(
    SMS_QUEUE_NAME,
    async (job) => {
        const { type, payload } = job.data;

        logger.info(
            { jobId: job.id, smsType: type, to: payload?.phone, attempt: job.attemptsMade + 1 },
            "[smsWorker] Processing SMS job"
        );

        await job.log(`[attempt ${job.attemptsMade + 1}] Processing ${type} → ${payload?.phone}`);

        const body = buildSmsBody(type, payload);
        await sendSms({ to: payload.phone, body, type });

        await job.log(`[attempt ${job.attemptsMade + 1}] SMS sent`);

        logger.info(
            { jobId: job.id, smsType: type, to: payload?.phone },
            "[smsWorker] SMS job completed"
        );
    },
    {
        connection: redisConnection,
        concurrency: 3,
        limiter: { max: 30, duration: 10_000 }, // 30 SMS / 10s (provider rate guard)
    }
);

// ─── Lifecycle events ──────────────────────────────────────────────────────────

worker.on("completed", async (job) => {
    logger.info({ jobId: job.id, smsType: job.data?.type }, "[smsWorker] Job completed");
    CommunicationMetrics.increment("sms", job.data?.type || "ALL", "sent").catch(() => { });
});

worker.on("failed", async (job, err) => {
    const isExhausted = job?.attemptsMade >= (job?.opts?.attempts ?? 1);
    logger.error(
        { jobId: job?.id, smsType: job?.data?.type, to: job?.data?.payload?.phone, attempt: job?.attemptsMade, isExhausted, err: err.message },
        "[smsWorker] Job failed"
    );

    CommunicationMetrics.increment("sms", job?.data?.type || "ALL", "failed").catch(() => { });

    if (isExhausted) {
        await moveToDeadLetter(job, err, "sms");
    } else {
        await logRetryAttempt(job, err, "sms");
    }
});

worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "[smsWorker] Job stalled");
});

worker.on("error", (err) => {
    logger.error({ err: err.message }, "[smsWorker] Worker error");
});

// Auto-scaler
try {
    startWorkerScaler({ queue: smsQueue, worker, label: "sms" });
} catch (scalerErr) {
    logger.warn({ err: scalerErr.message }, "[smsWorker] Auto-scaler failed to start");
}

module.exports = worker;
