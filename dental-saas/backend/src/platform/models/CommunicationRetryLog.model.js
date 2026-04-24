/**
 * CommunicationRetryLog.model.js
 * Platform Domain — Communication Retry + DLQ Analytics
 * v1.0
 *
 * Persists every job failure across all channels (email, sms, whatsapp).
 * Used by retry analytics API and admin Communication Center UI.
 *
 * PLANE: Platform / Infrastructure
 */
"use strict";

const mongoose = require("mongoose");
const communicationRetryLogSchema = new mongoose.Schema({
  // Channel identifier
  channel: {
    type: String,
    enum: ["email", "sms", "whatsapp"],
    required: true,
    index: true
  },
  // BullMQ job ID
  jobId: {
    type: String,
    required: true,
    index: true
  },
  // Email type (PASSWORD_RESET, GRACE, etc.) or SMS type (OTP, REMINDER)
  type: {
    type: String,
    default: null
  },
  // Recipient (email address, phone number)
  recipient: {
    type: String,
    default: null
  },
  // How many attempts were made when this log was written
  attempts: {
    type: Number,
    required: true,
    min: 1
  },
  // Max attempts configured on the job
  maxAttempts: {
    type: Number,
    default: null
  },
  // Whether this is a final exhaustion (all retries used up → DLQ)
  isDLQ: {
    type: Boolean,
    default: false,
    index: true
  },
  // Error message from the failed attempt
  error: {
    type: String,
    default: null
  },
  // Stack trace (dev/staging only — omit or truncate in prod)
  stack: {
    type: String,
    default: null
  },
  // Queue name (emailQueue, smsQueue, whatsappQueue, or DLQ variants)
  queueName: {
    type: String,
    default: null
  },
  // Raw job data snapshot for DLQ inspection
  jobData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  }
}, {
  timestamps: true,
  collection: "communicationRetryLogs"
});

// Compound index for analytics queries
communicationRetryLogSchema.index({
  channel: 1,
  createdAt: -1
});
communicationRetryLogSchema.index({
  isDLQ: 1,
  createdAt: -1
});
communicationRetryLogSchema.index({
  channel: 1,
  isDLQ: 1,
  createdAt: -1
});

// TTL: auto-delete retry logs older than 90 days
communicationRetryLogSchema.index({
  createdAt: 1
}, {
  expireAfterSeconds: 90 * 24 * 60 * 60
});
const modelName = "CommunicationRetryLog";
module.exports = {
  modelName,
  schema: communicationRetryLogSchema
};