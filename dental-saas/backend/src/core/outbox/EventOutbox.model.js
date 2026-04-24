/**
 * EventOutbox.model.js — Transactional Event Outbox Model Definition
 * Core Infrastructure — Event Durability
 *
 * Exports a modelDef compatible with getModel() for per-tenant DB resolution.
 * This is the canonical outbox schema used by the OutboxWorker.
 *
 * USAGE:
 *   const getModel = require("@core/db/getModel");
 *   const EventOutboxDef = require("./EventOutbox.model");
 *   const Outbox = getModel(dbConnection, EventOutboxDef);
 *
 * PLANE: Core Infrastructure (cross-cutting)
 */

"use strict";

const mongoose = require("mongoose");

const EventOutboxSchema = new mongoose.Schema(
    {
        // organizationId is OPTIONAL on this (now-unified) canonical schema.
        // Billing-aggregate events set it; generic cross-cutting events
        // (e.g. PATIENT_CREATED written into a per-tenant DB) omit it because
        // the org is already implicit in the DB connection. Keep it indexed
        // because billing-plane queries still filter on it.
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            required: false,
            index: true,
        },

        // ─── Event Metadata ──────────────────────────────────────────
        eventType: {
            type: String,
            required: true,
        },
        // aggregateType / aggregateId are OPTIONAL — only billing-domain
        // emits populate them. The enum was widened to a sentinel "generic"
        // so non-billing callers don't have to lie about their aggregate.
        aggregateType: {
            type: String,
            required: false,
            enum: ["invoice", "payment", "refund", "void", "wallet", "snapshot", "generic"],
        },
        aggregateId: {
            type: mongoose.Schema.Types.ObjectId,
            required: false,
        },

        // Logical name of the emitting service — kept for observability and
        // for parity with the old legacy schema (see eventBus.emitViaOutbox).
        emitter: {
            type: String,
            default: "unknown",
        },

        // ─── Event Payload ───────────────────────────────────────────
        payload: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },

        // ─── Processing State ────────────────────────────────────────
        // status index is declared below via schema.index() (compound form).
        // Do NOT add `index: true` here — it would duplicate the compound indexes.
        status: {
            type: String,
            required: true,
            enum: ["pending", "processing", "processed", "failed"],
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

        // ─── Error History (append-only per attempt) ─────────────────
        // Every handler failure appends one entry. The last error is
        // always errorMessage; this array gives the full chain.
        errorHistory: [
            {
                _id: false,
                message: { type: String, required: true },
                stack:   { type: String },            // dev only
                at:      { type: Date,   required: true },
            },
        ],

        // ─── Replay / Retry Scheduling ───────────────────────────────
        nextRetryAt: {
            type: Date,
        },

        // ─── DLQ Marker Fields (populated when status = "failed") ────
        failedAt: {
            type: Date,
        },
        // Short machine-readable reason the event was sent to the DLQ.
        // Simpler counterpart to `failureReason`/`failureCategory`; used by
        // the worker when the retry ceiling is hit ("max_retries_exceeded").
        // Dead events MUST NEVER be reclaimed or reprocessed — the reclaim
        // query filters strictly on status="processing", and status="failed"
        // is the terminal state.
        dlqReason: {
            type: String,
        },
        failureReason: {
            type: String, // fine-grained, free-form enum (e.g. "STRIPE_TIMEOUT")
        },
        failureCategory: {
            type: String,
            enum: [
                "SYSTEM_ERROR",
                "VALIDATION_ERROR",
                "DEPENDENCY_ERROR",
                "TIMEOUT",
                "UNHANDLED_EVENT",
                "POISON_EVENT",
                "SECURITY_BLOCKED",
            ],
        },
        errorMessage: {
            type: String,
        },
        errorStack: {
            type: String, // dev only — never exposed by API DTOs
        },
        lastAttemptAt: {
            type: Date, // written on every atomic claim — used for stuck-processing reclaim
        },
        retryCount: {
            type: Number, // snapshot of `attempts` at DLQ entry
        },
        maxRetries: {
            type: Number, // snapshot of `maxAttempts` at DLQ entry
        },
        correlationId: {
            type: String,
        },

        // ─── DLQ Metadata ────────────────────────────────────────────
        dlq: {
            enteredAt: { type: Date },
            isQuarantined: { type: Boolean, default: false },
            replayCount: { type: Number, default: 0 },
            lastReplayedAt: { type: Date, default: null },
            replayHistory: [
                {
                    _id: false,
                    replayedAt: { type: Date, required: true },
                    actorId: { type: String, required: true },
                    mode: {
                        type: String,
                        enum: ["manual", "auto"],
                        required: true,
                    },
                    result: {
                        type: String,
                        enum: ["pending", "success", "failed"],
                        required: true,
                    },
                },
            ],
        },
    },
    {
        timestamps: true,
    }
);

// ─── DLQ Indexes ─────────────────────────────────────────────────────────────

// Fast DLQ inspection queries (Platform dashboard)
EventOutboxSchema.index({ status: 1, failureCategory: 1, failedAt: -1 });
EventOutboxSchema.index({ status: 1, "dlq.enteredAt": -1 });
EventOutboxSchema.index({ correlationId: 1 }, { sparse: true });

// ─── Indexes ─────────────────────────────────────────────────────────────────

// ─── Worker / Reclaim / Retry Indexes ────────────────────────────────────────
// These compound indexes serve the hot worker query paths. All four are
// anchored on `status` so Mongo can prune by lifecycle bucket first, then
// seek by the discriminator. Keep them in lock-step with outbox.worker.js
// and replayEngine.js — any new status-filtered query should be backed by
// one of these.

// Worker poll: find pending events ordered by creation time (multi-instance safe).
EventOutboxSchema.index({ status: 1, createdAt: 1 });

// Retry-ceiling checks / DLQ triage queries (status + attempts).
EventOutboxSchema.index({ status: 1, attempts: 1 });

// Stuck-processing reclaim — replayEngine.reclaimStuckProcessing() filters
// { status: "processing", lastAttemptAt: { $lt: cutoff } }. `lastAttemptAt`
// is the canonical "lock time" in this schema (equivalent to `lockedAt` in
// the spec); it is written atomically on every claim by outbox.worker.js.
EventOutboxSchema.index({ status: 1, lastAttemptAt: 1 });

// Delayed retry scheduling (status + nextRetryAt).
EventOutboxSchema.index({ status: 1, nextRetryAt: 1 });

// DLQ chronology — spec-required shape. Duplicates the prefix of the
// compound index above (`status + failureCategory + failedAt`) but lets
// queries that don't filter on failureCategory hit an index directly.
EventOutboxSchema.index({ status: 1, failedAt: 1 });

// Deduplication: prevent double-creation within same transaction.
// `sparse` because aggregateType/aggregateId are now optional (generic
// cross-cutting events omit them) — without sparse, Mongo would reject
// multiple generic events whose aggregate fields are all null.
EventOutboxSchema.index(
    { organizationId: 1, eventType: 1, aggregateType: 1, aggregateId: 1 },
    { unique: true, sparse: true }
);

// Cleanup: auto-delete processed events after 7 days
EventOutboxSchema.index(
    { processedAt: 1 },
    { expireAfterSeconds: 7 * 24 * 3600 }
);

// ─── Model Definition (getModel-compatible) ───────────────────────────────────

const modelName = "EventOutbox";

module.exports = {
    modelName,
    schema: EventOutboxSchema,
};
