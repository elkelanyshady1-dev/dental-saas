/**
 * BillingLedger.model.js
 * Platform Billing — Immutable Financial Event Ledger
 *
 * PURPOSE:
 * Provides an append-only, never-deleted log of every financial event that
 * moves money or changes a financial obligation on the platform.
 *
 * This is NOT a state store — it is an EVENT LOG.
 * PlatformInvoice.status is the source of truth for current state.
 * BillingLedger is the source of truth for WHAT HAPPENED and WHEN.
 *
 * ─── Why this is critical ─────────────────────────────────────────────────────
 *  1. Revenue reconciliation: replay ledger entries to reconstruct any period's revenue
 *  2. Regulatory compliance: SOC2, PCI require immutable financial audit trails
 *  3. Dispute resolution: single source for "was this payment received?"
 *  4. Analytics: MRR/ARR computed from ledger, not live invoice scans
 *  5. Webhook safety: even if a webhook is replayed or missed, the ledger reflects
 *     exactly what our system recorded, timestamped, and which source confirmed it.
 *
 * ─── Append-only Invariants ───────────────────────────────────────────────────
 *  - NO update operations permitted (enforced by pre('updateOne') + pre('findOneAndUpdate') hooks)
 *  - NO delete operations permitted (enforced by pre('deleteOne') + pre('deleteMany') hooks)
 *  - All fields set at creation are immutable
 *  - createdAt is set automatically and is the single time authority
 *
 * ─── Event Types ──────────────────────────────────────────────────────────────
 *  invoice.created        — a new PlatformInvoice was generated (contract.draft/active)
 *  payment.succeeded      — provider confirmed payment receipt
 *  payment.failed         — provider reported a failed charge attempt
 *  invoice.refunded       — a full or partial refund was confirmed by the provider
 *  subscription.created   — a provider subscription was provisioned
 *  subscription.canceled  — a provider subscription was canceled
 *  contract.activated     — an OrgContract transitioned to "active"
 *
 * ─── Integration points ───────────────────────────────────────────────────────
 *  Written by:
 *    canonicalEventProcessor.js  (payment.succeeded, payment.failed, invoice.refunded, subscription.*)
 *    contractActivation.service.js (contract.activated)
 *    invoiceEngine.service.js    (invoice.created)
 *
 * ─── Hash Chain (v21.1) ────────────────────────────────────────────────────────
 *  Each ledger entry carries:
 *    hash         — SHA-256 of { previousHash + financial fields + createdAt }
 *    previousHash — hash of the immediately preceding entry for this org
 *  Forming a chain: modifying any entry invalidates all subsequent entries.
 *  Checked by guardian invariant LEDGER_HASH_CHAIN_VALID.
 *  Backward compatible: entries without a hash are treated as pre-chain and skipped.
 *
 * PLANE: Platform
 * COLLECTION: billingledger
 */

"use strict";

const mongoose = require("mongoose");
// Sprint 3: Structured logging for monitoring/alerting (replaces console.error)
const logger = require("@utils/logger");
// v21.1: Tamper-evident hash chain for financial audit trail
const { computeLedgerHash } = require("../utils/ledgerHash");

// ─── Supported event types ─────────────────────────────────────────────────────
const LEDGER_EVENT_TYPES = Object.freeze([
    "invoice.created",
    "invoice.voided",           // v22.0: invoice void action (amountPaid === 0)
    "payment.succeeded",
    "payment.failed",
    "payment.partial",          // v21.0: partial payment applied
    "payment.refunded",         // v21.0: explicit refund event
    "invoice.refunded",         // legacy: kept for backward compat with existing entries
    "subscription.created",
    "subscription.canceled",
    "contract.activated",
    "contract.suspended",       // v21.0: suspension event
    "contract.voided",          // v21.0: void event
    "contract.terminated",      // v22.0: explicit termination event
    // Sprint 1: renewal ledger event — written by contractRenewal.service on success
    "renewal.completed"
]);

// ─── Source systems that may write ledger entries ──────────────────────────────
const LEDGER_SOURCES = Object.freeze([
    "canonicalEventProcessor",
    "contractActivation",
    "invoiceEngine",
    "contractRenewal",      // Sprint 1: renewal ledger events
    "paymentApplication",   // v21.0: manual payment application service
    "refundEngine",         // v22.0: refundProcessor.service
    "manualAdjustment"     // reserved for finance team overrides via admin tool only
]);


// ─── Schema ───────────────────────────────────────────────────────────────────
const billingLedgerSchema = new mongoose.Schema(
    {
        // ── Event classification ──────────────────────────────────────────────
        eventType: {
            type: String,
            required: true,
            enum: LEDGER_EVENT_TYPES
            // Indexed via: billingLedgerSchema.index({ eventType: 1, createdAt: -1 })
        },

        // ── References ────────────────────────────────────────────────────────
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true
            // Indexed via: billingLedgerSchema.index({ organizationId: 1, createdAt: -1 })
        },
        contractId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrgContract",
            default: null
            // Indexed via: billingLedgerSchema.index({ contractId: 1, createdAt: -1 })
        },
        invoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformInvoice",
            default: null
            // Indexed via: billingLedgerSchema.index({ invoiceId: 1 })
        },

        // ── v21.0: Payment Attempt reference ────────────────────────────────────────────
        // Direct reference to the PaymentAttempt that triggered this ledger event.
        // Makes forensic tracing possible without metadata inspection.
        paymentAttemptId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PaymentAttempt",
            default: null
        },

        // ── Provider event reference ───────────────────────────────────────────
        // The provider's canonical event ID (e.g. Stripe evt_xxx).
        // Null for internally-generated events (invoice.created, contract.activated).
        providerEventId: {
            type: String,
            default: null
            // Indexed via: billingLedgerSchema.index({ provider: 1, providerEventId: 1 }, { sparse: true })
        },
        provider: {
            type: String,
            enum: ["stripe", "paymob", "paypal", "manual", "internal"],
            default: "internal"
        },

        // ── Financial fields ──────────────────────────────────────────────────
        // Amount in DECIMAL (e.g. 99.00). Stored as decimal for readability.
        // amountMinor is stored as integer minor units for precision-safe arithmetic.
        amount: {
            type: Number,
            required: true,
            default: 0
        },
        amountMinor: {
            type: Number,
            required: true,
            default: 0,
            validate: {
                validator: Number.isInteger,
                message: "amountMinor must be an integer (minor currency units)"
            }
        },
        currency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },

        // ── Source system ─────────────────────────────────────────────────────
        source: {
            type: String,
            required: true,
            enum: LEDGER_SOURCES
        },

        // ── Actor type ──────────────────────────────────────────────────────────
        // Who triggered the event.
        //
        //   system   — automated process (cron, renewal engine, activation job)
        //   user     — a platform user acting via UI or API (actorId is their _id)
        //   webhook  — inbound provider webhook (Stripe, Paymob, PayPal)
        //   admin    — a platform superadmin performing a manual override
        //   replay   — event-source replay / data migration run
        //
        // Audit query examples:
        //   eventType:contract.activated AND actorType:user
        //   eventType:payment.failed   AND actorType:webhook
        //   actorType:replay (identify all replay-sourced entries)
        actorType: {
            type: String,
            enum: ["system", "user", "webhook", "admin", "replay"],
            default: "system"     // safe default — all existing callers emit system events
        },

        // ── Extensible metadata ───────────────────────────────────────────────
        // Use for correlation IDs, plan codes, reason codes, etc.
        // Kept as a plain Object (not Map) for easier aggregation pipeline access.
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },

        // ── v21.1: Tamper-Evident Hash Chain ─────────────────────────────────
        // previousHash: hash of the preceding BillingLedger entry for this org.
        //   null for the first ever entry per organization.
        // hash: SHA-256( previousHash + eventType + organizationId + invoiceId
        //                + amount + currency + source + createdAt )
        // If ANY of the above fields is mutated, the chain breaks and the
        // guardian invariant LEDGER_HASH_CHAIN_VALID reports a violation.
        previousHash: {
            type: String,
            default: null
            // Indexed below (sparse) — null for pre-chain entries
        },
        hash: {
            type: String,
            default: null   // null for ledger entries created before v21.1
            // Indexed below (sparse)
        }
    },
    {
        // createdAt is the immutable financial timestamp for this entry.
        // updatedAt is deliberately excluded — this schema is append-only.
        timestamps: { createdAt: true, updatedAt: false },
        collection: "billingledger"
    }
);

// ─── Immutability Guards ──────────────────────────────────────────────────────
// These hooks prevent any update or delete operation on ledger documents.
// They cannot be bypassed through Mongoose — only a direct MongoDB driver call
// (which would be a governance violation) could circumvent them.

billingLedgerSchema.pre(["updateOne", "findOneAndUpdate", "replaceOne", "updateMany"], function () {
    throw new Error(
        "[BillingLedger] Immutability violation: BillingLedger entries are append-only and cannot be updated. " +
        "Create a correcting entry (type: manualAdjustment) instead."
    );
});

billingLedgerSchema.pre(["deleteOne", "findOneAndDelete", "deleteMany"], function () {
    throw new Error(
        "[BillingLedger] Immutability violation: BillingLedger entries are append-only and cannot be deleted. " +
        "The ledger is a permanent financial record."
    );
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Analytic queries: revenue by period, org, event type
billingLedgerSchema.index({ organizationId: 1, createdAt: -1 });
billingLedgerSchema.index({ eventType: 1, createdAt: -1 });
billingLedgerSchema.index({ contractId: 1, createdAt: -1 });
billingLedgerSchema.index({ invoiceId: 1 });
billingLedgerSchema.index({ paymentAttemptId: 1 }, { sparse: true }); // v21.0: payment traceability
billingLedgerSchema.index({ provider: 1, providerEventId: 1 }, {
    sparse: true,
    name: "ledger_provider_event_lookup"
});
// MRR/ARR analytics: sum amounts by month
billingLedgerSchema.index({ currency: 1, eventType: 1, createdAt: -1 });
// Audit queries: who did what (e.g. eventType:contract.activated AND actorType:user)
billingLedgerSchema.index({ eventType: 1, actorType: 1, createdAt: -1 });
// v21.1: Hash chain lookups
billingLedgerSchema.index({ hash: 1 }, { sparse: true, name: "ledger_hash_lookup" });
billingLedgerSchema.index({ previousHash: 1 }, { sparse: true, name: "ledger_prev_hash_lookup" });
// v21.1: Efficient last-entry-per-org query for hash chaining
billingLedgerSchema.index({ organizationId: 1, hash: 1, createdAt: -1 }, {
    sparse: true,
    name: "ledger_org_hash_chain"
});

// ─── Helper: writeLedgerEntry ──────────────────────────────────────────────────
// v22.0: Delegates to LedgerEngine.service.js
// This re-export keeps backward compatibility for all existing callers.
// New code should import directly from:
//   require("../engines/LedgerEngine.service")
//
let _ledgerEngine;
function _getLedgerEngine() {
    if (!_ledgerEngine) _ledgerEngine = require("../engines/LedgerEngine.service");
    return _ledgerEngine;
}

async function writeLedgerEntry(entry, session = null) {
    return _getLedgerEngine().writeLedgerEntry(entry, session);
}

// ─── Model ────────────────────────────────────────────────────────────────────
const modelName = "BillingLedger";

module.exports = {
    modelName,
    schema: billingLedgerSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, billingLedgerSchema),
};
module.exports.writeLedgerEntry = writeLedgerEntry;
module.exports.LEDGER_EVENT_TYPES = LEDGER_EVENT_TYPES;
module.exports.LEDGER_SOURCES = LEDGER_SOURCES;

