/**
 * BillingTimeline.model.js
 * Stripe-Style Billing Architecture — Unified Event Stream
 *
 * PURPOSE:
 * Projection layer that unifies financial and lifecycle events from both
 * BillingLedger and BillingAuditLog into a single ordered timeline per org.
 *
 * DESIGN RULES:
 *  - This is a PROJECTION — BillingLedger + BillingAuditLog remain authoritative.
 *  - Append-only — never updated or deleted.
 *  - Timeline insertion failures MUST NEVER block billing operations.
 *  - All writes come through billingTimeline.service.js (emitBillingTimelineEvent).
 *
 * Writers:
 *   contractActivation.service.js  (CONTRACT_ACTIVATED, TRIAL_STARTED)
 *   trialActivation.job.js          (TRIAL_ENDED)
 *   invoiceEngine.service.js        (INVOICE_CREATED)
 *   canonicalEventProcessor.js      (PAYMENT_SUCCEEDED, PAYMENT_FAILED)
 *   contractRenewal.service.js      (RENEWAL_COMPLETED)
 *   contractEngine.service.js       (UPGRADE_APPLIED, DOWNGRADE_SCHEDULED)
 *   contractEngine.service.js       (CONTRACT_CANCELLED)
 *   migrateBillingTimeline.js       (backfill from ledger + audit log)
 *   publicController.js             (CONTRACT_CREATED — trial signup, v23.0)
 *   paymentApplicationService.js    (PAYMENT_PARTIAL, INVOICE_PAID, v23.0)
 *
 * PLANE: Platform
 * COLLECTION: billingtimeline
 */

"use strict";

const mongoose = require("mongoose");

const billingTimelineSchema = new mongoose.Schema(
    {
        // ── References ────────────────────────────────────────────────────────
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
            index: true
        },

        contractId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrgContract",
            default: null,
            index: true
        },

        invoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformInvoice",
            default: null
        },

        // ── Event Classification ───────────────────────────────────────────────
        eventType: {
            type: String,
            required: true,
            enum: [
                "TRIAL_STARTED",
                "TRIAL_ENDED",
                "CONTRACT_ACTIVATED",
                "CONTRACT_CANCELLED",
                "INVOICE_CREATED",
                "PAYMENT_SUCCEEDED",
                "PAYMENT_FAILED",
                "RENEWAL_COMPLETED",
                "UPGRADE_APPLIED",
                "DOWNGRADE_SCHEDULED",
                "REFUND_COMPLETED",
                // Sprint 8: emitted when a post-trial plan is scheduled at provisioning
                "PLAN_SCHEDULED",
                // v23.0: emitted when a trial contract is created at signup
                "CONTRACT_CREATED",
                // v23.0: partial payment received on invoice
                "PAYMENT_PARTIAL",
                // v23.0: invoice fully paid
                "INVOICE_PAID"
            ]
        },

        // ── Provider Correlation ────────────────────────────────────────────────
        // Provider webhook event ID (e.g. Stripe evt_xxx).
        // Null for internally-generated events.
        // Used as idempotency key for duplicate detection.
        providerEventId: {
            type: String,
            default: null
        },

        // ── Source Classification ──────────────────────────────────────────────
        // "ledger"  → backfilled from BillingLedger
        // "audit"   → backfilled from BillingAuditLog
        // "system"  → emitted directly by a service at runtime
        source: {
            type: String,
            enum: ["ledger", "audit", "system", "signup_trial", "user"],
            default: "system"
        },

        // ── Event Payload ──────────────────────────────────────────────────────
        // Contextual data specific to the event type.
        // Kept flexible (Mixed) — typed per eventType in emitter docs.
        payload: {
            type: mongoose.Schema.Types.Mixed,
            default: null
        },

        // ── Canonical Timestamp ────────────────────────────────────────────────
        // occurredAt is the business timestamp of the event.
        // For runtime events: when the service emitted it.
        // For backfilled events: original BillingLedger.createdAt or BillingAuditLog.createdAt.
        occurredAt: {
            type: Date,
            default: Date.now,
            index: true
        }
    },
    {
        // createdAt = when the document was inserted (may differ from occurredAt for backfills)
        timestamps: true,
        collection: "billingtimeline"
    }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
// Primary: per-org timeline (newest first)
billingTimelineSchema.index({ organizationId: 1, occurredAt: -1 });
// Per-contract timeline (for debugging endpoint)
billingTimelineSchema.index({ contractId: 1, occurredAt: -1 });
// Duplicate detection: org + contract + eventType + providerEventId
// Sparse because providerEventId is often null
billingTimelineSchema.index(
    { organizationId: 1, contractId: 1, eventType: 1, providerEventId: 1 },
    { sparse: true, name: "timeline_dedup_lookup" }
);

const modelName = "BillingTimeline";

module.exports = {
    modelName,
    schema: billingTimelineSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, billingTimelineSchema),
};
