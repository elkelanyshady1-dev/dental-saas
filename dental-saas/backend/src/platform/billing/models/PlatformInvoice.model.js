/**
 * PlatformInvoice.model.js
 * Sprint 7 — Sole Canonical SaaS Billing Invoice + Revenue Recognition
 *
 * PlatformInvoice is the ONLY subscription invoice model.
 *
 * Naming disambiguation:
 *   PlatformInvoice  → This file. Platform → Org SaaS billing invoices.
 *   PatientInvoice   → modules/billingDomain/organizationFinance — clinical invoices.
 *
 * Sprint 6: BillingInvoice (billinginvoices collection) removed entirely.
 * contractRenewal.service.js generates all PlatformInvoices.
 *
 * PLANE: Platform
 * COLLECTION: platforminvoices
 */

"use strict";

const mongoose = require("mongoose");

// ─── Line Item ────────────────────────────────────────────────────────────────
const lineItemSchema = new mongoose.Schema({
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },   // Decimal
    unitPriceMinor: { type: Number, required: true }, // Minor units (e.g. cents)
    total: { type: Number, required: true },
    totalMinor: { type: Number, required: true },
    type: {
        type: String,
        enum: ["plan", "addon", "overage", "credit", "tax", "adjustment"],
        required: true
    }
}, { _id: false });

// ─── Main Schema ──────────────────────────────────────────────────────────────
const platformInvoiceSchema = new mongoose.Schema(
    {
        // ── References ────────────────────────────────────────────────────────
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true
        },
        contractId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrgContract",
            required: [true, "PlatformInvoice requires a contractId — no orphaned invoices allowed"],
            index: true
        },
        planVersionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlanVersion",
            default: null
        },

        // ── Invoice Type ──────────────────────────────────────────────────────
        invoiceType: {
            type: String,
            enum: [
                "subscription",    // Regular renewal invoice
                "initial",         // First invoice for a new subscription
                "scheduled",       // Pre-paid invoice for pending_activation contract (activates after trial)
                "addon",           // Add-on purchase
                "credit_note",     // Refund/credit document
                "adjustment",      // Manual correction
                "dunning"          // Retry invoice
            ],
            required: true,
            default: "subscription"
        },

        // ── Billing Period ────────────────────────────────────────────────────
        billingCycleStart: { type: Date, required: true },
        billingCycleEnd: { type: Date, required: true },
        dueDate: { type: Date, required: true },

        // ── Financial Fields ──────────────────────────────────────────────────
        currency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },

        // Line items for transparency
        lineItems: [lineItemSchema],

        // Summarized amounts — all in both decimal and minor units
        basePlanAmount: { type: Number, default: 0 },
        basePlanAmountMinor: { type: Number, default: 0 },
        addOnAmount: { type: Number, default: 0 },
        addOnAmountMinor: { type: Number, default: 0 },
        overageAmount: { type: Number, default: 0 },
        overageAmountMinor: { type: Number, default: 0 },

        // Discount fields
        couponCode: { type: String, default: null },
        couponDiscountAmount: { type: Number, default: 0 },
        couponDiscountAmountMinor: { type: Number, default: 0 },
        campaignDiscountAmount: { type: Number, default: 0 },
        campaignDiscountAmountMinor: { type: Number, default: 0 },
        creditApplied: { type: Number, default: 0 },
        creditAppliedMinor: { type: Number, default: 0 },

        // Subtotal (before tax)
        subtotalAmount: { type: Number, required: true, default: 0 },
        subtotalAmountMinor: { type: Number, required: true, default: 0 },

        // Tax
        taxPercent: { type: Number, default: 0 },
        taxAmount: { type: Number, default: 0 },
        taxAmountMinor: { type: Number, default: 0 },

        // Final total
        totalAmount: { type: Number, required: true, default: 0 },
        totalAmountMinor: {
            type: Number,
            required: true,
            default: 0,
            validate: {
                validator: Number.isInteger,
                message: "totalAmountMinor must be an integer (minor currency units)"
            }
        },

        // ── Payment Status ────────────────────────────────────────────────────
        // Status machine:
        //   draft    → issued → open → partial → paid
        //                                ↓
        //                            overdue → (void | uncollectible)
        // v21.0: Added issued, partial, overdue for full SaaS lifecycle
        status: {
            type: String,
            enum: ["draft", "open", "issued", "partial", "paid", "void", "uncollectible", "overdue"],
            default: "draft"
        },

        // Payment state machine field — exclusively managed by paymentStatusService
        paymentStatus: {
            type: String,
            enum: ["pending", "authorized", "captured", "failed", "refunded", "partially_refunded", "disputed"],
            default: "pending"
        },

        paidAt: { type: Date, default: null },
        issuedAt: { type: Date, default: null },   // v21.0: when invoice was issued to org
        voidedAt: { type: Date, default: null },

        // ── Partial Payment Tracking ───────────────────────────────────────────
        // v21.0: Tracks cumulative payments applied to this invoice.
        // amountRemaining is recomputed by paymentApplicationService on every payment.
        amountPaid: {
            type: Number,
            default: 0,
            min: 0
        },
        amountRemaining: {
            type: Number,
            default: null  // null = not yet computed; populated after first payment attempt
        },

        // ── Provider Reference ────────────────────────────────────────────────
        paymentProvider: {
            type: String,
            enum: ["stripe", "paymob", "paypal", "manual", "kashier"],
            default: null
        },
        providerPaymentId: { type: String, default: null },  // Provider payment intent / charge ID
        providerInvoiceId: { type: String, default: null },  // Provider invoice ID if applicable

        // ── Dunning / Retry ───────────────────────────────────────────────────
        retryCount: { type: Number, default: 0 },
        maxRetries: { type: Number, default: 3 },
        nextRetryAt: { type: Date, default: null },
        lastRetryAt: { type: Date, default: null },
        failureReason: { type: String, default: null },

        // ── Invoice Number ─────────────────────────────────────────────────────
        // Human-readable identifier for customer PDFs and support queries.
        // Format: INV-YYYYMM-NNNNN (e.g. INV-202503-00042)
        // Generated atomically via InvoiceSequence model ($inc counter).
        // ABSENT (not null) for trial invoices — sparse unique index skips missing fields.
        invoiceNumber: {
            type: String,
            trim: true
        },

        // ── Idempotency ───────────────────────────────────────────────────────
        // Prevents duplicate invoice generation for the same period.
        // ABSENT (not null) when not applicable — sparse unique index skips missing fields.
        idempotencyKey: {
            type: String
        },

        // ── Metadata ─────────────────────────────────────────────────────────
        metadata: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {}
        },

        // ── Audit ─────────────────────────────────────────────────────────────
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            default: null  // null for system-generated (cron) invoices
        },
        regionCode: {
            type: String,
            uppercase: true,
            enum: ["EU", "US", "MEA", "APAC"],
            default: null
        },

        // ── Revenue Recognition ─────────────────────────────────────────────────
        // Populated when invoice is paid and a RevenueSchedule is created.
        // recognizedRevenue updated monthly by revenueRecognition.job.js.
        // deferredRevenue = totalAmount − recognizedRevenue (maintained by the same job).
        recognizedRevenue: { type: Number, default: 0 },
        deferredRevenue: { type: Number, default: 0 },

        // OAV
        version: { type: Number, default: 0 }
    },
    {
        timestamps: true,
        collection: "platforminvoices"
    }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
platformInvoiceSchema.index({ organizationId: 1, createdAt: -1 });
platformInvoiceSchema.index({ organizationId: 1, status: 1 });
platformInvoiceSchema.index({ contractId: 1, status: 1 });
platformInvoiceSchema.index({ status: 1, nextRetryAt: 1 });          // Dunning scan
platformInvoiceSchema.index({ paymentStatus: 1 });
platformInvoiceSchema.index({ providerPaymentId: 1 }, { sparse: true });
platformInvoiceSchema.index({ providerInvoiceId: 1 }, { sparse: true });
platformInvoiceSchema.index({ idempotencyKey: 1 }, { sparse: true, unique: true });
platformInvoiceSchema.index({ regionCode: 1, createdAt: -1 });
platformInvoiceSchema.index({ regionCode: 1, status: 1 });
// Sprint 2: Unique invoice number — sparse because checkout invoices may not use invoiceEngine
platformInvoiceSchema.index({ invoiceNumber: 1 }, { unique: true, sparse: true });

// ─── Pre-Save: Line Item Integrity Guard ─────────────────────────────────────
// Validates that sum(lineItems[].total) == totalAmount within 2-cent FP tolerance.
// Skipped when lineItems is empty (some invoice types don't use itemised rows).
platformInvoiceSchema.pre("save", async function () {
    if (this.lineItems && this.lineItems.length > 0) {
        const computed = this.lineItems.reduce((sum, li) => sum + (li.total || 0), 0);
        const rounded = Math.round(computed * 100) / 100;
        // Allow 2-cent tolerance to absorb floating-point rounding in multi-item invoices
        if (Math.abs(rounded - this.totalAmount) > 0.02) {
            throw new Error(
                `[PlatformInvoice] Line item integrity violation: ` +
                `sum(lineItems.total)=${rounded} !== totalAmount=${this.totalAmount} ` +
                `(invoiceId=${this._id}, invoiceNumber=${this.invoiceNumber || "DRAFT"})`
            );
        }
    }
});

// ─── Pre-Save: contractId guard ──────────────────────────────────────────────

// Belt-and-suspenders: Mongoose required:true catches most cases, but this explicit
// guard also catches edge cases where required validation is bypassed (e.g. bulkWrite).
platformInvoiceSchema.pre("save", async function () {
    if (!this.contractId) {
        throw new Error(
            `PlatformInvoice pre-save guard: contractId is required (invoiceId=${this._id})`
        );
    }
});

// ─── OAV Pre-Save ─────────────────────────────────────────────────────────────
// Async style — required for Mongoose v7+ compatibility.
platformInvoiceSchema.pre("save", async function () {
    if (!this.isNew) this.version += 1;
});

const modelName = "PlatformInvoice";

module.exports = {
    modelName,
    schema: platformInvoiceSchema,
    lineItemSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, platformInvoiceSchema),
};
