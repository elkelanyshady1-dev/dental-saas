"use strict";

/**
 * RateLimitEntry
 * DB-backed rate limiter for auth endpoints (OTP, magic link, password reset).
 *
 * No Redis dependency — uses MongoDB with TTL index for auto-cleanup.
 *
 * Fields:
 *   key       — Composite identifier (e.g. "otp:email:user@example.com")
 *   count     — Number of requests in the current window
 *   windowStart — When the current window began
 *   expiresAt — TTL index for auto-cleanup
 */

const mongoose = require("mongoose");

const rateLimitSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        count: {
            type: Number,
            default: 1,
        },
        windowStart: {
            type: Date,
            default: Date.now,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expireAfterSeconds: 0 },
        },
    },
    { timestamps: false }
);

module.exports = { modelName: "RateLimitEntry", schema: rateLimitSchema };
