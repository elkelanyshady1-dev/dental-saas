/**
 * SideEffectOutbox.model.js — Platform Side-Effect Outbox
 * Layer: Infrastructure > Models
 * Version: v25.0 — Outbox Hardening
 *
 * PURPOSE:
 *   Replaces ALL fire-and-forget `setImmediate(async () => { await dbWrite() })`
 *   patterns with a crash-safe, retry-safe, idempotent outbox queue.
 *
 * DIFFERENCE FROM EXISTING OUTBOXES:
 *   - core/outbox/Outbox.model.js     → Org-plane, requires organizationId + session
 *   - core/EventOutbox.model.js       → Emits to EventBus (in-process), not DB writes
 *   - THIS model                      → Platform-plane, executes DB side-effects
 *                                        (audit logs, billing timeline, ledger entries)
 *                                        Works WITH or WITHOUT a transaction session
 *
 * WHY A SEPARATE MODEL:
 *   Most setImmediate calls happen in CONTROLLERS (post-response) where no
 *   transaction session is available. These need fire-and-forget-safe persistence
 *   that doesn't require a session. The existing Outbox.model.js REQUIRES a session.
 *
 * PLANE: Platform (shared DB)
 * COLLECTION: sideeffectoutbox
 */

"use strict";

const mongoose = require("mongoose");

const sideEffectOutboxSchema = new mongoose.Schema(
    {
        // ── Event Identity ───────────────────────────────────────────────
        eventType: {
            type:     String,
            required: true,
            index:    true,
        },

        // Full payload for the handler
        payload: {
            type:     mongoose.Schema.Types.Mixed,
            required: true,
        },

        // ── Idempotency ──────────────────────────────────────────────────
        // Prevents duplicate execution. Format: "domain:aggregateId:action"
        // Example: "contract:abc123:activate"
        idempotencyKey: {
            type:   String,
            index:  true,
            sparse: true,
        },

        // ── Processing Lifecycle ─────────────────────────────────────────
        status: {
            type:    String,
            enum:    ["pending", "processing", "completed", "failed", "dead"],
            default: "pending",
            index:   true,
        },

        retryCount: {
            type:    Number,
            default: 0,
        },
        maxRetries: {
            type:    Number,
            default: 5,
        },

        // Lock timestamp — used by the worker to claim events atomically
        lockedAt: {
            type:    Date,
            default: null,
        },

        // When the event was successfully processed
        processedAt: {
            type:    Date,
            default: null,
        },

        // Last error message (for failed retries)
        error: {
            type:    String,
            default: null,
        },

        // ── Tracing ──────────────────────────────────────────────────────
        // Which service enqueued this event
        emitter: {
            type:    String,
            default: "unknown",
        },

        // Optional correlation ID
        correlationId: {
            type:    String,
            default: null,
        },
    },
    {
        timestamps:  true,
        collection:  "sideeffectoutbox",
    }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

// Worker poll: pending events ordered by creation time (FIFO)
sideEffectOutboxSchema.index({ status: 1, createdAt: 1 });

// Reconciliation: find stuck "processing" events older than timeout
sideEffectOutboxSchema.index({ status: 1, lockedAt: 1 });

// Idempotency: prevent duplicate events (sparse — only non-null keys)
sideEffectOutboxSchema.index(
    { idempotencyKey: 1 },
    { unique: true, sparse: true }
);

// Cleanup: auto-delete completed events after 7 days
sideEffectOutboxSchema.index(
    { processedAt: 1 },
    { expireAfterSeconds: 7 * 24 * 3600 }
);

// Dead letter: find permanently failed events for admin review
sideEffectOutboxSchema.index({ status: 1, retryCount: 1 });

module.exports = { modelName: "SideEffectOutbox", schema: sideEffectOutboxSchema };
