/**
 * StripeEvent.js
 * v11.0 Hardening — Webhook Idempotency
 */
const mongoose = require("mongoose");
const stripeEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  correlationId: {
    type: String
  },
  processedAt: {
    type: Date,
    default: Date.now
  }
});

// Standardized single-field indexes
stripeEventSchema.index({
  eventId: 1
}, {
  unique: true
});
stripeEventSchema.index({
  correlationId: 1
});
stripeEventSchema.index({
  processedAt: 1
}, {
  expires: "30d"
});
const modelName = "StripeEvent";
module.exports = {
  modelName,
  schema: stripeEventSchema
};