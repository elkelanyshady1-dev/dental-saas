/**
 * OrgContract.model.js
 * Sprint 7 — Hybrid Renewal Engine (Production-Ready)
 *
 * OrgContract is the COMMERCIAL AGREEMENT between the platform and a tenant.
 * It captures:
 *   - Which PlanVersion was sold
 *   - What price was locked in
 *   - What renewal terms apply
 *   - What discounts/coupons were applied
 *   - Trial configuration
 *
 * It does NOT capture runtime state (that lives in Organization.subscription).
 * It IS the source of truth for billing engine decisions.
 *
 * Migration target:
 *   Organization.subscription.customPricing   → OrgContract.pricingOverride
 *   Organization.subscription.renewalPolicy   → OrgContract.renewalTerms
 *   Organization.subscription.coupon          → OrgContract.appliedCoupon
 *   Organization.subscription.autoRenew       → OrgContract.autoRenew
 *   Organization.subscription.scheduledPlanChange → OrgContract.scheduledChange
 *   Organization.subscription.basePriceAtSubscription → OrgContract.lockedPrice
 *   Organization.subscription.creditBalance   → OrgContract.creditBalance
 *
 * Sprint 6 (Phase 6): BillingInvoice domain removed.
 * activatingInvoiceId now references PlatformInvoice.
 *
 * PLANE: Platform
 * COLLECTION: orgcontracts
 */

"use strict";

const mongoose = require("mongoose");

// ─── Dunning State Sub-Document ───────────────────────────────────────────────
// Tracks retry lifecycle embeddedirectly on the contract.
// This avoids a separate "dunning" collection and ensures atomic reads.
const dunningSchema = new mongoose.Schema({
    // How many charge attempts have been made during this dunning cycle
    retryCount: { type: Number, default: 0 },
    // When to attempt the next charge (set from retryScheduleDays[retryCount])
    nextRetryAt: { type: Date, default: null },
    // Deadline for collection before org suspension
    gracePeriodEndsAt: { type: Date, default: null },
    // When org was auto-suspended (null if not yet suspended)
    suspendedAt: { type: Date, default: null },
    // Reason for the last failed charge
    lastFailureReason: { type: String, default: null }
}, { _id: false });

// ─── Applied Coupon Snapshot ──────────────────────────────────────────────────
// Snapshot at contract creation — never re-resolved from coupon catalog after signing.
const appliedCouponSchema = new mongoose.Schema({
    code: { type: String, trim: true },
    discountType: { type: String, enum: ["percentage", "fixed"] },
    discountValue: { type: Number, min: 0 },
    validUntil: { type: Date, default: null },
    maxUses: { type: Number, default: null },
    usedCount: { type: Number, default: 0 },
    planRestriction: { type: String, default: null }
}, { _id: false });

// ─── Renewal Terms ────────────────────────────────────────────────────────────
const renewalTermsSchema = new mongoose.Schema({
    // Annual price inflation applied at each renewal (in %)
    inflationPercent: { type: Number, default: 0 },
    // Interval locked in for this contract period
    billingInterval: {
        type: String,
        enum: ["monthly", "yearly", "biennial"],
        default: "monthly"
    }
}, { _id: false });

// ─── Pricing Override (custom pricing for specific orgs) ──────────────────────
const pricingOverrideSchema = new mongoose.Schema({
    isCustom: { type: Boolean, default: false },
    lockedPrice: { type: Number, default: 0 },   // In contract currency, decimal
    // Reason recorded for audit trail
    reason: { type: String, default: "" }
}, { _id: false });

// ─── Scheduled Plan Change ────────────────────────────────────────────────────
const scheduledChangeSchema = new mongoose.Schema({
    newPlanVersionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PlanVersion",
        default: null
    },
    newPlanCode: { type: String, default: null },
    effectiveDate: { type: Date, default: null },
    scheduledAt: { type: Date, default: null },
    scheduledBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PlatformUser",
        default: null
    }
}, { _id: false });

// ─── Pricing Snapshot (audit trail of how lockedPrice was computed) ──────────────
// Set by pricingEngine.service.js at contract creation.
// Purpose: finance team can reconstruct the full price calculation for any contract.
// IMPORTANT: invoices MUST use lockedPrice only. pricingSnapshot is read-only audit data.
const pricingSnapshotSchema = new mongoose.Schema({
    regionCode: { type: String, default: null },
    billingInterval: { type: String, enum: ["monthly", "yearly", "biennial"], default: null },
    basePrice: { type: Number, default: null },
    perSeatAddition: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    couponApplied: { type: Boolean, default: false },
    isOverride: { type: Boolean, default: false },   // true = sales custom price
    // v3: How pricing was resolved — critical for audit trail and revenue analysis.
    //   "override" = country-specific override within a region
    //   "region"   = region default pricing applied
    //   "global"   = global default fallback (no region match or excluded)
    //   null       = v2 engine (pre-v3 contracts)
    resolvedVia: {
        type: String,
        enum: ["override", "region", "global", null],
        default: null
    },
    // Snapshot origin — used for analytics grouping and BI dashboards.
    //   "computed"   = generated by pricingEngine.service.js at contract creation (exact)
    //   "backfilled" = reconstructed post-hoc from lockedPrice (approximate)
    snapshotType: { type: String, enum: ["computed", "backfilled"], default: "computed" },
    _backfilledAt: { type: Date, default: null }   // set only when snapshotType = "backfilled"
}, { _id: false });

// ─── Main Schema ──────────────────────────────────────────────────────────────
const orgContractSchema = new mongoose.Schema(
    {
        // ── Organization Reference ────────────────────────────────────────────
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true
        },

        // ── Plan Reference (locked at contract creation) ───────────────────────
        planVersionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlanVersion",
            required: true
        },
        // Denormalized for fast reads — never updated after creation
        planCode: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        planVersionTag: {
            type: String,
            required: true,
            trim: true
        },

        // ── Contract Lifecycle ────────────────────────────────────────────────────────
        // v3.0 — Invoice-first lifecycle:
        //   draft → ready → pending_payment → active
        //
        // draft             contract configuration in progress
        // ready             contract finalized, invoice generated
        // pending_payment   invoice issued, waiting for payment to activate
        // active            contract live (payment confirmed)
        //
        // Legacy / extended states (preserved for backward compatibility):
        // pending_activation = scheduled future-date contract (legacy — replaced by pending_payment model)
        // grace              = payment overdue, within grace period before suspension
        // suspended          = subscription suspended due to non-payment (reversible on payment)
        // void               = voided by operator (only allowed if no paid invoices exist)
        contractStatus: {
            type: String,
            enum: [
                // Invoice-first states (v3.0)
                "draft", "ready", "pending_payment",
                // Active / dunning states
                "active", "grace", "suspended",
                // Legacy scheduled-activation (backward compat)
                "pending_activation",
                // Terminal states
                "superseded", "terminated", "expired", "canceled", "void"
            ],
            default: "draft"
        },

        effectiveFrom: {
            type: Date,
            required: true
        },
        effectiveTo: {
            type: Date,
            default: null  // null = open-ended (renews until cancelled)
        },

        // ── Access Type ───────────────────────────────────────────────────────
        // Classifies the contract's billing behavior.
        //   "paid"  = requires invoice + payment for activation
        //   "trial" = time-limited free access (trialDays > 0)
        //   "promo" = indefinite free access (price = 0, no trial)
        // NOTE: "grace" is NOT an accessType — it's a contractStatus used by dunning.
        accessType: {
            type: String,
            enum: ["trial", "paid", "promo"],
            default: "paid"
        },

        // ── Trial Terms ───────────────────────────────────────────────────────
        trialDays: {
            type: Number,
            default: 0
        },
        trialStartDate: {
            type: Date,
            default: null
        },
        trialEndDate: {
            type: Date,
            default: null
        },

        // ── Promo Access Terms ────────────────────────────────────────────────
        // Tracks grace/promo access duration for accessType === "promo".
        // DISTINCT from gracePeriodDays which is dunning-only (billing retry window).
        promoDays: {
            type: Number,
            default: 0
        },
        promoStartDate: {
            type: Date,
            default: null
        },
        promoEndDate: {
            type: Date,
            default: null
        },

        // ── Locked Commercial Terms ───────────────────────────────────────────
        // The price locked at signing — regardless of plan template changes
        lockedPrice: {
            type: Number,
            required: true,
            min: 0
        },
        currency: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },

        // ── Billing Cadence (locked at contract creation) ──────────────────────
        // Reflects the interval used to compute lockedPrice.
        // Renewal engine uses this to know what period to bill.
        billingInterval: {
            type: String,
            enum: ["monthly", "yearly", "biennial"],
            default: "monthly"
        },

        // ── Payment Provider Price Reference ──────────────────────────────────
        // The provider's price object ID (e.g. Stripe price_id, Paymob plan ID).
        // Null for manual invoicing. Used by payment provider adapters at charge time.
        // Resolved by pricingEngine → pricingProviderResolver at contract creation.
        providerPriceId: {
            type: String,
            default: null
        },

        // ── Pricing Audit Snapshot ────────────────────────────────────────────
        // Immutable record of the pricing engine inputs and outputs that produced lockedPrice.
        // Finance/audit use only. Billing engine reads lockedPrice exclusively.
        pricingSnapshot: {
            type: pricingSnapshotSchema,
            default: null
        },

        // ── Billing Configuration ─────────────────────────────────────────────
        autoRenew: {
            type: Boolean,
            default: true
        },
        // salesManaged: true = invoice-only (no auto-charge); false = self-service auto-charge
        // Set at contract creation. Sales-managed contracts always require manual payment confirmation.
        salesManaged: {
            type: Boolean,
            default: false
        },
        gracePeriodDays: {
            type: Number,
            default: 7
        },

        // ── Credit Balance (running total for this contract) ──────────────────
        creditBalance: {
            type: Number,
            default: 0
        },

        // ── Contract Terms (commercial addons) ────────────────────────────────
        renewalTerms: {
            type: renewalTermsSchema,
            default: () => ({})
        },
        pricingOverride: {
            type: pricingOverrideSchema,
            default: () => ({})
        },
        appliedCoupon: {
            type: appliedCouponSchema,
            default: null
        },
        scheduledChange: {
            type: scheduledChangeSchema,
            default: null
        },

        // ── Sales Context ─────────────────────────────────────────────────────
        salesOwnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            default: null
        },
        // Contract origin — used for analytics + UI badges
        // "sales" = created by platform sales operator (custom price, custom terms)
        // "self_serve" = created via self-serve upgrade flow
        // null / "provisioning" = created by the provisioning engine (trial)
        source: {
            type: String,
            enum: ["sales", "self_serve", "provisioning", null],
            default: null
        },

        // ── Payment Provider Reference ────────────────────────────────────────
        // Phase 5: now ALSO set at checkout time to the `effectiveProvider`
        // returned by checkoutPolicy.resolveEffectiveProvider. Historically
        // populated at activation; unified checkout writes it earlier so
        // contract → provider consistency is deterministic from creation.
        paymentProvider: {
            type: String,
            enum: ["stripe", "paymob", "paypal", "manual", "kashier"],
            default: null
        },
        providerSubscriptionId: {
            type: String,
            default: null
        },

        // ── Linked Invoice ────────────────────────────────────────────────────
        // The first invoice that activated this contract (for audit trail)
        activatingInvoiceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformInvoice",

            default: null
        },

        // ── Activation audit (Pre-Phase-8 hardening) ──────────────────────────
        // When the payment-success dispatcher flipped contractStatus to
        // "active". Separate from effectiveFrom (scheduled activation time)
        // so finance can distinguish "scheduled to begin" from "actually
        // started paying".
        activatedAt: { type: Date, default: null },

        // Last successful provider payment applied to this contract. Used as
        // a double-payment idempotency guard in paymentSuccessHandler — if
        // the same external payment id arrives twice, we short-circuit.
        lastPaymentId: { type: String, default: null },

        // ── Supersession Chain ────────────────────────────────────────────────
        // When a contract is upgraded/downgraded, the old contract is superseded
        // and points to its replacement
        supersededById: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrgContract",
            default: null
        },
        supersededAt: {
            type: Date,
            default: null
        },
        // The contract this one was created to replace (set by replaceContract service)
        previousContractId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "OrgContract",
            default: null
        },

        // ── Extensible Metadata ───────────────────────────────────────────────
        // Used for: signed document references, custom notes, etc.
        metadata: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {}
        },

        // ── Audit ─────────────────────────────────────────────────────────────
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            required: true
        },
        activatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            default: null
        },
        terminatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "PlatformUser",
            default: null
        },
        terminatedAt: {
            type: Date,
            default: null
        },
        terminationReason: {
            type: String,
            default: null
        },

        // ── Dunning State ─────────────────────────────────────────────────────
        // Populated on renewal charge failure. Cleared when payment succeeds.
        // Sprint 7: DB-driven retry schedule from BillingSettings.
        dunning: {
            type: dunningSchema,
            default: null
        },

        // ── Next Billing Date ─────────────────────────────────────────────────
        // Explicit scheduler-friendly field, always equal to effectiveTo.
        // Set at activation: nextBillingDate = effectiveTo
        // Updated at renewal: nextBillingDate = new effectiveTo
        // Provides cleaner scheduler queries than reading effectiveTo directly.
        // Existing queries using effectiveTo are UNCHANGED.
        nextBillingDate: {
            type: Date,
            default: null,
            index: true
        },

        // OAV — Optimistic Atomic Version guard
        // Incremented by pre-save hook on every mutation.
        // Enables full audit timeline: each switch creates a new contract document
        // with version=0; superseded documents retain their final version as a snapshot.
        version: {
            type: Number,
            default: 0
        },

        // ── Idempotency Key ───────────────────────────────────────────────────
        // Set by BillingOrchestrator.atomicContractSwitch() to the requestId of
        // the originating API call. Prevents duplicate contracts on client retry
        // or session.withTransaction() replay.
        //
        // Unique + sparse: null values are excluded from the unique constraint
        // (contracts created without a requestId — e.g. migration scripts — are unaffected).
        idempotencyKey: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true,
        collection: "orgcontracts"
    }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────
// isBillable: convenience virtual — true only when accessType === "paid".
// Use this in guards instead of checking lockedPrice manually.
orgContractSchema.virtual("isBillable").get(function () {
    return this.accessType === "paid";
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
orgContractSchema.index({ organizationId: 1, contractStatus: 1 });
orgContractSchema.index({ organizationId: 1, createdAt: -1 });
orgContractSchema.index({ planVersionId: 1 });
orgContractSchema.index({ contractStatus: 1, effectiveFrom: 1 });
// Sprint 7: Primary renewal engine scan index — O(log n) for daily cron
orgContractSchema.index({ contractStatus: 1, effectiveTo: 1 });
// Sprint 7: Dunning processor scan index — O(log n) for hourly cron
orgContractSchema.index({ "dunning.nextRetryAt": 1 });
orgContractSchema.index({ "dunning.gracePeriodEndsAt": 1 });
orgContractSchema.index({ "appliedCoupon.code": 1 });
orgContractSchema.index({ salesOwnerId: 1 });
// Contract Timeline Integrity — used by guardian + pre-creation overlap guard
orgContractSchema.index({ organizationId: 1, effectiveFrom: 1, effectiveTo: 1 });
// TDS: Trial activation job scan — O(log n) for daily cron
// Covers: { contractStatus: "active", trialDays: { $gt: 0 }, trialEndDate: { $lte: now } }
orgContractSchema.index({ contractStatus: 1, trialDays: 1, trialEndDate: 1 });
// Promo expiry scan — O(log n) for daily cron
// Covers: { contractStatus: "active", accessType: "promo", promoEndDate: { $lte: now } }
orgContractSchema.index({ contractStatus: 1, accessType: 1, promoEndDate: 1 });

// Idempotency key lookup — used by atomicContractSwitch before opening a transaction
// sparse: true so null values (contracts without a requestId) are excluded from uniqueness check
orgContractSchema.index(
    { idempotencyKey: 1 },
    { unique: true, sparse: true, name: "contract_idempotency_key" }
);

// Sprint 8.1: Contract Chain Debugging API — O(log n) forward/backward traversal
// Required by GET /contracts/:contractId/chain
// Without these, each chain walk is a full collection scan (O(n)).
orgContractSchema.index({ supersededById: 1 });
orgContractSchema.index({ previousContractId: 1 });


// Partial unique: only one "active" contract per org (DB-enforced)
orgContractSchema.index(
    { organizationId: 1 },
    {
        unique: true,
        partialFilterExpression: { contractStatus: "active" },
        name: "unique_active_contract_per_org"
    }
);

// Partial unique: only one "pending_activation" contract per org (DB-enforced)
// Prevents queuing more than one upcoming paid plan during trial.
orgContractSchema.index(
    { organizationId: 1 },
    {
        unique: true,
        partialFilterExpression: { contractStatus: "pending_activation" },
        name: "unique_pending_contract_per_org"
    }
);

// Section 1 — CONTRACT UNIQUENESS: only one "pending_payment" contract per org (DB-enforced)
// Invoice-first path: prevents multiple open unpaid invoices simultaneously.
// Application-layer guard in BillingOrchestrator is the first line; this index is the DB backstop.
orgContractSchema.index(
    { organizationId: 1 },
    {
        unique: true,
        partialFilterExpression: { contractStatus: "pending_payment" },
        name: "unique_pending_payment_contract_per_org"
    }
);

// ─── OAV Pre-Save Hook ────────────────────────────────────────────────────────
orgContractSchema.pre("save", async function () {
    if (!this.isNew) this.version += 1;
});

const modelName = "OrgContract";

module.exports = {
    modelName,
    schema: orgContractSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, orgContractSchema),
};
