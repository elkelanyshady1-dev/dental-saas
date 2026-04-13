const mongoose = require("mongoose");

const cronLockSchema = new mongoose.Schema({
    jobName: { type: String, required: true },
    expiresAt: { type: Date },
    lockedBy: { type: String }
});

// Index to ensure jobName uniqueness and quick lookup
cronLockSchema.index({ jobName: 1 }, { unique: true });
// TTL index to automatically remove dead locks
cronLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const modelName = "CronLock";

module.exports = {
    modelName,
    schema: cronLockSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, cronLockSchema),
};
