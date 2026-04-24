/**
 * KashierEvent.js
 * Phase 2 — Kashier webhook idempotency record.
 *
 * Mirrors StripeEvent.js. Stores every successfully-processed Kashier webhook
 * event so retries land as no-ops instead of double-activating subscriptions.
 *
 * TTL: 30 days (matches StripeEvent). Providers do not retry beyond that.
 */

"use strict";

const mongoose = require("mongoose");
const kashierEventSchema = new mongoose.Schema({
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
kashierEventSchema.index({
  eventId: 1
}, {
  unique: true
});
kashierEventSchema.index({
  correlationId: 1
});
kashierEventSchema.index({
  processedAt: 1
}, {
  expires: "30d"
});
const modelName = "KashierEvent";
module.exports = {
  modelName,
  schema: kashierEventSchema
};