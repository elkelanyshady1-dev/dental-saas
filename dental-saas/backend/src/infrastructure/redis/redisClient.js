// redisClient.js

"use strict";

const Redis = require("ioredis");
const logger = require("../../utils/logger");

// ─── CONFIG ─────────────────────────────────────────

let redisConfig;

if (process.env.REDIS_URL) {
    redisConfig = process.env.REDIS_URL;
} else {
    redisConfig = {
        host: process.env.REDIS_HOST || "127.0.0.1",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        password: process.env.REDIS_PASSWORD || undefined,
    };
}

// ─── CLIENT (for general use) ───────────────────────

const redisClient = new Redis(redisConfig, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
});

// ─── EVENTS ─────────────────────────────────────────

redisClient.on("connect", () => {
    logger.info({ service: "redis" }, "[Redis] Connected");
});

redisClient.on("ready", () => {
    logger.info({ service: "redis" }, "[Redis] Ready");
});

redisClient.on("error", (err) => {
    logger.error({ service: "redis", err: err.message }, "[Redis] Connection error");

    if (process.env.NODE_ENV === "production") process.exit(1);
});

redisClient.on("close", () => {
    logger.warn({ service: "redis" }, "[Redis] Connection closed");
});

// ─── BULLMQ CONNECTION (IMPORTANT) ───────────────────

// BullMQ should NOT use the same instance
// it needs connection config, not client

const bullConnection = process.env.REDIS_URL
    ? { connection: process.env.REDIS_URL }
    : {
        connection: {
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.password,
        },
    };

// ─── EXPORTS ─────────────────────────────────────────

module.exports = {
    redisClient,     // for caching / pubsub
    bullConnection,  // for BullMQ queues/workers
};