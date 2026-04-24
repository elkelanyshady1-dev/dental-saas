"use strict";

const mongoose = require("mongoose");

/**
 * OtpRecord
 * Channel-aware OTP storage.
 *
 * `subject` holds the normalized identifier (E.164 phone for sms, lowercase
 * email for email). `channel` disambiguates collisions between an email and
 * a phone that happen to share a substring and is required in every lookup
 * alongside `subject`.
 *
 * OTP plaintext is never persisted — only an HMAC-SHA256 hash (see
 * otp.service.js → hashOtp).
 *
 * TTL: `expiresAt` carries a Mongo TTL index — records self-delete at expiry.
 */
const otpSchema = new mongoose.Schema(
    {
        subject: {
            type: String,
            required: true,
            index: true,
        },
        channel: {
            type: String,
            enum: ["sms", "email"],
            required: true,
            index: true,
        },
        otpHash: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expireAfterSeconds: 0 },
        },
        attempts: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

// Lookup path: findOne({ subject, channel }).sort({ createdAt: -1 })
otpSchema.index({ subject: 1, channel: 1, createdAt: -1 });

module.exports = { modelName: "OtpRecord", schema: otpSchema };
