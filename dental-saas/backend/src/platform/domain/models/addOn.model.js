/**
 * addOn.model.js
 * Phase v6.0 — Add-On Monetization Engine
 */

"use strict";

const mongoose = require("mongoose");
const addOnSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  // e.g. "EXTRA_SMS_1000", "EXTRA_USERS_5"
  description: {
    type: String
  },
  // Type of benefit
  type: {
    type: String,
    enum: ["QUOTA", "LIMIT", "FEATURE"],
    required: true
  },
  // Benefit definition
  // For QUOTA/LIMIT: { "smsQuota": 1000 } or { "maxUsers": 5 }
  // For FEATURE: { "orthodonticsAdvanced": true }
  benefits: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  pricing: {
    baseCurrency: {
      type: String,
      default: "USD"
    },
    regions: [{
      regionCode: {
        type: String,
        required: true
      },
      countries: [{
        type: String
      }],
      currency: {
        type: String,
        required: true
      },
      monthly: {
        type: Number,
        required: true
      },
      yearly: {
        type: Number,
        required: true
      },
      // ── v13.0 Multi-Provider Price IDs (replaces stripePriceId*) ──
      providerPriceIds: {
        stripe: {
          monthly: {
            type: String
          },
          yearly: {
            type: String
          }
        },
        paymob: {
          monthly: {
            type: String
          },
          yearly: {
            type: String
          }
        }
      }
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  version: {
    type: Number,
    default: 1
  } // OAV
}, {
  timestamps: true
});
addOnSchema.index({
  code: 1
}, {
  unique: true
});
const modelName = "AddOn";
module.exports = {
  modelName,
  schema: addOnSchema
};