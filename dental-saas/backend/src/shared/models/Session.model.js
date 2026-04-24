/**
 * Session.model.js — Cross-plane session index (S3)
 *
 * Stores the minimal mapping the refresh endpoint needs to derive a
 * user's tenant context WITHOUT trusting client-sent `organizationId`.
 *
 * Lives in the PLATFORM database on purpose: it's the only place a
 * single connection can see every org. Contents are intentionally
 * narrow — no permission snapshots, no access tokens, no PII. The
 * authoritative RefreshToken document still lives in the per-org DB;
 * this collection is a pure lookup table keyed by a server-generated
 * sessionId (UUID v4) that becomes a HttpOnly cookie value.
 *
 * Invariants:
 *   - sessionId is unique (enforced by index)
 *   - revokedAt != null => treat as gone (cookie won't verify)
 *   - expiresAt drives TTL index; Mongo auto-deletes the row
 *
 * Security posture:
 *   - tokenHash stored here is SHA-256 of the raw refresh token, same
 *     hash stored in the per-org RefreshToken collection. Keeping it
 *     here lets us detect a cookie-swapping attack where the sessionId
 *     cookie is paired with someone else's refreshToken cookie.
 *   - No field here ever goes into a JWT or any client-visible payload.
 *
 * PLANE: Platform DB (global lookup).
 */

"use strict";

const mongoose = require("mongoose");
const sessionSchema = new mongoose.Schema({
  // Server-generated opaque identifier — carried in the cookie.
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  // SHA-256 hash of the raw refresh token issued alongside this
  // session. Used for the cookie-pairing integrity check on refresh.
  tokenHash: {
    type: String,
    required: true,
    index: true
  },
  userAgent: {
    type: String
  },
  ipAddress: {
    type: String
  },
  expiresAt: {
    type: Date,
    required: true
  },
  revokedAt: {
    type: Date,
    default: null,
    index: true
  }
}, {
  timestamps: true
});

// Fast lookup pair matching (sessionId, tokenHash) during refresh.
sessionSchema.index({
  sessionId: 1,
  tokenHash: 1
});

// TTL: Mongo auto-purges expired session rows 1 hour after expiresAt.
sessionSchema.index({
  expiresAt: 1
}, {
  expireAfterSeconds: 3600
});
const modelName = "Session";
module.exports = {
  modelName,
  schema: sessionSchema
};