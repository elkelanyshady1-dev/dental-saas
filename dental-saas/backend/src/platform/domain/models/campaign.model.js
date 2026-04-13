/**
 * campaign.model.js
 * Phase v6.2 — Promotional Campaigns
 */

"use strict";

const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema({
    name: { type: String, required: true },

    // Scope
    countryScope: [{ type: String }], // Array of ISO country codes
    appliesTo: { type: String, enum: ["plan", "addon", "all"], default: "plan" },
    planCodes: [{ type: String }], // Required if appliesTo is "plan"

    // Discount
    discountType: { type: String, enum: ["percentage", "fixed"], required: true },
    discountValue: { type: Number, required: true },

    // Timeframe
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    isActive: { type: Boolean, default: true },
    version: { type: Number, default: 1 } // OAV
}, { timestamps: true });

campaignSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
campaignSchema.index({ countryScope: 1 });

const modelName = "Campaign";

module.exports = {
    modelName,
    schema: campaignSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, campaignSchema),
};
