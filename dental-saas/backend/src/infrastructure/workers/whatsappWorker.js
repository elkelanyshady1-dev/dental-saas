/**
 * whatsappWorker.js
 * Platform Infrastructure — BullMQ WhatsApp Worker
 * v1.0
 *
 * Processes jobs from the "whatsappQueue" BullMQ queue.
 * Job shape: { type: string, payload: { phone: string, body?: string, templateName?: string, ... } }
 *
 * On failure: routes exhausted jobs to whatsappDLQ, logs retries.
 * Auto-scales concurrency based on queue depth (10s interval).
 *
 * Architecture mirrors smsWorker.js exactly.
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const { Worker } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const { whatsappQueue, WHATSAPP_QUEUE_NAME } = require("../queues/channelQueues");
const { sendWhatsapp } = require("../communication/whatsappProvider");
const { moveToDeadLetter, logRetryAttempt } = require("../queues/deadLetterQueue");
const CommunicationMetrics = require("../../platform/models/CommunicationMetrics.model").default;
const { startWorkerScaler } = require("./workerScaler");
const logger = require("../../utils/logger");

// ─── Message body builder (type → text) ───────────────────────────────────────
function buildWhatsappBody(type, payload) {
    switch (type) {
        case "OTP":
            return `Your ${payload.platformName || "DentalSaaS"} verification code: ${payload.code}. Valid for ${payload.expiresInMinutes || 10} minutes. Do not share this code.`;
        case "APPOINTMENT_CONFIRM":
            return `Your appointment at ${payload.clinicName || "your clinic"} on ${payload.date} at ${payload.time} is confirmed. Reply CANCEL to cancel.`;
        case "APPOINTMENT_REMINDER":
            return `Reminder: You have an appointment at ${payload.clinicName || "your clinic"} tomorrow at ${payload.time}. Please arrive 10 minutes early.`;
        case "PAYMENT_RECEIPT":
            return `Payment received: ${payload.currency || "$"}${payload.amount} for ${payload.description || "your dental visit"}. Thank you!`;
        case "GRACE_WHATSAPP":
            return `Action required: Your ${payload.platformName || "DentalSaaS"} subscription has expired. Please renew to avoid service suspension.`;
        default:
            return payload.body || `Message from DentalSaaS: ${type}`;
    }
}

const worker = new Worker(
    WHATSAPP_QUEUE_NAME,
    async (job) => {
        const { type, payload } = job.data;

        logger.info(
            { jobId: job.id, waType: type, to: payload?.phone, attempt: job.attemptsMade + 1 },
            "[whatsappWorker] Processing WhatsApp job"
        );

        await job.log(`[attempt ${job.attemptsMade + 1}] Processing ${type} → ${payload?.phone}`);

        const body = buildWhatsappBody(type, payload);
        await sendWhatsapp({
            to: payload.phone,
            body,
            type,
            templateName: payload.templateName || null,
            templateParams: payload.templateParams || null,
        });

        await job.log(`[attempt ${job.attemptsMade + 1}] WhatsApp sent`);

        logger.info(
            { jobId: job.id, waType: type, to: payload?.phone },
            "[whatsappWorker] WhatsApp job completed"
        );
    },
    {
        connection: redisConnection,
        concurrency: 3,
        limiter: { max: 20, duration: 10_000 }, // 20 messages / 10s (WhatsApp rate guard)
    }
);

// ─── Lifecycle events ──────────────────────────────────────────────────────────

worker.on("completed", async (job) => {
    logger.info({ jobId: job.id, waType: job.data?.type }, "[whatsappWorker] Job completed");
    CommunicationMetrics.increment("whatsapp", job.data?.type || "ALL", "sent").catch(() => { });
});

worker.on("failed", async (job, err) => {
    const isExhausted = job?.attemptsMade >= (job?.opts?.attempts ?? 1);
    logger.error(
        { jobId: job?.id, waType: job?.data?.type, to: job?.data?.payload?.phone, attempt: job?.attemptsMade, isExhausted, err: err.message },
        "[whatsappWorker] Job failed"
    );

    CommunicationMetrics.increment("whatsapp", job?.data?.type || "ALL", "failed").catch(() => { });

    if (isExhausted) {
        await moveToDeadLetter(job, err, "whatsapp");
    } else {
        await logRetryAttempt(job, err, "whatsapp");
    }
});

worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "[whatsappWorker] Job stalled");
});

worker.on("error", (err) => {
    logger.error({ err: err.message }, "[whatsappWorker] Worker error");
});

// Auto-scaler
try {
    startWorkerScaler({ queue: whatsappQueue, worker, label: "whatsapp" });
} catch (scalerErr) {
    logger.warn({ err: scalerErr.message }, "[whatsappWorker] Auto-scaler failed to start");
}

module.exports = worker;
