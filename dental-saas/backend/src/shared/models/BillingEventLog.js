/**
 * BillingEventLog.js
 * v13.0 — Idempotency Store for Billing Webhook Events
 *
 * PURPOSE:
 * Prevents double-processing of the same provider webhook event.
 * Every canonical billing event MUST be checked against this log
 * before processing, and inserted upon first successful processing.
 *
 * GUARANTEE:
 * Unique compound index { provider + externalEventId } ensures
 * exactly-once semantics at the database level.
 *
 * USAGE:
 *   const exists = await BillingEventLog.exists({ provider, externalEventId });
 *   if (exists) return; // idempotent exit
 *   // ... process event ...
 *   await BillingEventLog.create({ provider, externalEventId, type, payloadHash });
 */

"use strict";

const mongoose = require("mongoose");
const crypto = require("crypto");

const billingEventLogSchema = new mongoose.Schema({
    // Which provider emitted this event (stripe, paymob, paypal)
    provider: {
        type: String,
        enum: ["stripe", "paymob", "paypal"],
        required: true
    },

    // Provider-assigned unique event ID (e.g. Stripe: evt_xxx, Paymob: hmac_ref)
    externalEventId: {
        type: String,
        required: true,
        trim: true
    },

    // Canonical event type (never provider-specific: use payment.succeeded not payment_intent.succeeded)
    type: {
        type: String,
        required: true,
        enum: [
            "payment.succeeded",
            "payment.failed",
            "refund.completed",
            "dispute.created",
            "subscription.created",
            "subscription.canceled",
            "subscription.updated"
        ]
    },

    // SHA-256 hash of the canonical event payload — detects payload mutations across retries
    payloadHash: {
        type: String,
        required: true
    },

    // ISO timestamp of when we first successfully processed this event
    processedAt: {
        type: Date,
        default: Date.now
    },

    // regionCode of the event source
    regionCode: {
        type: String,
        uppercase: true
    },

    // Optional: link to the payment or invoice this event affected
    linkedPaymentId: {
        type: String
    }
}, {
    timestamps: false // processedAt is the authoritative timestamp
});

// ─── Idempotency Enforcement Index ────────────────────────────────────────────
// Unique compound — prevents duplicate event processing at DB level.
// This is the enforcement backstop. Application-level check should happen first.
billingEventLogSchema.index(
    { provider: 1, externalEventId: 1 },
    { unique: true, name: "billing_event_idempotency" }
);

// Query performance indexes
billingEventLogSchema.index({ processedAt: 1 });
billingEventLogSchema.index({ type: 1, processedAt: -1 });
billingEventLogSchema.index({ regionCode: 1, processedAt: -1 });

/**
 * computePayloadHash
 * Deterministic SHA-256 of a canonical event payload.
 * Used to detect if the same externalEventId arrives with mutated data.
 * @param {object} canonicalEvent
 * @returns {string} hex SHA-256
 */
function computePayloadHash(canonicalEvent) {
    const normalized = JSON.stringify({
        provider: canonicalEvent.provider,
        type: canonicalEvent.type,
        externalId: canonicalEvent.externalId,
        amount: canonicalEvent.amount,
        currency: canonicalEvent.currency
    });
    return crypto.createHash("sha256").update(normalized).digest("hex");
}

const modelName = "BillingEventLog";

module.exports = {
    modelName,
    schema: billingEventLogSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, billingEventLogSchema),
};
module.exports.computePayloadHash = computePayloadHash;
module.exports.billingEventLogSchema = billingEventLogSchema;

