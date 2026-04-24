/**
 * RevenueSnapshotProjection.js
 * v11.1 Revenue Sovereignty — Analytics Projection
 * 
 * Purpose: Optimized view of revenue metrics. Not the authority.
 * Must be derivable from source ledger tables.
 */
const mongoose = require("mongoose");
const SubscriptionMutationRecord = require("./SubscriptionMutationRecord.model");
const revenueSnapshotProjectionSchema = new mongoose.Schema({
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
  totalRevenueMinor: {
    type: Number,
    default: 0
  },
  refundTotalMinor: {
    type: Number,
    default: 0
  },
  disputeTotalMinor: {
    type: Number,
    default: 0
  },
  monthlyDeltaMinor: {
    type: Number,
    default: 0
  },
  refundRatio: {
    type: Number,
    default: 0 // Calculation: refundTotalMinor / totalRevenueMinor
  },
  currency: {
    type: String,
    required: true,
    default: "USD"
  },
  lastMutationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SubscriptionMutationRecord"
  },
  snapshotDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});
revenueSnapshotProjectionSchema.index({
  totalRevenueMinor: -1
});
revenueSnapshotProjectionSchema.index({
  organizationId: 1
}, {
  unique: true
});

// Geopolitical Sovereignty Indexes (v13.0)
revenueSnapshotProjectionSchema.index({
  regionCode: 1,
  snapshotDate: 1
});
revenueSnapshotProjectionSchema.index({
  regionCode: 1,
  organizationId: 1
});
const modelName = "RevenueSnapshotProjection";
module.exports = {
  modelName,
  schema: revenueSnapshotProjectionSchema
};
module.exports.revenueSnapshotProjectionSchema = revenueSnapshotProjectionSchema;