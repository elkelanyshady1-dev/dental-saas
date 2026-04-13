/**
 * notification.worker.js
 * Processes "org-notifications" queue jobs and persists to DB.
 * 3-attempt retry with exponential backoff.
 * Non-fatal — failures are logged but never crash the process.
 *
 * AUDIT-008: DLQ integrated — writes exhausted jobs to notification.dlq.js.
 */

const { Worker } = require("bullmq");
const redisConnection = require("../../infrastructure/redis/redisClient");
const Notification = require("./notification.model");
const logger = require("@utils/logger");
const notificationDLQ = require("./dlq/notification.dlq");

const worker = new Worker(
    "org-notifications",
    async (job) => {
        const payload = job.data;

        // Guard: organizationId is required
        if (!payload?.organizationId) {
            logger.warn({ jobId: job.id }, "[Notification Worker] Missing organizationId — job skipped");
            return; // do not retry — data is invalid
        }

        await Notification.create({
            organizationId: payload.organizationId,
            userId: payload.userId || null,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            entityType: payload.entityType || null,
            entityId: payload.entityId || null,
            metadata: payload.metadata || {},
            priority: payload.priority || "normal",
        });

        logger.info(
            { jobId: job.id, type: payload.type, org: payload.organizationId },
            "[Notification Worker] Notification persisted"
        );
    },
    {
        connection: redisConnection,
        // Worker-level retry settings align with queue defaultJobOptions
    }
);

worker.on("failed", async (job, err) => {
    logger.error(
        { jobId: job?.id, err: err?.message, attempts: job?.attemptsMade },
        "[Notification Worker] Job failed after retries"
    );

    // AUDIT-008: Write to DLQ after all retries exhausted
    const maxAttempts = job?.opts?.attempts || 3;
    if ((job?.attemptsMade || 0) >= maxAttempts) {
        await notificationDLQ.write({ job, err });
    }

    // DO NOT rethrow — keeps the process alive
});

worker.on("error", (err) => {
    logger.error({ err: err?.message }, "[Notification Worker] Worker error");
});

module.exports = worker;
