/**
 * Outbox.model.js — Transactional Event Outbox
 * Core Infrastructure — Event Durability
 *
 * Implements the Outbox Pattern to guarantee events are never lost
 * after DB commit. Events are written INSIDE the transaction, then
 * emitted by a background worker AFTER commit confirmation.
 *
 * PROBLEM SOLVED:
 * Without outbox: DB commits → app crashes → event lost forever.
 * With outbox: DB commits event record → worker emits → guaranteed delivery.
 *
 * INVARIANTS:
 * 1. Outbox records are written INSIDE the same MongoDB session/transaction
 * 2. Worker emits events only for "pending" records
 * 3. Processed records are retained for audit (7-day TTL)
 * 4. organizationId required for multi-tenant isolation
 *
 * PLANE: Cross-cutting infrastructure (used by Org Plane services).
 */

"use strict";

const mongoose = require("mongoose");

const outboxSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true,
        },

        // ─── Event Metadata ──────────────────────────────────────────
        eventType: {
            type: String,
            required: true,
        },
        aggregateType: {
            type: String,
            required: true,
            enum: ["invoice", "payment", "refund", "void", "wallet", "snapshot"],
        },
        aggregateId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },

        // ─── Event Payload ───────────────────────────────────────────
        payload: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },

        // ─── Processing State ────────────────────────────────────────
        status: {
            type: String,
            required: true,
            enum: ["pending", "processed", "failed"],
            default: "pending",
        },
        attempts: {
            type: Number,
            default: 0,
        },
        maxAttempts: {
            type: Number,
            default: 5,
        },
        lastError: {
            type: String,
        },
        processedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

// ─── Indexes ────────────────────────────────────────────────────────────────

// Worker poll: find pending events ordered by creation time
outboxSchema.index({ status: 1, createdAt: 1 });

// Deduplication: prevent double-creation within same transaction
outboxSchema.index(
    { organizationId: 1, eventType: 1, aggregateType: 1, aggregateId: 1 },
    { unique: true }
);

// Cleanup: auto-delete processed events after 7 days
outboxSchema.index(
    { processedAt: 1 },
    { expireAfterSeconds: 7 * 24 * 3600 }
);

const modelName = "Outbox";

module.exports = {
    modelName,
    schema: outboxSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, outboxSchema),
};
