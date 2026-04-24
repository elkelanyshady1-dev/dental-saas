/**
 * Refund.model.js — Patient Refund Record
 * Billing Domain — Phase D (Refund Engine)
 *
 * Records the issuance of a refund against a previously collected payment.
 * A refund reverses a payment allocation and creates a corresponding
 * contra-revenue journal entry (DR Refunds / CR Cash).
 *
 * INVARIANTS:
 * 1. organizationId is required (multi-tenant)
 * 2. Cumulative refunds for a payment MUST NOT exceed payment amount
 * 3. Multiple partial refunds are allowed per payment
 * 4. status is immutable once set to "processed"
 * 5. All amounts use Money-safe integer minor units
 *
 * PLANE: Org only.
 *
 * @per-org-transactional — Created exclusively within refund.service.js
 * via transactional session with explicit organizationId.
 */

"use strict";

const mongoose = require("mongoose");
const refundSchema = new mongoose.Schema({
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Patient",
    required: true
  },
  // ─── Source References ─────────────────────────────────────────
  paymentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PatientPayment",
    required: true
  },
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PatientInvoice"
  },
  // ─── Amount ───────────────────────────────────────────────────
  amount: {
    type: Number,
    required: true,
    min: [0.01, "Refund amount must be positive"]
  },
  amountMinor: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isInteger,
      message: "amountMinor must be an integer (minor currency units)"
    }
  },
  currency: {
    type: String,
    required: true,
    default: "AED"
  },
  // ─── Metadata ─────────────────────────────────────────────────
  refundNumber: {
    type: Number,
    required: true,
    min: 1,
    comment: "Sequential refund number for this payment (1st partial, 2nd, etc.)"
  },
  reason: {
    type: String,
    required: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ["processed"],
    default: "processed",
    immutable: true
  },
  processedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Per-org DB: indexes optimized — no organizationId prefix needed.
refundSchema.index({
  patientId: 1
});
refundSchema.index({
  paymentId: 1
});
refundSchema.index({
  createdAt: -1
});
const modelName = "Refund";
module.exports = {
  modelName,
  schema: refundSchema
};