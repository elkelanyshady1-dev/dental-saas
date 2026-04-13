/**
 * FailedEvent.model.js
 * AccountingDomain — Dead Letter Queue (DLQ)
 *
 * PURPOSE:
 *   Captures events that failed processing in the accountingDomain listeners.
 *   Acts as the DLQ (Dead Letter Queue) for the event pipeline.
 *
 * GUARANTEE:
 *   Every event that fails processing MUST be stored here.
 *   No event is lost. All failures are retryable.
 *
 * COLLECTION: accounting_failed_events
 * SCOPE: Per-org (written via org dbConnection — NOT global DB)
 *
 * RETRY POLICY:
 *   retryCount is incremented on each failed retry attempt.
 *   Events with retryCount >= MAX_RETRY_COUNT (3) are flagged as abandoned.
 *   Abandoned events require manual resolution.
 *
 * OBSERVABILITY:
 *   failedAt    — when the failure first occurred
 *   lastRetryAt — when the most recent retry was attempted
 *
 * PLANE: Org only
 *
 * @module accountingDomain/dlq/FailedEvent.model
 */

"use strict";

const mongoose = require("mongoose");

// Maximum auto-retry attempts before an event is flagged as abandoned
const MAX_RETRY_COUNT = 3;

const FailedEventSchema = new mongoose.Schema(
    {
        // Tenant scope
        orgId: {
            type: String,
            required: true,
            index: true,
        },

        // Event identity (from billingDomain emission)
        eventId: {
            type: String,
            required: true,
        },

        eventType: {
            type: String,
            required: true,
            enum: [
                "invoice.created",
                "payment.received",
                "refund.processed",
            ],
        },

        // Full payload snapshot for replay
        // Stored as Mixed (not validated) — preserves exactly what was received
        payload: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },

        // Error details
        error: {
            type: String,
            required: true,
        },

        errorStack: {
            type: String,
            default: null,
        },

        // Retry tracking
        retryCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Status lifecycle
        status: {
            type: String,
            enum: ["pending", "retrying", "abandoned"],
            default: "pending",
        },

        // Timestamps
        failedAt: {
            type: Date,
            default: Date.now,
        },

        lastRetryAt: {
            type: Date,
            default: null,
        },
    },
    {
        collection: "accounting_failed_events",
        timestamps: false,
    }
);

// Index: fast lookup by org + status for retry service
FailedEventSchema.index(
    { orgId: 1, status: 1, retryCount: 1 },
    { name: "dlq_retry_index" }
);

// Unique constraint: no duplicate DLQ entries for the same event
FailedEventSchema.index(
    { orgId: 1, eventId: 1, eventType: 1 },
    { unique: true, name: "dlq_unique_event" }
);

// Export both schema and constant
module.exports = FailedEventSchema;
module.exports.MAX_RETRY_COUNT = MAX_RETRY_COUNT;
