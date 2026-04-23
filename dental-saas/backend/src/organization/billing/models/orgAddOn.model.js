/**
 * orgAddOn.model.js
 * Phase v6.0 — Add-On Monetization Engine
 */

"use strict";

const mongoose = require("mongoose");

const orgAddOnSchema = new mongoose.Schema({
    // organizationId removed (Step 5c Commit 3 of 3-Layer refactor):
    // per-org DB IS the tenant boundary — the field was redundant.
    // NOTE: orgAddOn is tenant-plane data (per-org purchases). Commit 4
    // will formally place it on the platform cluster if cross-org rollup
    // queries emerge as a need; until then it stays in the per-org DB.
    addOnId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AddOn",
        required: true
    },
    status: {
        type: String,
        enum: ["active", "cancelled", "expired"],
        default: "active"
    },

    // Billing details locked at purchase
    billingCycleStart: { type: Date, required: true },
    billingCycleEnd: { type: Date, required: true },
    currency: { type: String, required: true },
    price: { type: Number, required: true },
    interval: { type: String, enum: ["monthly", "yearly"], default: "monthly" },

    stripeSubscriptionItemId: { type: String }, // For Stripe syncing

    autoRenew: { type: Boolean, default: true },

    version: { type: Number, default: 1 } // Implicit OAV via field
}, { timestamps: true });

orgAddOnSchema.index({ addOnId: 1, status: 1 });
orgAddOnSchema.index({ billingCycleStart: 1 });

const modelName = "OrgAddOn";

module.exports = {
    modelName,
    schema: orgAddOnSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, orgAddOnSchema),
};
