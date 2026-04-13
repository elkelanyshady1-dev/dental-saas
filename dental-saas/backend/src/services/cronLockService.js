const CronLock = require("../shared/models/CronLock").default;
const os = require("os");

const instanceId = `${process.pid}-${os.hostname()}`;

/**
 * Attempts to acquire a distributed lock for a background cron job.
 * Ensures the job executes exactly once across scaled node instances.
 * 
 * @param {string} jobName - Unique identifier for the job
 * @param {number} ttlMs - Time-to-live for the lock in milliseconds
 * @returns {boolean} - True if lock acquired, False otherwise
 */
exports.acquireLock = async (jobName, ttlMs) => {
    try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + ttlMs);

        const result = await CronLock.findOneAndUpdate(
            {
                jobName,
                $or: [
                    { expiresAt: { $lt: now } }, // Lock expired
                    { expiresAt: null }, // Never locked implicitly
                    { expiresAt: { $exists: false } }
                ]
            },
            {
                $set: {
                    expiresAt,
                    lockedBy: instanceId
                }
            },
            {
                returnDocument: "after",
                upsert: true,
                setDefaultsOnInsert: true
            }
        ).catch(err => {
            // E11000 duplicate key error means the query didn't match an expired lock, 
            // but the row exists, so someone else holds the lock.
            if (err.code === 11000) return null;
            throw err;
        });

        return !!result && result.lockedBy === instanceId;
    } catch (err) {
        logger.error({
            err,
            jobName,
            instanceId,
            service: "cronLockService",
            action: "acquire_fail"
        }, `[CronLock] Error acquiring lock for ${jobName}`);
        return false;
    }
};

/**
 * Releases a previously acquired lock before it naturally expires.
 * @param {string} jobName - Unique identifier for the job
 */
exports.releaseLock = async (jobName) => {
    try {
        await CronLock.findOneAndUpdate(
            { jobName, lockedBy: instanceId },
            { $set: { expiresAt: new Date(Date.now() - 1000), lockedBy: null } }
        );
    } catch (err) {
        console.error(`[CronLock] Error releasing lock for ${jobName}:`, err);
    }
};
