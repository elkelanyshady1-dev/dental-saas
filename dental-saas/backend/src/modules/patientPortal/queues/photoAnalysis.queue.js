/**
 * photoAnalysis.queue.js
 * Phase 5 — Patient Portal: AI Photo Analysis BullMQ Queue
 *
 * Dispatches patient photo AI evaluation jobs.
 * Job flow: Node.js → BullMQ → Python AI worker → MonitoringSession update
 *
 * PLANE: Org — patient portal module only
 */

"use strict";

const { Queue } = require("bullmq");
const redisConnection = require("../../../infrastructure/redis/redisClient");
const logger = require("@utils/logger");

const PHOTO_ANALYSIS_QUEUE_NAME = "photoAnalysisQueue";

const photoAnalysisQueue = new Queue(PHOTO_ANALYSIS_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000        // 5s, 10s, 20s
        },
        removeOnComplete: { count: 300, age: 86400 },
        removeOnFail: { count: 100, age: 604800 },
        timeout: 120000         // 2 minute timeout per photo
    }
});

photoAnalysisQueue.on("error", (err) => {
    logger.error({ err: err.message, queue: PHOTO_ANALYSIS_QUEUE_NAME }, "[photoAnalysisQueue] Queue error");
});

/**
 * Enqueue a photo analysis job
 *
 * @param {object} payload
 * @param {string} payload.photoId
 * @param {string} payload.organizationId
 * @param {string} payload.patientId
 * @param {string} payload.caseId
 * @param {string} payload.monitoringSessionId
 * @param {string} payload.fileKey  — S3 key for the photo
 * @param {string} payload.photoType — front, left, right, etc.
 */
async function enqueuePhotoAnalysis({ photoId, organizationId, patientId, caseId, monitoringSessionId, fileKey, photoType }) {
    const job = await photoAnalysisQueue.add(
        "photo_analysis",
        {
            type: "PHOTO_ANALYSIS",
            photoId: String(photoId),
            organizationId: String(organizationId),
            patientId: String(patientId),
            caseId: String(caseId),
            monitoringSessionId: String(monitoringSessionId),
            fileKey,
            photoType,
            enqueuedAt: new Date().toISOString()
        }
    );

    logger.info(
        { jobId: job.id, photoId, caseId, photoType },
        "[photoAnalysisQueue] Photo analysis job enqueued"
    );

    return job;
}

module.exports = { photoAnalysisQueue, enqueuePhotoAnalysis, PHOTO_ANALYSIS_QUEUE_NAME };
