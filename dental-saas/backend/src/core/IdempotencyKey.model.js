/**
 * IdempotencyKey.model.js
 * Domain: cross-cutting / request idempotency
 *
 * Stores one row per unique (Idempotency-Key, scope, organizationId) tuple.
 * The atomic upsert in idempotency.middleware lets concurrent duplicates
 * collapse to a single in-flight row (the loser receives 409 IN_FLIGHT).
 * On request completion the row is patched with the final status + cached
 * response body so any subsequent retry replays the same reply.
 *
 * TTL: 24h — the row is garbage-collected by Mongo after one day.
 * A longer retention would keep stale state around; shorter risks losing
 * the replay window for genuine client retries after a network partition.
 *
 * NOTE: lives on the PLATFORM (shared) database even though the data is
 *       conceptually tenant-scoped, because the idempotency middleware
 *       needs a single authoritative source across all tenant DBs without
 *       per-request connection switching. Defensive org-scope is enforced
 *       in the middleware (see idempotency.middleware.js).
 */

"use strict";

const mongoose = require("mongoose");

const idempotencyKeySchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            index: true,
            maxlength: 128,
        },
        scope: {
            type: String,
            required: true,
            maxlength: 128,
        },
        organizationId: {
            type: String,
            required: true,
            index: true,
            maxlength: 64,
        },
        userId: {
            type: String,
            default: null,
            maxlength: 64,
        },
        status: {
            type: String,
            enum: ["in-flight", "completed", "failed"],
            default: "in-flight",
            required: true,
        },
        response: {
            statusCode: { type: Number, default: null },
            body:       { type: mongoose.Schema.Types.Mixed, default: null },
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 86400,
        },
    },
    { minimize: false }
);

const modelName = "IdempotencyKey";

module.exports = {
    modelName,
    schema: idempotencyKeySchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, idempotencyKeySchema),
};
