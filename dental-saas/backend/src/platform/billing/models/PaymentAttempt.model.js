/**
 * PaymentAttempt.model.js
 * Platform Billing — Individual Payment Attempt Record
 *
 * PURPOSE:
 * PlatformInvoice only stores the CURRENT payment state.
 * PaymentAttempt stores every individual charge attempt, enabling:
 *   - Full retry history visibility
 *   - Per-attempt error code tracking
 *   - Dunning forensics
 *   - Provider-level payment audit trail
 *
 * Written by:
 *   canonicalEventProcessor.js (payment.succeeded, payment.failed, refund.completed, dispute.created)
 *   paymentApplicationService.js (v21.0: manual payment engine)
 *   contractLifecycleService.js (v21.0: refund reversal)
 *
 * PLANE: Platform
 * COLLECTION: paymentattempts
 */

"use strict";

const mongoose = require("mongoose");
const paymentAttemptSchema = new mongoose.Schema({
  // ── References ────────────────────────────────────────────────────────
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlatformInvoice",
    required: true
  },
  contractId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrgContract",
    default: null
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true
  },
  // ── Provider Details ──────────────────────────────────────────────────
  provider: {
    type: String,
    enum: ["stripe", "paymob", "paypal", "manual"],
    required: true
  },
  providerPaymentId: {
    type: String,
    default: null
    // Indexed below (sparse) — null for manual attempts
  },
  providerEventId: {
    type: String,
    default: null
    // The provider's canonical event ID (e.g. evt_xxx)
  },
  // ── Financial Fields ──────────────────────────────────────────────────
  amount: {
    type: Number,
    required: true,
    default: 0
  },
  currency: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  // ── Attempt Status ────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ["initiated", "authorized", "captured", "failed", "refunded", "disputed"],
    required: true,
    default: "initiated"
  },
  // ── Payment Method ────────────────────────────────────────────────────
  // v21.0 — First-class field for analytics and operator workflow.
  //   card         — Credit/debit card via provider
  //   bank         — Bank transfer / wire
  //   cash         — Cash payment (in-person)
  //   manual       — Manual entry by platform operator
  method: {
    type: String,
    enum: ["card", "bank", "cash", "manual"],
    default: "manual"
  },
  // ── v21.1: Idempotency Key ────────────────────────────────────────────
  // Client-supplied deduplication key (Idempotency-Key HTTP header).
  // If a second request arrives with the same key, the original attempt
  // is returned without creating a duplicate charge.
  // sparse: true on the unique index — null keys don't collide.
  idempotencyKey: {
    type: String,
    default: null
  },
  // ── Retry Sequence ────────────────────────────────────────────────────
  // 1 = first attempt, 2 = first retry, etc.
  attemptNumber: {
    type: Number,
    default: 1,
    min: 1
  },
  // ── Failure Details ────────────────────────────────────────────────────
  errorCode: {
    type: String,
    default: null // e.g. "card_declined", "insufficient_funds"
  },
  errorMessage: {
    type: String,
    default: null
  },
  // ── Request Tracing ───────────────────────────────────────────────────
  requestId: {
    type: String,
    default: null
    // Indexed below (sparse) for end-to-end correlation
  },
  // ── Metadata ─────────────────────────────────────────────────────────
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: {
    createdAt: true,
    updatedAt: false
  },
  // append-style — no updates expected
  collection: "paymentattempts"
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
paymentAttemptSchema.index({
  invoiceId: 1,
  createdAt: -1
}); // Per-invoice history
paymentAttemptSchema.index({
  organizationId: 1,
  createdAt: -1
}); // Per-org history
paymentAttemptSchema.index({
  providerPaymentId: 1
}, {
  sparse: true
}); // Provider lookup
paymentAttemptSchema.index({
  requestId: 1
}, {
  sparse: true
}); // End-to-end tracing
paymentAttemptSchema.index({
  status: 1,
  createdAt: -1
}); // Status-based scans
paymentAttemptSchema.index({
  provider: 1,
  createdAt: -1
}); // Provider analytics
paymentAttemptSchema.index({
  method: 1,
  createdAt: -1
}); // v21.0: method analytics
paymentAttemptSchema.index(
// v21.1: idempotency
{
  idempotencyKey: 1
}, {
  unique: true,
  sparse: true,
  name: "payment_idempotency_key"
});
const modelName = "PaymentAttempt";
module.exports = {
  modelName,
  schema: paymentAttemptSchema
};