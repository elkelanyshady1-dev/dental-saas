"use strict";

/**
 * MagicToken
 * Persistence for passwordless magic-link auth.
 *
 * Security:
 *   - Raw token NEVER stored. Only HMAC-SHA256(MAGIC_SECRET, token).
 *   - `expiresAt` has a TTL index — Mongo self-deletes expired records.
 *   - Records are also deleted on first successful verify (single-use).
 *
 * @per-plane Shared (cross-org lookup happens at verify time)
 */

const mongoose = require("mongoose");

const magicTokenSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        tokenHash: {
            type: String,
            required: true,
            // unique across the active window — prevents any collision between
            // concurrent magic links for the same email
            index: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            // TTL: document self-deletes when expiresAt passes
            index: { expires: 0 },
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

// Newest-first lookup by email (for rate-limiting & link regeneration)
magicTokenSchema.index({ email: 1, createdAt: -1 });

module.exports = { modelName: "MagicToken", schema: magicTokenSchema };
