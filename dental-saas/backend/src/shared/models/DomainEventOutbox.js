/**
 * DomainEventOutbox.js
 * v11.2 Distributed Determinism — Transactional Outbox
 * 
 * Purpose: Guarantee "Exactly-Once" eventual emission of domain events
 * by persisting them as part of the core domain transaction.
 */
const mongoose = require("mongoose");
const domainEventOutboxSchema = new mongoose.Schema({
  regionCode: {
    type: String,
    required: true,
    uppercase: true
  },
  aggregateType: {
    type: String,
    required: true,
    enum: ["Subscription", "User", "Invoice", "Organization"]
  },
  aggregateId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  eventType: {
    type: String,
    required: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ["PENDING", "CLAIMED", "PROCESSED", "FAILED"],
    default: "PENDING"
  },
  retryCount: {
    type: Number,
    default: 0
  },
  claimedAt: {
    type: Date
  },
  claimedBy: {
    type: String
  },
  processedAt: {
    type: Date
  },
  correlationId: {
    type: String
  }
}, {
  timestamps: true
});

// Index for the processor job: Fetch oldest pending first
domainEventOutboxSchema.index({
  status: 1,
  createdAt: 1
});

// Standardized single-field indexes
domainEventOutboxSchema.index({
  aggregateType: 1
});
domainEventOutboxSchema.index({
  aggregateId: 1
});
domainEventOutboxSchema.index({
  eventType: 1
});
domainEventOutboxSchema.index({
  status: 1
});
domainEventOutboxSchema.index({
  claimedBy: 1
});
domainEventOutboxSchema.index({
  correlationId: 1
});

// Geopolitical Sovereignty Indexes (v13.0)
domainEventOutboxSchema.index({
  regionCode: 1,
  createdAt: 1
});
domainEventOutboxSchema.index({
  regionCode: 1,
  status: 1
});
const modelName = "DomainEventOutbox";
module.exports = {
  modelName,
  schema: domainEventOutboxSchema
};
module.exports.domainEventOutboxSchema = domainEventOutboxSchema;