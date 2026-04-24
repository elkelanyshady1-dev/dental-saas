/**
 * EmailEvent.model.js
 * Platform Domain — Email Event Log
 * v2.0 — PII-Safe Audit Log
 *
 * SECURITY: Raw email addresses are NEVER stored.
 * The `recipientHash` field stores a one-way SHA-256 HMAC of the email.
 * The `recipientDomain` stores the domain part only (e.g. "gmail.com") for filtering.
 * The `recipientMasked` stores a display-safe masked form (e.g. "t***@gmail.com").
 *
 * Persists a record for every email job processed by emailWorker.
 * Used by the Email Inspector panel in the Communication Center.
 *
 * Indexes:
 *   - createdAt (TTL 90 days)
 *   - jobId (direct lookup)
 *   - status (filter)
 *   - template (filter)
 *   - channel + createdAt (monitoring dashboard)
 *
 * PLANE: Platform / Infrastructure
 */
"use strict";

const mongoose = require("mongoose");
const crypto = require("crypto");

// ─── PII Hashing Utilities ────────────────────────────────────────────────────
// HMAC-SHA256 with a server-side secret so hashes are not reversible externally.
// Uses a stable key derived from APP_SECRET or a built-in salt.
const _HASH_KEY = process.env.EMAIL_HASH_SECRET || process.env.APP_SECRET || "dental-saas-email-event-salt-v2";

/**
 * hashRecipient — one-way SHA-256 HMAC of an email address.
 * Stable: same email always produces same hash for aggregation.
 * @param {string} email
 * @returns {string} 64-char hex string
 */
function hashRecipient(email) {
    if (!email || typeof email !== "string") return "unknown";
    return crypto
        .createHmac("sha256", _HASH_KEY)
        .update(email.toLowerCase().trim())
        .digest("hex");
}

/**
 * maskEmail — display-safe masked form: "t***@gmail.com"
 * @param {string} email
 * @returns {string}
 */
function maskEmail(email) {
    if (!email || !email.includes("@")) return "***@***";
    const [local, domain] = email.split("@");
    const visible = local.length > 1 ? local[0] : "*";
    return `${visible}***@${domain}`;
}

/**
 * getDomain — extract domain from email for non-PII filtering.
 * @param {string} email
 * @returns {string}
 */
function getDomain(email) {
    if (!email || !email.includes("@")) return "unknown";
    return email.split("@")[1]?.toLowerCase() || "unknown";
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const emailEventSchema = new mongoose.Schema(
    {
        jobId: { type: String, required: true, index: true },
        template: { type: String, required: true, index: true },
        channel: { type: String, default: "email", index: true },
        subject: { type: String, default: "" },

        // PII-safe recipient fields — NO raw email stored
        recipientHash: { type: String, required: true },  // HMAC-SHA256 of email
        recipientMasked: { type: String, default: "" },     // "t***@gmail.com" — display only
        recipientDomain: { type: String, default: "" },     // "gmail.com" — filtering

        status: {
            type: String,
            enum: ["queued", "processing", "sent", "failed", "retrying"],
            default: "queued",
            index: true,
        },

        previewUrl: { type: String, default: null },
        messageId: { type: String, default: null },
        provider: { type: String, default: "ethereal" },   // ethereal | smtp | ses | sendgrid
        providerChain: { type: [String], default: [] },         // failover log: ["ses -> smtp"]
        error: { type: String, default: null },
        durationMs: { type: Number, default: null },
        attemptsMade: { type: Number, default: 0 },

        // Sanitised metadata (NO PII — template name, type key only)
        meta: {
            type: { type: String, default: null },  // e.g. "MAGIC_LINK"
        },
    },
    {
        timestamps: true,
        collection: "emailEvents",
    }
);

// TTL: auto-delete after 90 days
emailEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Monitoring dashboard index
emailEventSchema.index({ channel: 1, status: 1, createdAt: -1 });

const modelName = "EmailEvent";

module.exports = {
    modelName,
    schema: emailEventSchema,
    hashRecipient,
    maskEmail,
    getDomain,
};
