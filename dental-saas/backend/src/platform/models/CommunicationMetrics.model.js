/**
 * CommunicationMetrics.model.js
 * Platform Domain — Communication Delivery Metrics
 * v1.0
 *
 * Time-bucketed delivery counters per channel and message type.
 * Updated atomically by workers on job completion and failure.
 *
 * PLANE: Platform / Infrastructure
 */
"use strict";

const mongoose = require("mongoose");

const communicationMetricsSchema = new mongoose.Schema(
    {
        // Channel: email | sms | whatsapp
        channel: {
            type: String,
            enum: ["email", "sms", "whatsapp"],
            required: true,
            index: true,
        },

        // Message type (PASSWORD_RESET, INVOICE, OTP, etc.) or "ALL" for totals
        type: {
            type: String,
            default: "ALL",
            index: true,
        },

        // Time bucket (hour-level granularity for time-series queries)
        // Note: indexed via TTL index below, not here (avoids duplicate index name)
        bucket: {
            type: Date,
            required: true,
        },

        // Counters — atomically incremented via $inc
        sent: { type: Number, default: 0, min: 0 },
        failed: { type: Number, default: 0, min: 0 },
        retried: { type: Number, default: 0, min: 0 },
        dlq: { type: Number, default: 0, min: 0 },
    },
    {
        timestamps: true,
        collection: "communicationMetrics",
    }
);

// Unique compound index — one document per channel+type+hour
communicationMetricsSchema.index(
    { channel: 1, type: 1, bucket: 1 },
    { unique: true }
);

// TTL: auto-delete metrics older than 365 days
communicationMetricsSchema.index({ bucket: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

/**
 * increment — atomic upsert for a metric counter
 *
 * @param {string} channel - email | sms | whatsapp
 * @param {string} type - message type or "ALL"
 * @param {"sent"|"failed"|"retried"|"dlq"} field - counter to increment
 */
communicationMetricsSchema.statics.increment = async function (channel, type, field) {
    const bucket = new Date();
    bucket.setMinutes(0, 0, 0); // floor to current hour

    await this.findOneAndUpdate(
        { channel, type, bucket },
        { $inc: { [field]: 1 } },
        { upsert: true, new: true }
    );

    // Also maintain an "ALL" types rollup
    if (type !== "ALL") {
        await this.findOneAndUpdate(
            { channel, type: "ALL", bucket },
            { $inc: { [field]: 1 } },
            { upsert: true, new: true }
        );
    }
};

const modelName = "CommunicationMetrics";

module.exports = {
    modelName,
    schema: communicationMetricsSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, communicationMetricsSchema),
};
