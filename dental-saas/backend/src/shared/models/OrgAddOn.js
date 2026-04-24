/**
 * OrgAddOn.js — Shared model definition for Org Add-On subscriptions.
 *
 * PLANE: Platform (lives in platform DB alongside OrgContract / PlatformInvoice).
 * This is the SINGLE SOURCE OF TRUTH for the OrgAddOn schema — all planes import
 * this definition and bind it to the appropriate connection via getModel().
 *
 * Phase v6.0 — Add-On Monetization Engine
 */

"use strict";

const mongoose = require("mongoose");

// ─── Billing Snapshot (v4 — Pricing Hardening) ───────────────────────────────
// Immutable record of what the pricing engine resolved at add-on purchase.
// Renewals MUST read from this snapshot — never re-resolve pricing on an
// already-purchased add-on, or an FX change could retroactively mutate it.
const billingSnapshotSchema = new mongoose.Schema({
  resolvedPrice: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true,
    uppercase: true
  },
  fxRate: {
    type: Number,
    default: null
  },
  provider: {
    type: String,
    required: true,
    enum: ["stripe", "paymob", "paypal", "manual"]
  },
  resolvedVia: {
    type: String,
    required: true,
    enum: ["global-usd", "fx-converted", "region", "override", "global"]
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  }
}, {
  _id: false
});
const orgAddOnSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true
  },
  addOnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AddOn",
    required: true
  },
  status: {
    type: String,
    enum: ["active", "cancelled", "expired"],
    default: "active"
  },
  // Billing details locked at purchase
  billingCycleStart: {
    type: Date,
    required: true
  },
  billingCycleEnd: {
    type: Date,
    required: true
  },
  currency: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  interval: {
    type: String,
    enum: ["monthly", "yearly"],
    default: "monthly"
  },
  stripeSubscriptionItemId: {
    type: String
  },
  // For Stripe syncing

  autoRenew: {
    type: Boolean,
    default: true
  },
  // v4 — Pricing hardening: immutable resolver output at purchase time.
  billingSnapshot: {
    type: billingSnapshotSchema,
    default: null
  },
  // v4 — Idempotency key (parallel to PlatformInvoice.idempotencyKey)
  // Format: "addon-checkout:<orgId>:<addOnId>:<billingInterval>"
  idempotencyKey: {
    type: String
  },
  version: {
    type: Number,
    default: 1
  } // Implicit OAV via field
}, {
  timestamps: true
});
orgAddOnSchema.index({
  idempotencyKey: 1
}, {
  unique: true,
  sparse: true
});
orgAddOnSchema.index({
  organizationId: 1,
  addOnId: 1,
  status: 1
});
orgAddOnSchema.index({
  organizationId: 1,
  billingCycleStart: 1
});
const modelName = "OrgAddOn";
module.exports = {
  modelName,
  schema: orgAddOnSchema
};