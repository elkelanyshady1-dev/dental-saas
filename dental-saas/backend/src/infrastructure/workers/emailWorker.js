/**
 * emailWorker.js
 * Platform Infrastructure — BullMQ Email Worker
 * v3.0 — PII-Safe Logging + Provider Failover Support
 *
 * Processes jobs from the "emailQueue" BullMQ queue.
 * Each job: { type: string, payload: object }
 *
 * Changes from v2:
 *  - EmailEvent now uses PII-safe fields (recipientHash, recipientMasked, recipientDomain)
 *  - Uses named import { EmailEvent, hashRecipient, maskEmail, getDomain }
 *  - Records providerChain from EmailService.process() result
 *
 * PLANE: Platform / Shared
 */

"use strict";

const { Worker } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const { EmailService } = require("../../services/email/emailService");
const { emailQueue, EMAIL_QUEUE_NAME } = require("../queues/emailQueue");
const { moveToDeadLetter, logRetryAttempt } = require("../queues/deadLetterQueue");
const CommunicationMetrics = require("../../platform/models/CommunicationMetrics.model").default;
const { EmailEvent, hashRecipient, maskEmail, getDomain } = require("../../platform/models/EmailEvent.model");
const { startWorkerScaler } = require("./workerScaler");
const logger = require("../../utils/logger");

const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job) => {
        const { type, payload } = job.data;
        const recipientEmail = payload?.email || "";

        logger.info(
            { jobId: job.id, emailType: type, recipientMasked: maskEmail(recipientEmail), attempt: job.attemptsMade + 1 },
            "[emailWorker] Processing email job"
        );
        console.log(`\n[emailWorker] 📨 Job ${job.id} | Type: ${type} | To: ${maskEmail(recipientEmail)} | Attempt: ${job.attemptsMade + 1}`);

        await job.log(`[attempt ${job.attemptsMade + 1}] Processing ${type} → ${maskEmail(recipientEmail)}`);

        // Mark as processing in EmailEvent log (PII-safe upsert)
        const startedAt = Date.now();
        await EmailEvent.findOneAndUpdate(
            { jobId: job.id },
            {
                status: "processing",
                attemptsMade: job.attemptsMade + 1,
                recipientHash: hashRecipient(recipientEmail),
                recipientMasked: maskEmail(recipientEmail),
                recipientDomain: getDomain(recipientEmail),
            },
            { upsert: true, new: true }
        ).catch(() => { }); // non-blocking

        const result = await EmailService.process(type, payload);

        const durationMs = Date.now() - startedAt;
        const previewUrl = result?._previewUrl ?? null;
        const providerUsed = result?.provider ?? "smtp";
        const providerChain = result?.providerChain ?? [providerUsed];

        if (previewUrl) {
            console.log(`\n[emailWorker] ✅ Email sent via ${providerUsed} — preview: ${previewUrl}`);
            await job.log(`[attempt ${job.attemptsMade + 1}] Email sent ✅ via ${providerUsed} | Preview: ${previewUrl}`);
        } else {
            await job.log(`[attempt ${job.attemptsMade + 1}] Email sent ✅ via ${providerUsed}`);
        }

        // Update EmailEvent with success (PII-safe — no raw email)
        await EmailEvent.findOneAndUpdate(
            { jobId: job.id },
            {
                status: "sent",
                previewUrl: previewUrl,
                messageId: result?.messageId || null,
                provider: providerUsed,
                providerChain: providerChain,
                durationMs,
                error: null,
            }
        ).catch(() => { });

        logger.info(
            { jobId: job.id, emailType: type, provider: providerUsed, providerChain, previewUrl },
            "[emailWorker] Email job completed"
        );
    },
    {
        connection: redisConnection,
        concurrency: 5,
        limiter: {
            max: 50,
            duration: 10_000
        }
    }
);

// ─── Worker lifecycle events ───────────────────────────────────────────────────

worker.on("completed", async (job) => {
    logger.info({ jobId: job.id, emailType: job.data?.type }, "[emailWorker] Job completed");
    CommunicationMetrics.increment("email", job.data?.type || "ALL", "sent").catch(() => { });
});

worker.on("failed", async (job, err) => {
    const isExhausted = job?.attemptsMade >= (job?.opts?.attempts ?? 1);
    const recipientEmail = job?.data?.payload?.email || "";

    logger.error(
        {
            jobId: job?.id,
            emailType: job?.data?.type,
            recipientMasked: maskEmail(recipientEmail),
            attempt: job?.attemptsMade,
            maxAttempts: job?.opts?.attempts,
            isExhausted,
            err: err.message,
        },
        "[emailWorker] Job failed"
    );

    // Update EmailEvent with failure info (PII-safe)
    const status = isExhausted ? "failed" : "retrying";
    EmailEvent.findOneAndUpdate(
        { jobId: job?.id },
        {
            status,
            error: err.message,
            attemptsMade: job?.attemptsMade,
            recipientHash: hashRecipient(recipientEmail),
            recipientMasked: maskEmail(recipientEmail),
            recipientDomain: getDomain(recipientEmail),
        }
    ).catch(() => { });

    CommunicationMetrics.increment("email", job?.data?.type || "ALL", "failed").catch(() => { });

    if (isExhausted) {
        await moveToDeadLetter(job, err, "email");
    } else {
        await logRetryAttempt(job, err, "email");
    }
});

worker.on("stalled", (jobId) => {
    logger.warn({ jobId }, "[emailWorker] Job stalled — will be re-queued");
    // Persist stall event to EmailEvent
    EmailEvent.findOneAndUpdate(
        { jobId },
        { status: "retrying", error: "Job stalled — re-queued by BullMQ" }
    ).catch(() => { });
});

worker.on("error", (err) => {
    logger.error({ err: err.message }, "[emailWorker] Worker error");
});

// ─── Auto-scaler ──────────────────────────────────────────────────────────────
try {
    startWorkerScaler({ queue: emailQueue, worker, label: "email" });
} catch (scalerErr) {
    logger.warn({ err: scalerErr.message }, "[emailWorker] Auto-scaler failed to start (non-critical)");
}

module.exports = worker;
