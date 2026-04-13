/**
 * auditQueue.js
 * Platform Infrastructure — BullMQ Audit Queue
 * v1.0 — Sequential Processing per Organization
 */

"use strict";

const { Queue } = require("bullmq");
const redisConnection = require("../redis/redisClient");

const AUDIT_QUEUE_NAME = "audit-queue";

const auditQueue = new Queue(AUDIT_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: false,
    },
});

module.exports = {
    auditQueue,
    AUDIT_QUEUE_NAME,
};
