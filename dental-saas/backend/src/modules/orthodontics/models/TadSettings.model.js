/**
 * TadSettings.model.js — Per-Organization TAD Brand Configuration
 *
 * One document per organization.
 * Brands are configurable — no hardcoded brands in the UI.
 */

"use strict";

const mongoose = require("mongoose");

const TadSettingsSchema = new mongoose.Schema(
  {
    brands: {
      type: [String],
      default: ["Ormco", "3M", "Dentsply", "Forestadent", "American Orthodontics"],
    },
    diameters: {
      type: [String],
      default: ["1.4mm", "1.6mm", "1.8mm", "2.0mm"],
    },
    lengths: {
      type: [String],
      default: ["6mm", "8mm", "10mm", "12mm"],
    },
    alertThresholds: {
      failureRateWarning: { type: Number, default: 20 },   // % — amber alert
      failureRateCritical: { type: Number, default: 40 },  // % — red alert
    },
  },
  { timestamps: true }
);

const modelName = "TadSettings";

module.exports = {
  modelName,
  schema: TadSettingsSchema,
  default: mongoose.models[modelName] || mongoose.model(modelName, TadSettingsSchema),
};
