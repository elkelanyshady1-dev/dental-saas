const mongoose = require("mongoose");
const regionSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true
  },
  dbUri: {
    type: String,
    required: true
  },
  redisUrl: {
    type: String,
    required: true
  },
  // ── v13.0 Multi-Provider Keys ──
  // Per-region, per-provider API keys and webhook secrets
  providerKeys: {
    stripe: {
      secretKey: {
        type: String
      },
      webhookSecret: {
        type: String
      }
    },
    paymob: {
      apiKey: {
        type: String
      },
      webhookHmacKey: {
        type: String
      }
    }
  },
  // Legacy Stripe keys — kept for backward compat during migration
  stripeSecretKey: {
    type: String
  },
  stripeWebhookSecret: {
    type: String
  },
  auditRootHash: {
    type: String,
    default: "0"
  },
  status: {
    type: String,
    enum: ["ACTIVE", "MAINTENANCE", "DISABLED"],
    default: "ACTIVE",
    uppercase: true
  }
}, {
  timestamps: true
});

// Standardized single-field indexes (v13.2 compliance)
regionSchema.index({
  code: 1
}, {
  unique: true
});
const modelName = "Region";
module.exports = {
  modelName,
  schema: regionSchema
};