const { Queue } = require("bullmq");
const redisConnection = require("../redis/redisClient");
const eventBus = require("../../core/eventBus");
const { COMMUNICATION_QUEUED } = require("../../core/domainEvents");

const communicationQueue = new Queue("communicationQueue", {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
    },
});

const addCommunicationJob = async (type, payload) => {
    const job = await communicationQueue.add(type, payload);
    eventBus.emit(COMMUNICATION_QUEUED, { jobId: job.id, type, organizationId: payload.organizationId });
    return job;
};

module.exports = { communicationQueue, addCommunicationJob };
