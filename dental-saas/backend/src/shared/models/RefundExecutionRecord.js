/**
 * RefundExecutionRecord.js
 * Sprint 7.2 — Enterprise Refund Execution Record
 *
 * Tracks every refund request through its full state machine lifecycle.
 * Single source of truth for refund state — referenced by refundProcessor.service.js.
 *
 * State machine (enforced by refundStateMachine.js):
 *   refund_requested → refund_under_review → refund_approved → refund_processing → refund_completed
 *                                          → refund_rejected  (terminal)
 *                                                              → refund_failed    (terminal)
 *
 * DESIGN:
 *   - idempotencyKey: unique sparse — prevents duplicate creation
 *   - providerRefundId: unique sparse — prevents double execution
 *   - Compound index (invoiceId, amountMinor): legacy idempotency guard preserved
 *
 * PLANE: Shared (platform billing domain only — org-plane must not import)
 * COLLECTION: refundexecutionrecords
 */
const mongoose = require("mongoose");

const refundExecutionRecordSchema = new mongoose.Schema({
    // ── References ─────────────────────────────────────────────────────────────
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        required: true
    },
    invoiceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PlatformInvoice",    // Sprint 7.2: was BillingInvoice (tombstoned)
        required: true
    },
    contractId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OrgContract",
        default: null
    },
    // Optional: only set when refund originates from a support ticket
    ticketId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket",
        default: null
    },
    regionCode: {
        type: String,
        required: true,
        uppercase: true
    },

    // ── Amount ─────────────────────────────────────────────────────────────────
    amountMinor: {
        type: Number,
        required: true,
        min: [1, "Refund amount must be at least 1 minor unit"]
    },

    // ── State Machine Status ──────────────────────────────────────────────────
    // All transitions enforced by refundStateMachine.js
    status: {
        type: String,
        enum: [
            "refund_requested",
            "refund_under_review",
            "refund_approved",
            "refund_rejected",
            "refund_processing",
            "refund_completed",
            "refund_failed"
        ],
        required: true,
        default: "refund_requested"
    },

    // ── Forensic Fields ───────────────────────────────────────────────────────
    reasonCode: {
        type: String,
        default: null   // e.g. "customer_request", "service_failure", "fraud"
    },
    requestedBy: {
        type: String,
        default: null   // PlatformUser._id or "system"
    },
    approvedBy: {
        type: String,
        default: null
    },
    processedBy: {
        type: String,
        default: null
    },

    // ── FX Lock Fields ────────────────────────────────────────────────────────
    // Captured at processing time from the RevenueSchedule — never re-resolved
    originalExchangeRate: {
        type: Number,
        default: null
    },
    originalNormalizedAmount: {
        type: Number,
        default: null   // refundAmount * originalExchangeRate (in base reporting currency)
    },

    // ── Provider Fields ───────────────────────────────────────────────────────
    providerRefundId: {
        type: String,
        default: null   // e.g. Stripe: re_xxx | Paymob: refund_ref
    },
    providerChargeId: {
        type: String,
        default: null   // e.g. Stripe: pi_xxx | Paymob: transaction_id
    },

    // ── Idempotency ───────────────────────────────────────────────────────────
    idempotencyKey: {
        type: String,
        default: null
    },

    // ── Retry Tracking ────────────────────────────────────────────────────────
    attemptCount: {
        type: Number,
        default: 1
    },
    lastAttemptAt: {
        type: Date,
        default: Date.now
    },
    correlationId: {
        type: String,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Sprint 7.2: Idempotency guard — unique per key, sparse (null keys allowed)
refundExecutionRecordSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

// Sprint 7.2: Provider idempotency — prevents double execution via duplicate webhook
refundExecutionRecordSchema.index({ providerRefundId: 1 }, { unique: true, sparse: true });

// Legacy compound idempotency guard preserved (amount variation exploit prevention)
refundExecutionRecordSchema.index({ invoiceId: 1, amountMinor: 1 }, { unique: true });

// TTL: expire records after 90 days
refundExecutionRecordSchema.index({ createdAt: 1 }, { expires: "90d" });

// Reconciliation scan
refundExecutionRecordSchema.index({ status: 1, createdAt: 1 });

// Geopolitical sovereignty
refundExecutionRecordSchema.index({ regionCode: 1, createdAt: -1 });
refundExecutionRecordSchema.index({ regionCode: 1, status: 1 });

// Per-org refund history
refundExecutionRecordSchema.index({ organizationId: 1, createdAt: -1 });

// Per-contract refund view
refundExecutionRecordSchema.index({ contractId: 1, createdAt: -1 });

const modelName = "RefundExecutionRecord";

module.exports = {
    modelName,
    schema: refundExecutionRecordSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, refundExecutionRecordSchema),
};
module.exports.refundExecutionRecordSchema = refundExecutionRecordSchema;

