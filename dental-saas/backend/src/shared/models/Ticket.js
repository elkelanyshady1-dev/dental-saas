/**
 * Ticket.js
 * v9.1 Customer Support Engine
 */

"use strict";

const mongoose = require("mongoose");
const ticketSchema = new mongoose.Schema({
  // Per-org DB mode: kept for reference/audit but NOT required.
  // Database isolation (dental_org_<orgId>) is the tenant boundary.
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    index: true
  },
  regionCode: {
    type: String,
    required: true,
    uppercase: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlatformUser"
  },
  category: {
    type: String,
    enum: ["technical", "billing", "security", "subscription", "dispute"],
    required: true,
    lowercase: true
  },
  priority: {
    type: String,
    enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
    default: "MEDIUM",
    uppercase: true
  },
  status: {
    type: String,
    enum: ["OPEN", "IN_REVIEW", "WAITING_CUSTOMER", "ESCALATED", "RESOLVED", "CLOSED", "REJECTED"],
    default: "OPEN",
    uppercase: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  linkedInvoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BillingInvoice"
  },
  linkedSubscriptionId: {
    type: String // Provider subscription ID (e.g. Stripe sub_xxx)
  },
  linkedMutationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SubscriptionMutationRecord"
  },
  // v13.0 — Provider-agnostic dispute ID
  providerDisputeId: {
    type: String // e.g. Stripe: dp_xxx | Paymob: dispute_ref
  },
  slaDeadline: {
    type: Date,
    required: true
  },
  breachFlag: {
    type: Boolean,
    default: false
  },
  escalationLevel: {
    type: Number,
    default: 1 // L1
  },
  financialImpactMinor: {
    type: Number,
    default: 0
  },
  conversationThread: [{
    actorId: mongoose.Schema.Types.ObjectId,
    actorType: {
      type: String,
      enum: ["platform_user", "tenant_user", "system"]
    },
    message: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  internalNotes: [{
    actorId: mongoose.Schema.Types.ObjectId,
    // Always platform_user
    note: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  resolvedAt: {
    type: Date
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// OAV Enforcer
ticketSchema.pre("save", function () {
  if (this.isModified()) {
    this.version += 1;
  }
});

// Per-org DB: indexes optimized for per-database queries.
// organizationId compound indexes REMOVED — DB isolation handles tenant scoping.
ticketSchema.index({
  createdAt: -1
});
ticketSchema.index({
  status: 1
});
ticketSchema.index({
  assignedTo: 1
});
ticketSchema.index({
  linkedInvoiceId: 1
});
ticketSchema.index({
  linkedSubscriptionId: 1
});
ticketSchema.index({
  linkedMutationId: 1
});
ticketSchema.index({
  providerDisputeId: 1
}, {
  unique: true,
  sparse: true
});
ticketSchema.index({
  slaDeadline: 1
});
ticketSchema.index({
  breachFlag: 1
});
ticketSchema.index({
  escalationLevel: 1
});
ticketSchema.index({
  regionCode: 1,
  createdAt: 1
});
ticketSchema.index({
  regionCode: 1,
  status: 1
});
const modelName = "Ticket";
module.exports = {
  modelName,
  schema: ticketSchema
};
module.exports.ticketSchema = ticketSchema;