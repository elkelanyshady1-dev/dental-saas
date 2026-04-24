/**
 * JournalRetry.model.js — Failed Journal Entry Retry Queue (MongoDB-backed)
 * Billing Domain — Ledger Hardening
 *
 * Stores journal write failures for automatic retry processing.
 * Uses MongoDB instead of Redis/BullMQ because:
 * 1. Journal failures often stem from DB issues — Redis may not help
 * 2. Retry payloads need the same durability guarantees as the ledger itself
 * 3. Simplifies the retry → journal pipeline (same transaction engine)
 *
 * INVARIANTS:
 * 1. Every failed journal write MUST be captured here
 * 2. completed entries are retained for audit (30-day TTL)
 * Tenant isolation is at the DB level (per-org database).
 *
 * PLANE: Org only.
 *
 * @per-org-transactional — Internal resilience model. Not exposed via HTTP.
 * All queries include explicit organizationId.
 */

"use strict";

const mongoose = require("mongoose");
const journalRetrySchema = new mongoose.Schema({
  // ─── Reference (links to source transaction) ──────────────────
  referenceType: {
    type: String,
    required: true,
    enum: ["invoice", "payment", "void", "refund", "wallet_credit"]
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // ─── Retry Payload ────────────────────────────────────────────
  /** Serialized arguments to reconstruct the journal entry */
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // ─── State Machine ────────────────────────────────────────────
  status: {
    type: String,
    required: true,
    enum: ["pending", "retrying", "completed", "failed", "dead"],
    default: "pending"
  },
  priority: {
    type: String,
    enum: ["high", "normal"],
    default: "normal"
  },
  // ─── Retry Tracking ───────────────────────────────────────────
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 10
  },
  lastError: {
    type: String
  },
  lastAttemptAt: {
    type: Date
  },
  nextRetryAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  // ─── Idempotency ─────────────────────────────────────────────
  /** Prevent processing the same failure twice */
  idempotencyKey: {
    type: String,
    required: true,
    unique: true
  }
}, {
  timestamps: true
});

// ─── Indexes ────────────────────────────────────────────────────────────────

// Worker poll: find pending/retrying jobs, high priority first, then oldest
journalRetrySchema.index({
  status: 1,
  priority: -1,
  nextRetryAt: 1
});

// Lookup by reference + unique constraint for upsert-based idempotency
journalRetrySchema.index({
  referenceType: 1,
  referenceId: 1
}, {
  unique: true
});

// TTL: auto-delete completed entries after 30 days
journalRetrySchema.index({
  completedAt: 1
}, {
  expireAfterSeconds: 30 * 24 * 3600
});
const modelName = "JournalRetry";
module.exports = {
  modelName,
  schema: journalRetrySchema
};