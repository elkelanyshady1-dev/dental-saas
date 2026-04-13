/**
 * BillingAuditLog.model.js
 * Sprint 7 — Billing Lifecycle Audit Trail
 *
 * Immutable append-only ledger for every significant billing lifecycle event.
 * All billing services write to this model instead of (or in addition to)
 * the generic AuditLog, ensuring filtered, high-fidelity billing forensics.
 *
 * Writers:
 *   - contractActivation.service.js
 *   - contractRenewal.service.js
 *   - dunningProcessor.service.js
 *   - gracePeriod.service.js
 *   - canonicalEventProcessor.js
 *
 * PLANE: Platform
 * COLLECTION: billingauditlogs
 * DESIGN: Append-only — updates and deletes are forbidden at the service layer.
 */

"use strict";

const mongoose = require("mongoose");

const billingAuditLogSchema = new mongoose.Schema(
    {
        // ── References ────────────────────────────────────────────────────────
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            default: null
        },
        contractId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrgContract",
            default: null
        },
        invoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformInvoice",
            default: null
        },

        // ── Event Type ────────────────────────────────────────────────────────
        eventType: {
            type: String,
            required: true,
            enum: [
                // Contract lifecycle
                "CONTRACT_CREATED",
                "CONTRACT_ACTIVATED",
                "CONTRACT_RENEWED",
                "CONTRACT_SUPERSEDED",
                "CONTRACT_TERMINATED",
                "CONTRACT_CANCELED",
                "CONTRACT_EXPIRED",
                "AUTO_RENEW_UPDATED",
                // Payment
                "PAYMENT_SUCCEEDED",
                "PAYMENT_FAILED",
                "PAYMENT_REFUNDED",
                // Refund lifecycle
                "REFUND_REQUESTED",
                "REFUND_APPROVED",
                "REFUND_REJECTED",
                "REFUND_PROCESSED",
                "REFUND_FAILED",
                // Dunning cycle
                "DUNNING_STARTED",
                "RETRY_ATTEMPT",
                "DUNNING_EXHAUSTED",
                "DUNNING_RECOVERED",
                // Grace period
                "GRACE_STARTED",
                "GRACE_EXPIRED",
                // Org lifecycle
                "ORG_SUSPENDED",
                "ORG_REACTIVATED",
                // Revenue recognition
                "REVENUE_RECOGNIZED",
                "DEFERRED_REVENUE_UPDATED",
                // Entitlement lifecycle (Sprint 2)
                "ENTITLEMENT_CREATED_FROM_PLAN",
                "ENTITLEMENT_OVERRIDE_APPLIED",
                // Unified Capability Resolver (Sprint 3)
                "CAPABILITY_STATE_CHANGED",
                // Plan catalog lifecycle
                "PLAN_VERSION_PUBLISHED",
                "PLAN_VERSION_DEPRECATED"
            ]
        },

        // ── State Snapshot ────────────────────────────────────────────────────
        // Captures before/after state for forensic analysis and rollback audit
        previousState: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },
        newState: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        // ── Actor ─────────────────────────────────────────────────────────────
        // "system" for cron jobs, "webhook" for provider events, or a PlatformUser._id string
        performedBy: {
            type: String,
            default: "system"
        },

        // ── Free-form context ─────────────────────────────────────────────────
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        // ── Request Correlation ───────────────────────────────────────────────
        // Populated from req.requestId (X-Request-ID header propagation).
        // Sparse: null for events written by cron jobs or background processes.
        requestId: {
            type: String,
            default: null
        }
    },
    {
        // No updatedAt — this collection is append-only
        timestamps: { createdAt: true, updatedAt: false },
        collection: "billingauditlogs"
    }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
billingAuditLogSchema.index({ organizationId: 1, createdAt: -1 });   // Primary: per-org history
billingAuditLogSchema.index({ contractId: 1, createdAt: -1 });        // Per-contract timeline
billingAuditLogSchema.index({ invoiceId: 1 });                        // Per-invoice events
billingAuditLogSchema.index({ eventType: 1, createdAt: -1 });         // Type-based queries
billingAuditLogSchema.index({ createdAt: -1 });                       // Global recency scan
billingAuditLogSchema.index({ requestId: 1 }, { sparse: true });      // End-to-end tracing

const modelName = "BillingAuditLog";

module.exports = {
    modelName,
    schema: billingAuditLogSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, billingAuditLogSchema),
};
