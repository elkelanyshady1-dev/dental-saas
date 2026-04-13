/**
 * aiAnalysis.queue.js
 * Phase 4 — Orthodontic Intelligence: AI Analysis BullMQ Queue
 *
 * Dispatches scan analysis jobs to Python AI engine workers.
 * Job flow: Node.js → BullMQ → Python worker → result stored in DB
 *
 * PLANE: Org — orthodontic module only
 */

"use strict";

const { Queue } = require("bullmq");
const redisConnection = require("@infra/redis/redisClient");
const logger = require("@utils/logger");

const AI_ANALYSIS_QUEUE_NAME = "aiAnalysisQueue";

const aiAnalysisQueue = new Queue(AI_ANALYSIS_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 10000       // 10s, 20s, 40s
        },
        removeOnComplete: { count: 200, age: 86400 },         // keep 200 or 24h
        removeOnFail: { count: 100, age: 604800 },            // keep 100 or 7d
        timeout: 300000                                         // 5 minute timeout per job
    }
});

aiAnalysisQueue.on("error", (err) => {
    logger.error({ err: err.message, queue: AI_ANALYSIS_QUEUE_NAME }, "[aiAnalysisQueue] Queue error");
});

/**
 * Enqueue a segmentation analysis job
 */
async function enqueueSegmentation({ scanFileId, organizationId, caseId, patientId, fileKey, modelVersion }) {
    const job = await aiAnalysisQueue.add(
        "segmentation",
        {
            type: "TOOTH_SEGMENTATION",
            scanFileId: String(scanFileId),
            organizationId: String(organizationId),
            caseId: String(caseId),
            patientId: String(patientId),
            fileKey,
            modelVersion: modelVersion || "latest",
            enqueuedAt: new Date().toISOString()
        }
    );

    logger.info(
        { jobId: job.id, scanFileId, caseId },
        "[aiAnalysisQueue] Segmentation job enqueued"
    );

    return job;
}

/**
 * Enqueue a cephalometric analysis job
 */
async function enqueueCephAnalysis({ scanFileId, organizationId, caseId, analysisType, modelVersion }) {
    const job = await aiAnalysisQueue.add(
        "ceph_analysis",
        {
            type: "CEPH_ANALYSIS",
            scanFileId: String(scanFileId),
            organizationId: String(organizationId),
            caseId: String(caseId),
            analysisType: analysisType || "lateral_ceph",
            modelVersion: modelVersion || "latest",
            enqueuedAt: new Date().toISOString()
        }
    );

    logger.info(
        { jobId: job.id, scanFileId, caseId },
        "[aiAnalysisQueue] Ceph analysis job enqueued"
    );

    return job;
}

module.exports = {
    aiAnalysisQueue,
    enqueueSegmentation,
    enqueueCephAnalysis,
    AI_ANALYSIS_QUEUE_NAME
};
