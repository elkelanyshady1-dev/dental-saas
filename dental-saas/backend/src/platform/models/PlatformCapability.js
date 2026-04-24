/**
 * PlatformCapability.js
 * Platform Plane — Sovereign Capability Model
 *
 * Stores platform-level capabilities as persistent records.
 * Used by the RBAC seeder and governance validators.
 *
 * Collection: platformcapabilities (plane-isolated)
 */

const mongoose = require("mongoose");
const PlatformCapabilitySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  plane: {
    type: String,
    default: "platform",
    enum: ["platform"]
  }
}, {
  collection: "platformcapabilities",
  timestamps: true
});
const modelName = "PlatformCapability";
module.exports = {
  modelName,
  schema: PlatformCapabilitySchema
};