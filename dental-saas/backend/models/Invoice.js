const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        subscriptionSnapshot: {
            plan: String,
            billingCycle: String,
            basePrice: Number,
            couponDiscount: Number,
            inflationApplied: Number,
            unusedCreditApplied: Number,
            finalAmount: Number,
            currencyAtBilling: String,
        },
        currency: {
            type: String,
            default: "USD",
        },
        status: {
            type: String,
            enum: ["pending", "paid", "failed", "void"],
            default: "pending",
        },
        type: {
            type: String,
            enum: ["RENEWAL", "PRORATION", "INITIAL"],
            default: "RENEWAL",
        },
        dueDate: Date,
        paidAt: Date,
        paymentReference: String,
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
        },

        // ── Dunning & Retry Engine Fields ──
        retryCount: { type: Number, default: 0 },
        maxRetries: { type: Number, default: 3 },
        nextRetryAt: Date,
        lastRetryAt: Date,
        failureReason: String,
    },
    { timestamps: true }
);

// Optimize query for fetching an organization's invoice history
invoiceSchema.index({ organizationId: 1, createdAt: -1 });

// Optimize query for the daily Dunning cron engine to find invoices that need retrying
invoiceSchema.index({ status: 1, nextRetryAt: 1 });

module.exports = mongoose.model("Invoice", invoiceSchema);
