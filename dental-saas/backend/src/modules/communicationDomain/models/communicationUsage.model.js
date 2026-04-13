/**
 * communicationUsage.model.js
 * Phase v5.4 — Communication Quota Engine
 * 
 * Aggregate Root for tracking consumption per billing cycle.
 */

"use strict";

const mongoose = require("mongoose");

const communicationUsageSchema = new mongoose.Schema({
    // Per-org DB: kept for reference but NOT required.
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
    },
    billingCycleStart: {
        type: Date,
        required: true
    },
    billingCycleEnd: {
        type: Date,
        required: true
    },
    smsUsed: {
        type: Number,
        default: 0
    },
    whatsappUsed: {
        type: Number,
        default: 0
    },
    emailUsed: {
        type: Number,
        default: 0
    },
    overageChargesAccumulated: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: "USD"
    },
    version: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Per-org DB: unique per billing cycle per database
communicationUsageSchema.index({ billingCycleStart: 1 }, { unique: true });

const modelName = "CommunicationUsage";

module.exports = {
    modelName,
    schema: communicationUsageSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, communicationUsageSchema),
};
