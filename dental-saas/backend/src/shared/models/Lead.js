/**
 * Lead.js — Pre-Signup Lead Capture Model
 *
 * PLANE: Platform (global — no organizationId).
 * This model stores pre-signup inquiries from the public landing page.
 * Leads exist BEFORE an organization is created, hence no org scoping.
 *
 * Moved from organization/models/ to shared/models/ to clarify plane ownership.
 */
const mongoose = require("mongoose");
const leadSchema = new mongoose.Schema({
  source: {
    type: String // e.g., 'landing', 'pricing', 'demo'
  },
  status: {
    type: String,
    enum: ["new", "contacted", "converted"],
    default: "new"
  },
  name: {
    type: String
  },
  phone: {
    type: String
  },
  message: {
    type: String
  },
  organizationInterest: {
    type: String
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
leadSchema.index({
  createdAt: -1
});
leadSchema.index({
  phone: 1
});
const modelName = "Lead";
module.exports = {
  modelName,
  schema: leadSchema
};