/**
 * redisLock.js
 * v11.0 Hardening — Multi-node Safety
 */
"use strict";

const Redis = require("ioredis");
const logger = require("./logger");
const { v4: uuidv4 } = require("uuid");

// Initialize Redis client (assuming REDIS_URL exists)
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

/**
 * acquireLock
 * @param {string} key - Lock identifier
 * @param {number} ttlMs - Duration in ms
 * @returns {string|null} - Token if acquired, null otherwise
 */
async function acquireLock(key, ttlMs = 30000) {
    const token = uuidv4();
    try {
        // SET key value NX PX ttl
        const result = await redis.set(key, token, "NX", "PX", ttlMs);
        if (result === "OK") {
            return token;
        }
        return null;
    } catch (err) {
        logger.error({ err, key }, "[RedisLock] Lock acquisition failed");
        return null;
    }
}

/**
 * releaseLock
 * @param {string} key - Lock identifier
 * @param {string} token - Token returned by acquireLock
 */
async function releaseLock(key, token) {
    if (!token) return;

    try {
        // Safety: Only delete if the token matches (Lua script)
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        await redis.eval(script, 1, key, token);
    } catch (err) {
        logger.error({ err, key }, "[RedisLock] Lock release failed");
    }
}

module.exports = {
    acquireLock,
    releaseLock,
    redis
};
