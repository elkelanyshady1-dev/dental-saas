/**
 * caseLink.queue.js
 * Domain: orthodontic-cases
 * Layer: Infrastructure > Queues
 *
 * REDIS: Single source of truth via src/infrastructure/redis/redisClient.js
 *   bullConnection = { connection: { host, port, password } }
 *   BullMQ accepts this shape directly — no duplication, no inline config.
 *
 * IDEMPOTENCY:
 *   jobId = `case-link:${appointmentId}` — BullMQ will reject duplicate
 *   enqueues for the same appointmentId (no-op, no error).
 *
 * SERIALIZATION RULE:
 *   Job payloads MUST contain only serializable primitives (strings).
 *   ❌ req.dbConnection — not serializable
 *   ✅ orgId, patientId, appointmentId — strings
 */

"use strict";

const { Queue } = require("bullmq");
const { bullConnection } = require("../../../../infrastructure/redis/redisClient");

const QUEUE_NAME = "clinical-case-link";

let _queue = null;

function getCaseLinkQueue() {
    if (!_queue) {
        _queue = new Queue(QUEUE_NAME, {
            ...bullConnection,
            defaultJobOptions: {
                attempts: 5,
                backoff:  { type: "exponential", delay: 2000 },
                removeOnComplete: true,  // clean up completed jobs immediately
                removeOnFail:     false, // keep failed jobs for inspection + replay
            },
        });

        _queue.on("error", (err) => {
            const logger = require("@utils/logger");
            logger.error({ err, queue: QUEUE_NAME }, "[CaseLinkQueue] Queue error");
        });
    }
    return _queue;
}

/**
 * enqueueCaseLink
 *
 * Enqueues a "link-appointment-to-case" job.
 * Idempotent: duplicate calls for the same appointmentId are no-ops.
 *
 * @param {Object} jobData
 * @param {string} jobData.appointmentId
 * @param {string} jobData.patientId
 * @param {string} jobData.orgId          — from req.context.organizationId
 * @param {string} [jobData.caseType]     — default: "comprehensive"
 */
async function enqueueCaseLink({ appointmentId, patientId, orgId, caseType = "comprehensive" }) {
    const queue = getCaseLinkQueue();

    await queue.add(
        "link-case",
        { appointmentId, patientId, orgId, caseType },
        {
            jobId: `case-link:${appointmentId}`, // ✅ KEEP — idempotency key
        }
    );
}

module.exports = { getCaseLinkQueue, enqueueCaseLink, QUEUE_NAME };
