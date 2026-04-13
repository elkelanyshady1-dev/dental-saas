/**
 * notification.queue.js
 * BullMQ queue for async notification persistence.
 * Mirrors communication.queue.js patterns.
 */

const { Queue } = require("bullmq");
const redisConnection = require("../../infrastructure/redis/redisClient");

const notificationQueue = new Queue("org-notifications", {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false, // keep failed jobs for inspection
    },
});

/**
 * Push a notification job to the queue.
 * @param {Object} payload - Must include organizationId, type, title, message
 * @returns {Promise<Job>}
 */
const addNotificationJob = async (payload) => {
    const job = await notificationQueue.add("persist-notification", payload);
    return job;
};

module.exports = { notificationQueue, addNotificationJob };
