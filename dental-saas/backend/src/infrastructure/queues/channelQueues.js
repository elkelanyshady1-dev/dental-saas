/**
 * smsQueue.js + whatsappQueue.js
 * Platform Infrastructure — BullMQ Queues for SMS + WhatsApp
 * v1.0
 *
 * Structure per channel:
 *   smsQueue      → primary delivery queue (3 attempts, exponential backoff)
 *   smsDLQ        → dead-letter for exhausted SMS jobs
 *   whatsappQueue → primary delivery queue
 *   whatsappDLQ   → dead-letter for exhausted WhatsApp jobs
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const { Queue } = require("bullmq");
const redisConnection = require("../redis/redisClient");

// ─── Shared job defaults ───────────────────────────────────────────────────────
const DEFAULT_JOB_OPTIONS = {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }, // 5s → 10s → 20s
    removeOnComplete: { count: 200, age: 24 * 3600 },
    removeOnFail: { count: 100, age: 7 * 24 * 3600 },
};

// ─── SMS Queue ─────────────────────────────────────────────────────────────────
const SMS_QUEUE_NAME = "smsQueue";

const smsQueue = new Queue(SMS_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * enqueueSms
 * @param {string} type - e.g. "OTP", "APPOINTMENT_REMINDER", "GRACE_SMS"
 * @param {{ phone: string, [key: string]: any }} payload
 */
async function enqueueSms(type, payload) {
    return smsQueue.add(type, { type, payload }, {
        jobId: `sms-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
}

// ─── SMS Dead-Letter Queue ─────────────────────────────────────────────────────
const SMS_DLQ_NAME = "smsDLQ";

const smsDLQ = new Queue(SMS_DLQ_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 500, age: 30 * 24 * 3600 }, // keep 30 days
        removeOnFail: { count: 500, age: 30 * 24 * 3600 },
    },
});

// ─── WhatsApp Queue ───────────────────────────────────────────────────────────
const WHATSAPP_QUEUE_NAME = "whatsappQueue";

const whatsappQueue = new Queue(WHATSAPP_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

/**
 * enqueueWhatsapp
 * @param {string} type - e.g. "APPOINTMENT_CONFIRM", "PAYMENT_RECEIPT"
 * @param {{ phone: string, [key: string]: any }} payload
 */
async function enqueueWhatsapp(type, payload) {
    return whatsappQueue.add(type, { type, payload }, {
        jobId: `wa-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });
}

// ─── WhatsApp Dead-Letter Queue ───────────────────────────────────────────────
const WHATSAPP_DLQ_NAME = "whatsappDLQ";

const whatsappDLQ = new Queue(WHATSAPP_DLQ_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 500, age: 30 * 24 * 3600 },
        removeOnFail: { count: 500, age: 30 * 24 * 3600 },
    },
});

module.exports = {
    // SMS
    smsQueue,
    smsDLQ,
    SMS_QUEUE_NAME,
    SMS_DLQ_NAME,
    enqueueSms,
    // WhatsApp
    whatsappQueue,
    whatsappDLQ,
    WHATSAPP_QUEUE_NAME,
    WHATSAPP_DLQ_NAME,
    enqueueWhatsapp,
};
