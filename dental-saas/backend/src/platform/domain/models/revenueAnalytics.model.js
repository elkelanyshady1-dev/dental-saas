/**
 * revenueAnalytics.model.js
 * Phase v6.5 — Revenue Analytics Engine
 */

"use strict";

const mongoose = require("mongoose");

const revenueAnalyticsSchema = new mongoose.Schema({
    month: { type: Number, required: true }, // 1-12
    year: { type: Number, required: true },
    countryCode: { type: String, required: true }, // uppercase ISO e.g. "US"

    totalRevenue: { type: Number, default: 0 },
    planRevenue: { type: Number, default: 0 },
    addOnRevenue: { type: Number, default: 0 },
    overageRevenue: { type: Number, default: 0 },
    taxCollected: { type: Number, default: 0 },
    netRevenue: { type: Number, default: 0 },

    // v8.2 Precision Extension (Minor Units)
    totalRevenueMinor: { type: Number, default: 0 },
    planRevenueMinor: { type: Number, default: 0 },
    addOnRevenueMinor: { type: Number, default: 0 },
    overageRevenueMinor: { type: Number, default: 0 },
    taxCollectedMinor: { type: Number, default: 0 },
    netRevenueMinor: { type: Number, default: 0 },

    currency: { type: String, required: true, default: "USD" },

    version: { type: Number, default: 1 } // OAV
}, { timestamps: true });

// Ensure uniqueness per month, year, and country
revenueAnalyticsSchema.index({ month: 1, year: 1, countryCode: 1 }, { unique: true });

const modelName = "RevenueAnalytics";

module.exports = {
    modelName,
    schema: revenueAnalyticsSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, revenueAnalyticsSchema),
};
