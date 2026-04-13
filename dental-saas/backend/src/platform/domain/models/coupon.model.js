/**
 * coupon.model.js
 * Phase v6.1 — Coupon System
 */

"use strict";

const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
    code: { type: String, required: true },
    type: { type: String, enum: ["percentage", "fixed"], required: true },
    value: { type: Number, required: true }, // e.g., 20 for 20% or 50 for $50 fixed

    // Restrictions
    applicablePlans: [{ type: String }], // Optional: Array of plan codes this coupon can apply to
    applicableAddOns: [{ type: String }], // Optional: Array of addOn codes
    countries: [{ type: String }], // Optional: ISO country codes where this is valid

    // Usage Limitations
    maxUses: { type: Number, default: null }, // Null means unlimited
    usedCount: { type: Number, default: 0 },

    expiresAt: { type: Date },
    isActive: { type: Boolean, default: true },

    version: { type: Number, default: 1 } // OAV
}, { timestamps: true });

couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, expiresAt: 1 });

const modelName = "Coupon";

module.exports = {
    modelName,
    schema: couponSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, couponSchema),
};
