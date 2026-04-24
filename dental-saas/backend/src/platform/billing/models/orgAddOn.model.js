/**
 * orgAddOn.model.js
 * Phase v6.0 — Add-On Monetization Engine
 */

"use strict";

const mongoose = require("mongoose");
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
  version: {
    type: Number,
    default: 1
  } // Implicit OAV via field
}, {
  timestamps: true
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