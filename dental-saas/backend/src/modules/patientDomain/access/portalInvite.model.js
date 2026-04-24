/**
 * portalInvite.model.js
 * Phase 6 — Portal Access System: Extended PortalInvite Model
 *
 * Supports:
 *   - Magic link login (type="magic_link")
 *   - Setup/onboarding link (type="setup_link")
 *   - OTP verification (type="otp")
 *   - WhatsApp/SMS/Email delivery channels
 *
 * SECURITY:
 *   - Token stored as SHA-256 hash ONLY (raw token NEVER persisted)
 *   - TTL index on expiresAt (auto-purge expired invites)
 *   - One-time use (usedAt marks consumption)
 *   - OTP brute-force protection (otpAttempts + lockedUntil)
 *
 * @per-org-transactional — portal invite model — organizationId required
 */

const mongoose = require("mongoose");
const portalInviteSchema = new mongoose.Schema({
  // ── Patient Reference ────────────────────────────────────────────
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  // ── Invite Type ──────────────────────────────────────────────────
  type: {
    type: String,
    enum: ["magic_link", "setup_link", "otp"],
    required: true,
    default: "magic_link"
  },
  // ── Token (SHA-256 hash — raw NEVER stored) ──────────────────────
  tokenHash: {
    type: String,
    required: true,
    index: true
  },
  // ── Expiry ───────────────────────────────────────────────────────
  expiresAt: {
    type: Date,
    required: true,
    index: {
      expires: 0
    } // TTL index — MongoDB auto-deletes after expiry
  },
  // ── One-Time Use ─────────────────────────────────────────────────
  usedAt: Date,
  // ── OTP Fields ───────────────────────────────────────────────────
  otpHash: String,
  otpExpiresAt: Date,
  otpAttempts: {
    type: Number,
    default: 0
  },
  lockedUntil: Date,
  // ── Contact Info ─────────────────────────────────────────────────
  email: String,
  // ── Delivery Channel ─────────────────────────────────────────────
  deliveryChannel: {
    type: String,
    enum: ["whatsapp", "sms", "email"]
  },
  // ── Metadata ─────────────────────────────────────────────────────
  metadata: {
    phone: String,
    email: String,
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    sentByName: String
  }
}, {
  timestamps: true
});

// ── Indexes ──────────────────────────────────────────────────────────────────
portalInviteSchema.index({
  tokenHash: 1
});
portalInviteSchema.index({
  patientId: 1,
  type: 1
});
portalInviteSchema.index({
  patientId: 1,
  otpHash: 1
});
const modelName = "PortalInvite";
module.exports = {
  modelName,
  schema: portalInviteSchema
};