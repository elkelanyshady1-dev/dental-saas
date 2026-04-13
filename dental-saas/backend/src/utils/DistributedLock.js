/**
 * DistributedLock.js
 * v11.2 Distributed Determinism — Redis Lock Manager
 */
const Redis = require("ioredis");
const crypto = require("crypto");
const logger = require("./logger");

// Use env for Redis URL or fallback to local
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

class DistributedLock {
    constructor() {
        this.redis = new Redis(REDIS_URL, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            retryStrategy(times) {
                const delay = Math.min(times * 100, 3000);
                return delay;
            }
        });

        this.redis.on("error", (err) => {
            logger.error({ err }, "Redis DistributedLock Error");
        });

        // Dedicated subscriber connection for blocking operations
        this.subscriber = new Redis(REDIS_URL, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            retryStrategy: () => 1000
        });

        this.subscriber.on("error", (err) => {
            logger.error({ err }, "Redis Subscriber Error");
        });
    }

    /**
     * publish
     * Wrapper for redis.publish
     */
    async publish(channel, message) {
        try {
            return await this.redis.publish(channel, message);
        } catch (err) {
            logger.error({ err, channel }, "Failed to publish Redis message");
            return 0;
        }
    }

    /**
     * subscribeWithTimeout
     * Subscribes to a channel and waits for the first message or timeout.
     */
    async subscribeWithTimeout(channel, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            let timer;
            const cleanup = () => {
                clearTimeout(timer);
                this.subscriber.unsubscribe(channel).catch(() => { });
                this.subscriber.removeListener("message", onMessage);
            };

            const onMessage = (chan, msg) => {
                if (chan === channel) {
                    cleanup();
                    resolve(msg);
                }
            };

            timer = setTimeout(() => {
                cleanup();
                resolve(null); // Timeout results in null to trigger fallback
            }, timeoutMs);

            this.subscriber.on("message", onMessage);
            this.subscriber.subscribe(channel)
                .catch(err => {
                    cleanup();
                    reject(err);
                });
        });
    }

    /**
     * acquire
     * SET key token NX PX ttlMs
     */
    async acquire(key, ttlMs = 15000) {
        const token = crypto.randomBytes(16).toString("hex");
        try {
            const result = await this.redis.set(key, token, "PX", ttlMs, "NX");
            if (result === "OK") {
                return token;
            }
            return null;
        } catch (err) {
            logger.error({ err, key }, "Failed to acquire Redis lock");
            return null;
        }
    }

    /**
     * release
     * Lua script: delete only if value === token
     */
    async release(key, token) {
        if (!token) return false;

        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;

        try {
            const result = await this.redis.eval(script, 1, key, token);
            return result === 1;
        } catch (err) {
            logger.error({ err, key }, "Failed to release Redis lock");
            return false;
        }
    }

    /**
     * Helper to close connection
     */
    async disconnect() {
        await this.redis.quit();
    }
}

// Export singleton
module.exports = new DistributedLock();
