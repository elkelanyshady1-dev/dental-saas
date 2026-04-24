/**
 * VerificationToken.model.js
 * Shared Model — Unified Verification Token (v1.0)
 *
 * Single collection for all verification flows:
 *   PHONE_OTP      — Signup phone verification
 *   EMAIL_VERIFY   — Email address verification
 *   PASSWORD_RESET  — Password reset flow
 *   MAGIC_LOGIN    — Magic link authentication (future)
 *
 * Replaces (Phase 1: co-exists alongside):
 *   PhoneVerificationToken
 *   PasswordResetToken
 *
 * Security:
 *   - tokenHash stored via bcrypt(10) — NEVER store raw tokens
 *   - TTL index auto-prunes expired tokens
 *   - Max attempts per token (default 5)
 *   - Single-use enforcement via isUsed flag
 *
 * PLANE: Shared / Public
 */

"use strict";

const mongoose = require("mongoose");
const PURPOSES = ["PHONE_OTP", "EMAIL_VERIFY", "PASSWORD_RESET", "MAGIC_LOGIN"];
const CHANNELS = ["sms", "whatsapp", "email"];
const verificationTokenSchema = new mongoose.Schema({
  // Discriminator — which verification flow this token serves
  purpose: {
    type: String,
    enum: PURPOSES,
    required: true,
    index: true
  },
  // The entity being verified (phone E.164, email address, or userId string)
  identifier: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  // bcrypt hash of the OTP or token (NEVER store raw)
  tokenHash: {
    type: String,
    required: true
  },
  // Delivery channel used for this token
  channel: {
    type: String,
    enum: CHANNELS,
    required: true
  },
  // Expiration — enforced at query time AND via MongoDB TTL index
  expiresAt: {
    type: Date,
    required: true
  },
  // Verification attempt counter
  attempts: {
    type: Number,
    default: 0,
    min: 0
  },
  // Maximum allowed verification attempts per token
  maxAttempts: {
    type: Number,
    default: 5,
    min: 1
  },
  // Single-use enforcement
  isUsed: {
    type: Boolean,
    default: false,
    index: true
  },
  // Per-org DB mode: optional org scope (null for public/platform flows)
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization"
  },
  // Extensible metadata bag (pricingToken data, country, region, etc.)
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: "verificationtokens"
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Primary lookup: find latest unused token for an identifier + purpose
verificationTokenSchema.index({
  identifier: 1,
  purpose: 1,
  isUsed: 1,
  createdAt: -1
});

// Rate limiting query: count recent tokens per identifier + purpose
verificationTokenSchema.index({
  identifier: 1,
  purpose: 1,
  createdAt: -1
});

// TTL: MongoDB auto-deletes expired documents (expires: 0 means delete at expiresAt)
verificationTokenSchema.index({
  expiresAt: 1
}, {
  expireAfterSeconds: 0
});

// ─── Constants ────────────────────────────────────────────────────────────────

verificationTokenSchema.statics.PURPOSES = Object.freeze({
  PHONE_OTP: "PHONE_OTP",
  EMAIL_VERIFY: "EMAIL_VERIFY",
  PASSWORD_RESET: "PASSWORD_RESET",
  MAGIC_LOGIN: "MAGIC_LOGIN"
});
verificationTokenSchema.statics.CHANNELS = Object.freeze({
  SMS: "sms",
  WHATSAPP: "whatsapp",
  EMAIL: "email"
});
const modelName = "VerificationToken";
module.exports = {
  modelName,
  schema: verificationTokenSchema
};