/**
 * SignupIdempotency.model.js
 * Public Plane — Signup Idempotency Protection
 * v24.0 — TASK-PLATFORM-RELIABILITY-HARDENING Phase 3
 *
 * PURPOSE:
 * Prevents duplicate organization creation when network retries cause the
 * same POST /public/signup request to arrive multiple times.
 *
 * PATTERN:
 *   1. Client sends Idempotency-Key header (UUID) with the signup request.
 *   2. Before processing signup, check if a SignupIdempotency record exists.
 *   3. If found → return the cached response (no DB mutation).
 *   4. If not → process signup, store the result in SignupIdempotency.
 *
 * TTL:
 *   Documents auto-expire after 24 hours via MongoDB TTL index.
 *   This is sufficient for network retry windows while preventing unbounded growth.
 *
 * PLANE: Public / Shared
 * COLLECTION: signupidempotency
 */

"use strict";

const mongoose = require("mongoose");
const signupIdempotencySchema = new mongoose.Schema({
  // Client-supplied idempotency key (typically UUID v4)
  idempotencyKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // Processing status
  status: {
    type: String,
    enum: ["processing", "completed", "failed"],
    default: "processing"
  },
  // Cached HTTP response (for replay)
  response: {
    statusCode: {
      type: Number
    },
    body: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  // Request fingerprint for safety validation
  requestFingerprint: {
    email: {
      type: String
    },
    slug: {
      type: String
    },
    phoneNumber: {
      type: String
    }
  },
  // Client metadata
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: "signupidempotency"
});

// TTL: auto-expire after 24 hours
signupIdempotencySchema.index({
  createdAt: 1
}, {
  expireAfterSeconds: 86400
});
const modelName = "SignupIdempotency";
module.exports = {
  modelName,
  schema: signupIdempotencySchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, signupIdempotencySchema)
};