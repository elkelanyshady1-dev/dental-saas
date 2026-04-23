/**
 * BondingSettings.model.js — Per-Organization Bonding Configuration
 *
 * Stores org-specific bracket brands, slot sizes, and default prescription.
 * One document per organization (upsert on settings update).
 */

"use strict";

const mongoose = require("mongoose");

const BondingSettingsSchema = new mongoose.Schema(
  {

    /** Available bracket brands for this org */
    brands: {
      type: [String],
      default: ["3M", "Ormco", "American Orthodontics", "Dentsply Sirona", "Forestadent", "GC"],
    },

    /** Slot sizes this org uses */
    slotSizes: {
      type: [String],
      default: ["0.022", "0.018"],
    },

    /** Default prescription applied when no explicit selection is made */
    defaultPrescription: {
      type: String,
      enum: ["MBT", "Roth", "Bidimensional", "Standard Edgewise", "Ricketts"],
      default: "MBT",
    },

    /** Default slot size */
    defaultSlot: {
      type: String,
      enum: ["0.022", "0.018"],
      default: "0.022",
    },

    /**
     * Failure rate threshold for alert display.
     * When debond rate across case > this value → UI shows warning.
     */
    debondAlertThreshold: {
      type: Number,
      default: 20, // percent
      min: 0,
      max: 100,
    },
  },
  { timestamps: true }
);

const modelName = "BondingSettings";

module.exports = {
  modelName,
  schema: BondingSettingsSchema,
  default:
    mongoose.models[modelName] ||
    mongoose.model(modelName, BondingSettingsSchema),
};
