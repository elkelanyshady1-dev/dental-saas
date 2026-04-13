const { Worker } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const eventBus = require("../../core/eventBus");
const { COMMUNICATION_SENT, COMMUNICATION_FAILED } = require("../../core/domainEvents");
const logger = require("../../utils/logger");

const worker = new Worker("communicationQueue", async (job) => {
    const { name: type, data: payload } = job;
    try {
        // Provider logic would go here
        logger.info({ type, to: payload.to }, "Processing communication job");

        eventBus.emit(COMMUNICATION_SENT, {
            jobId: job.id,
            type,
            organizationId: payload.organizationId,
            recipient: payload.to
        });
    } catch (error) {
        eventBus.emit(COMMUNICATION_FAILED, {
            jobId: job.id,
            type,
            organizationId: payload.organizationId,
            error: error.message
        });
        throw error;
    }
}, { connection: redisConnection });

module.exports = worker;
