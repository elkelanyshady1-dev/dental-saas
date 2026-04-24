/**
 * SubscriptionMutationRecord.js
 * v11.1 Revenue Sovereignty — Mutation Ledger
 * 
 * Purpose: Anchor for financial idempotency and crash recovery.
 */
const mongoose = require("mongoose");
const subscriptionMutationRecordSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true
  },
  regionCode: {
    type: String,
    required: true,
    uppercase: true
  },
  type: {
    type: String,
    enum: ["CANCEL", "CREDIT_ADJUST", "REFUND", "DISPUTE"],
    required: true
  },
  stripeReferenceId: {
    type: String // Stripe Sub ID or Balance Transaction ID
  },
  idempotencyKey: {
    type: String,
    required: true
  },
  amountMinor: {
    type: Number,
    // For credit adjustments
    default: 0
  },
  status: {
    type: String,
    enum: ["PENDING", "COMPLETED", "FAILED"],
    default: "PENDING"
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlatformUser",
    required: true
  },
  correlationId: {
    type: String,
    required: true
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Compound index for reconciliation job
subscriptionMutationRecordSchema.index({
  organizationId: 1,
  status: 1
});
subscriptionMutationRecordSchema.index({
  createdAt: 1
});

// Standardized single-field indexes
subscriptionMutationRecordSchema.index({
  organizationId: 1
});
subscriptionMutationRecordSchema.index({
  stripeReferenceId: 1
});
subscriptionMutationRecordSchema.index({
  idempotencyKey: 1
}, {
  unique: true
});
subscriptionMutationRecordSchema.index({
  status: 1
});
subscriptionMutationRecordSchema.index({
  correlationId: 1
});

// Geopolitical Sovereignty Indexes (v13.0)
subscriptionMutationRecordSchema.index({
  regionCode: 1,
  createdAt: 1
});
subscriptionMutationRecordSchema.index({
  regionCode: 1,
  status: 1
});
subscriptionMutationRecordSchema.index({
  regionCode: 1,
  organizationId: 1
});
const modelName = "SubscriptionMutationRecord";
module.exports = {
  modelName,
  schema: subscriptionMutationRecordSchema
};
module.exports.subscriptionMutationRecordSchema = subscriptionMutationRecordSchema;