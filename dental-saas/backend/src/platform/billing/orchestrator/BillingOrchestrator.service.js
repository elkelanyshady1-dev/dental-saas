/**
 * BillingOrchestrator.service.js
 * v22.0 — Phase 3: Orchestrator Fully Wired to Formal Engines
 *
 * PURPOSE:
 * Single coordination point for all cross-domain billing operations.
 * Delegates to the four formal engines — no business logic lives here.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *   BillingOrchestrator
 *     ├── SubscriptionEngine  (contract lifecycle)
 *     ├── InvoiceEngine       (invoice lifecycle)
 *     ├── PaymentEngine       (payment capture, refund, retry)
 *     └── LedgerEngine        (immutable ledger writes, credit balance, chain verify)
 *
 * ── Controller contract ───────────────────────────────────────────────────────
 *   Controllers MUST call this orchestrator.
 *   Controllers MUST NOT import individual engines or services directly.
 *   (Migration: existing direct-service calls still work during transition.)
 *
 * ── Cross-engine flows ────────────────────────────────────────────────────────
 *   renewSubscription()   — InvoiceEngine → PaymentEngine → LedgerEngine
 *   activateAfterPayment()— PaymentEngine → SubscriptionEngine → LedgerEngine
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact:  None — no new capabilities
 *   RBAC impact:      None
 *   Plane isolation:  Platform only
 *   Regression risk:  LOW — replaces previous Phase 1 stub with wired engines
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");
const { computePrice } = require("../pricing/pricingEngine.service");
const PlanVersion = require("../models/PlanVersion.model").default;
const OrgContract = require("../models/OrgContract.model").default;
const Organization = require("@shared/models/Organization").default;

// ── Engine imports (lazy to avoid circular dep at module load time) ──────────
let _sub, _inv, _pay, _led;

function sub() {
    if (!_sub) _sub = require("../services/contractEngine.service");
    return _sub;
}
function inv() {
    if (!_inv) _inv = require("../engines/InvoiceEngine.service");
    return _inv;
}
function pay() {
    if (!_pay) _pay = require("../engines/PaymentEngine.service");
    return _pay;
}
function led() {
    if (!_led) _led = require("../engines/LedgerEngine.service");
    return _led;
}

// ── v22.3: Integrity guards ──────────────────────────────────────────────────
const {
    assertUpgradeIntegrity,
    assertZeroValueSafety,
    assertBillingInvariant,
    UpgradeIntegrityError
} = require("../utils/upgradeIntegrityGuard");

// ── v23.0: Access type resolver ──────────────────────────────────────────────
const { resolveAccessType } = require("../utils/accessTypeResolver");

// ── v22.3: Reconciliation engine ─────────────────────────────────────────────
const { reconcileBilling } = require("../services/billingReconciliation.service");

// ─── Source normalizer (Section 2) ──────────────────────────────────────────
// OrgContract.source enum: ["sales", "self_serve", "provisioning", null]
// Map UI/origin strings to valid enum values so Mongoose validation never fails.
const SOURCE_MAP = {
    platform_admin: "sales",        // platform admin placing a contract = sales-managed
    platform_user: "self_serve",
    api: "provisioning",
    system: "provisioning",
};

function normalizeSource(raw) {
    if (!raw) return null;
    return SOURCE_MAP[raw] ?? raw;  // pass valid values through unchanged
}

// ─── BillingOrchestratorService ───────────────────────────────────────────────────────────────

const BillingOrchestrator = {

    // ═══════════════════════════════════════════════════════════════════════
    // SUBSCRIPTION ENGINE DELEGATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * createContract
     * Creates a new OrgContract in draft (or pending_activation) status.
     *
     * @param {object} data      - Contract fields
     * @param {string} actorId   - PlatformUser._id
     * @param {object} [options]
     */
    async createContract(data, actorId, options = {}) {
        logger.info({ orgId: data.organizationId, planCode: data.planCode, actorId }, "[Orchestrator] createContract");
        return sub().createContract(data, actorId, options);
    },

    /**
     * replaceContract
     * Creates a draft replacement for an existing active contract.
     */
    async replaceContract(sourceContractId, updates, actorId, options = {}) {
        logger.info({ sourceContractId, actorId }, "[Orchestrator] replaceContract");
        return sub().replaceContract(sourceContractId, updates, actorId, options);
    },

    /**
     * activateContract
     * Transitions draft → active after invoice is paid.
     */
    async activateContract(contractId, invoiceId, actorId, options = {}) {
        logger.info({ contractId, invoiceId, actorId }, "[Orchestrator] activateContract");
        return sub().activateContract(contractId, invoiceId, actorId, options);
    },

    /**
     * suspendContract
     * Moves contract to suspended status.
     */
    async suspendContract(contractId, opts = {}) {
        logger.info({ contractId, reason: opts.reason }, "[Orchestrator] suspendContract");
        return sub().suspendContract(contractId, opts);
    },

    /**
     * voidContract
     * Voids a contract with no paid invoices.
     */
    async voidContract(contractId, opts = {}) {
        logger.info({ contractId, reason: opts.reason }, "[Orchestrator] voidContract");
        return sub().voidContract(contractId, opts);
    },

    /**
     * graceContract
     * Moves contract into grace period.
     */
    async graceContract(contractId, opts = {}) {
        logger.info({ contractId }, "[Orchestrator] graceContract");
        return sub().graceContract(contractId, opts);
    },

    /**
     * expireContract
     * Terminates a contract.
     */
    async expireContract(contractId, reason, actorId, options = {}) {
        logger.info({ contractId, reason, actorId }, "[Orchestrator] expireContract");
        return sub().expireContract(contractId, reason, actorId, options);
    },

    /**
     * renewContract
     * Renews a contract for another period.
     */
    async renewContract(contractId, options = {}) {
        logger.info({ contractId }, "[Orchestrator] renewContract");
        return sub().renewContract(contractId, options);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // INVOICE ENGINE DELEGATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * generateInvoice
     * Generates a PlatformInvoice for a contract.
     */
    async generateInvoice(contractId, options = {}) {
        logger.info({ contractId }, "[Orchestrator] generateInvoice");
        return inv().generateInvoice(contractId, options);
    },

    /**
     * voidInvoice
     * Voids an invoice (Safety Rule 4: amountPaid must be 0).
     */
    async voidInvoice(invoiceId, opts = {}) {
        logger.info({ invoiceId }, "[Orchestrator] voidInvoice");
        return inv().voidInvoice(invoiceId, opts);
    },

    /**
     * markUncollectible
     * Marks an invoice uncollectible after dunning.
     */
    async markUncollectible(invoiceId, opts = {}) {
        logger.info({ invoiceId }, "[Orchestrator] markUncollectible");
        return inv().markUncollectible(invoiceId, opts);
    },

    /**
     * markProcessing
     * Marks an invoice as processing (async payment provider).
     */
    async markProcessing(invoiceId, opts = {}) {
        logger.info({ invoiceId }, "[Orchestrator] markProcessing");
        return inv().markProcessing(invoiceId, opts);
    },

    /**
     * resolveProcessing
     * Resolves a processing invoice to paid or failed.
     */
    async resolveProcessing(invoiceId, outcome, opts = {}) {
        logger.info({ invoiceId, outcome }, "[Orchestrator] resolveProcessing");
        return inv().resolveProcessing(invoiceId, outcome, opts);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // PAYMENT ENGINE DELEGATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * applyPayment
     * Applies a payment to an invoice. Idempotent via idempotencyKey.
     */
    async applyPayment(data) {
        logger.info({ invoiceId: data.invoiceId, amount: data.amount, requestId: data.requestId }, "[Orchestrator] applyPayment");
        return pay().applyPayment(data);
    },

    /**
     * recordManualPayment
     * Records an off-platform manual payment.
     */
    async recordManualPayment(data) {
        logger.info({ invoiceId: data.invoiceId, amount: data.amount, actorId: data.actorId }, "[Orchestrator] recordManualPayment");
        return pay().recordManualPayment(data);
    },

    /**
     * refundPayment
     * Refunds a captured payment.
     */
    async refundPayment(data) {
        logger.info({ paymentId: data.paymentId, requestId: data.requestId }, "[Orchestrator] refundPayment");
        return pay().refundPayment(data);
    },

    /**
     * retryPayment
     * Creates a new attempt for a failed payment.
     */
    async retryPayment(paymentAttemptId, opts = {}) {
        logger.info({ paymentAttemptId, actorId: opts.actorId }, "[Orchestrator] retryPayment");
        return pay().retryPayment(paymentAttemptId, opts);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // LEDGER ENGINE DELEGATION
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * writeLedgerEntry
     * Appends an immutable entry to the billing ledger.
     * Non-throwing — ledger failures never propagate to the caller.
     */
    async writeLedgerEntry(entry, session = null) {
        return led().writeLedgerEntry(entry, session);
    },

    /**
     * getCreditBalance
     * Computes organization credit balance from ledger events.
     */
    async getCreditBalance(orgId) {
        return led().getCreditBalance(orgId);
    },

    /**
     * verifyHashChain
     * Verifies ledger hash chain integrity for an organization.
     */
    async verifyHashChain(orgId, limit = 500) {
        return led().verifyChain(orgId, limit);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // CROSS-ENGINE FLOWS (Orchestration proper)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * previewUpgradePrice
     *
     * Read-only pricing preview — no DB writes.
     * Called by POST /contracts/preview before the actual upgrade.
     *
     * @param {object} params
     * @param {string} params.organizationId
     * @param {string} params.planVersionId
     * @param {string} [params.billingInterval] - default "monthly"
     * @returns {Promise<{
     *   price: number,
     *   currency: string,
     *   billingInterval: string,
     *   tax: number,
     *   discountAmount: number,
     *   regionCode: string,
     *   templateCode: string,
     *   planCode: string,
     *   versionTag: string,
     *   breakdown: object
     * }>}
     */
    async previewUpgradePrice({ organizationId, planVersionId, billingInterval = "monthly", discountPercent, discountAmount, customPriceOverride, couponCode }) {
        logger.info({ organizationId, planVersionId, billingInterval }, "[Orchestrator] previewUpgradePrice");

        // Fetch org for country-based region resolution
        const org = await Organization.findById(organizationId)
            .select("country billingCountry")
            .lean();
        if (!org) {
            const err = new Error(`Organization ${organizationId} not found`);
            err.status = 404;
            throw err;
        }

        // Fetch plan version
        const pv = await PlanVersion.findById(planVersionId).lean();
        if (!pv) {
            const err = new Error(`PlanVersion ${planVersionId} not found`);
            err.status = 404;
            throw err;
        }
        if (pv.status === "draft") {
            const err = new Error(`PlanVersion ${planVersionId} is a draft — cannot be used for upgrades`);
            err.status = 400;
            throw err;
        }

        // Validate billingInterval
        if (!["monthly", "yearly", "biennial"].includes(billingInterval)) {
            const err = new Error(`Invalid billingInterval: "${billingInterval}"`);
            err.status = 400;
            throw err;
        }

        const country = org.billingCountry || org.country || undefined;

        const pricing = await computePrice({
            planVersion: pv,
            billingInterval,
            country,
            provider: "manual",
            organizationId,
            ...(couponCode ? { coupon: { code: couponCode } } : {}),
            ...(customPriceOverride !== undefined ? { overridePrice: customPriceOverride } : {}),
        });

        // Apply admin discounts to preview (read-only — no DB writes)
        let finalPrice = pricing.finalPrice;
        let appliedDiscountAmount = pricing.discountAmount || 0;
        if (discountPercent && discountPercent > 0) {
            const d = Math.max(0, finalPrice * (discountPercent / 100));
            appliedDiscountAmount += d;
            finalPrice = Math.max(0, finalPrice - d);
            finalPrice = Math.round(finalPrice * 100) / 100;
        } else if (discountAmount && discountAmount > 0) {
            appliedDiscountAmount += discountAmount;
            finalPrice = Math.max(0, finalPrice - discountAmount);
            finalPrice = Math.round(finalPrice * 100) / 100;
        }

        return {
            basePrice: pricing.finalPrice,  // before admin discount
            finalPrice,                     // after admin discount
            price: finalPrice,              // alias for frontend compat
            currency: pricing.currency,
            billingInterval,
            tax: pricing.taxAmount || 0,
            discount: appliedDiscountAmount,
            discountAmount: appliedDiscountAmount,
            regionCode: pricing.regionCode,
            templateCode: pv.templateCode,
            planCode: pv.templateCode,
            versionTag: pv.versionTag,
            label: pv.label,
            breakdown: pricing.breakdown,
            snapshot: pricing.snapshot
        };
    },

    /**
     * upgradeSubscription
     *
     * Atomic upgrade flow spanning all four engines.
     * Runs inside a MongoDB transaction — any failure rolls back everything.
     *
     * CORRECT SEQUENCE (v22.2):
     *   1. Validate organization + plan version (pre-flight, no session)
     *   2. Compute price via pricingEngine (source of truth)
     *   3. [TXN] createContract → draft
     *   4. [TXN] activateContract(skipInvoiceCheck=true) → active
     *   5. [TXN] generateInvoice (active contract → allowed)
     *   6. [TXN] applyPayment → invoice: paid
     *   7. Commit
     *   8. [Post-commit] writeLedgerEntries (contract.activated + payment.succeeded)
     *
     * NOTE: Steps 3→4 were previously in wrong order (create → invoice → pay → activate)
     * causing "Cannot issue invoice for contract in pending_activation" because
     * the TDS routing kicked in and set status = pending_activation before the invoice step.
     * The correct approach: activate immediately after creation, then invoice.
     *
     * @param {object} params
     * @param {string} params.organizationId
     * @param {string} params.planVersionId
     * @param {string} [params.billingInterval]       - default "monthly"
     * @param {string} [params.paymentMethod]         - default "manual"
     * @param {string} [params.paymentTerms]          - e.g. "net30", "due_on_receipt"
     * @param {boolean} [params.autoRenew]            - default true
     * @param {Date|string} [params.contractStartDate]
     * @param {Date|string} [params.contractEndDate]
     * @param {number} [params.trialDaysOverride]     - override plan's trial days
     * @param {number} [params.discountPercent]       - % discount to pass to pricingEngine
     * @param {number} [params.discountAmount]        - flat discount to pass to pricingEngine
     * @param {number} [params.customPriceOverride]   - explicit locked price (sales contract)
     * @param {string} [params.couponCode]            - coupon code for discount
     * @param {object} [params.entitlementOverrides]  - e.g. { maxBranches: 20, supportTier: "premium" }
     * @param {string} params.actorId                 - PlatformUser._id
     * @param {string} [params.requestId]             - Correlation ID for logs
     * @returns {Promise<{
     *   contractId: string,
     *   invoiceId: string,
     *   paymentAttemptId: string|null,
     *   status: string,           - "activated" | "pending_activation"
     *   price: number,
     *   currency: string,
     *   billingInterval: string
     * }>}
     */
    async upgradeSubscription({
        organizationId, planVersionId,
        billingInterval = "monthly",
        paymentMethod = "manual",
        paymentTerms = "due_on_receipt",
        autoRenew = true,
        contractStartDate,
        contractEndDate,
        trialDaysOverride,
        discountPercent,
        discountAmount,
        customPriceOverride,
        couponCode,
        entitlementOverrides,
        // Grace Access: explicit intent from UI ("paid" | "trial" | "promo")
        accessType: payloadAccessType,
        graceDays,
        actorId, requestId
    }) {
        const log = (msg, extra = {}) =>
            logger.info({ organizationId, planVersionId, actorId, requestId, ...extra }, `[Orchestrator] upgrade.${msg}`);

        log("start");

        // ── Pre-flight: resolve plan version + org outside transaction ────────────
        const [org, pv] = await Promise.all([
            Organization.findById(organizationId).select("country billingCountry isArchived name").lean(),
            PlanVersion.findById(planVersionId).lean()
        ]);

        if (!org) { const e = new Error(`Organization ${organizationId} not found`); e.status = 404; throw e; }
        if (org.isArchived) { const e = new Error(`Organization ${organizationId} is archived`); e.status = 409; throw e; }
        if (!pv) { const e = new Error(`PlanVersion ${planVersionId} not found`); e.status = 404; throw e; }
        if (pv.status === "draft") { const e = new Error(`PlanVersion ${planVersionId} is a draft — publish it first`); e.status = 400; throw e; }
        if (pv.visibility === "internal") { const e = new Error(`PlanVersion ${planVersionId} has visibility=internal — not available for upgrades`); e.status = 400; throw e; }
        if (!["monthly", "yearly", "biennial"].includes(billingInterval)) { const e = new Error(`Invalid billingInterval: "${billingInterval}"`); e.status = 400; throw e; }

        // ── Section 10: CONTRACT_ALREADY_PENDING_PAYMENT guard ──────────────────
        // Per Section 10: if org already has a pending_payment contract (any plan),
        // reject to prevent multiple open invoices simultaneously.
        const existingPendingPayment = await OrgContract.findOne({
            organizationId,
            contractStatus: "pending_payment"
        }).select("_id planVersionId").lean();

        if (existingPendingPayment) {
            const e = new Error(
                `Organization already has a pending_payment contract (${existingPendingPayment._id}). ` +
                `Complete or cancel it before creating a new subscription.`
            );
            e.status = 409; e.code = "CONTRACT_ALREADY_PENDING_PAYMENT"; throw e;
        }

        // ── Step 1: Compute price (pricingEngine is the ONLY authority) ──────────
        const country = org.billingCountry || org.country || undefined;
        const pricing = await computePrice({
            planVersion: pv,
            billingInterval,
            country,
            provider: "manual",
            organizationId,
            ...(couponCode ? { coupon: { code: couponCode } } : {}),
            ...(customPriceOverride !== undefined ? { overridePrice: customPriceOverride } : {}),
        });

        // Apply admin discount on top of pricing engine result (if provided)
        let finalPrice = pricing.finalPrice;
        if (discountPercent && discountPercent > 0) {
            finalPrice = Math.max(0, finalPrice * (1 - discountPercent / 100));
            finalPrice = Math.round(finalPrice * 100) / 100;
        } else if (discountAmount && discountAmount > 0) {
            finalPrice = Math.max(0, finalPrice - discountAmount);
            finalPrice = Math.round(finalPrice * 100) / 100;
        }

        log("pricing.resolved", { basePrice: pricing.finalPrice, finalPrice, currency: pricing.currency });

        // ── Resolve effective start date ────────────────────────────────────────
        const resolvedEffectiveFrom = contractStartDate ? new Date(contractStartDate) : new Date();

        // ── v23.0: Resolve access type ────────────────────────────────────────
        // RULE: explicit payload intent (from UI) WINS over price-derived resolution.
        // This is the ROOT FIX: UI sends accessType="promo" and we must honour it.
        const resolvedTrialDays = trialDaysOverride ?? 0;
        const accessType =
            payloadAccessType ??
            resolveAccessType({
                trialDays: resolvedTrialDays,
                lockedPrice: finalPrice
            });

        logger.info(
            { organizationId, planVersionId, actorId, requestId,
              payloadAccessType, resolved: accessType, finalPrice },
            "[AccessType] Resolution"
        );

        // HARD RULE: promo contracts MUST have lockedPrice = 0 — no exceptions.
        if (accessType === "promo") {
            finalPrice = 0;
        }

        // HARD ASSERT: catch any logic error that reaches this point.
        if (accessType === "promo" && finalPrice !== 0) {
            throw new Error("PROMO_CONTRACT_WITH_NON_ZERO_PRICE");
        }

        // ── Non-billable fast-path (trial / promo) ──────────────────────────
        // Non-billable contracts MUST NOT go through the invoice pipeline.
        // No invoice, no financial ledger events — just create and activate.
        // This prevents:
        //   - 0 EGP invoices sitting in "issued" forever
        //   - Meaningless ledger entries polluting financial audit
        //   - Operators needing to manually "pay" a zero invoice
        if (accessType !== "paid") {
            log("nonBillable.fastPath", { accessType, finalPrice, planCode: pv.templateCode });

            // ── Compute promo dates for grace access contracts ────────────────
            let promoDays = 0;
            let promoStartDate = null;
            let promoEndDate = null;
            if (accessType === "promo" && graceDays) {
                promoDays = Number(graceDays);
                promoStartDate = resolvedEffectiveFrom;
                promoEndDate = new Date(resolvedEffectiveFrom);
                promoEndDate.setDate(promoEndDate.getDate() + promoDays);
                log("promo.dates", { promoDays, promoStartDate, promoEndDate });
            }

            // ── Atomic contract switch (withTransaction — auto-retry on write conflicts) ──
            const contract = await this.atomicContractSwitch({
                organizationId,
                contractPayload: {
                    organizationId,
                    planVersionId,
                    planCode: pv.templateCode,
                    billingInterval,
                    lockedPrice: finalPrice,
                    currency: pricing.currency,
                    effectiveFrom: resolvedEffectiveFrom,
                    effectiveTo: promoEndDate || (contractEndDate ? new Date(contractEndDate) : null),
                    autoRenew,
                    trialDays: resolvedTrialDays,
                    accessType,
                    // Promo access fields — stored as first-class schema fields
                    promoDays,
                    promoStartDate,
                    promoEndDate,
                    pricingSnapshot: pricing.snapshot,
                    source: normalizeSource("platform_admin"),
                    paymentProvider: paymentMethod || "manual",
                    initialStatus: "draft",
                    metadata: new Map([
                        ["initiatedFrom", "platform_ui"],
                        ["initiatedByRole", "superadmin"],
                        ["requestId", requestId || null],
                        ["accessType", accessType],
                        ["entitlementOverrides", entitlementOverrides ? JSON.stringify(entitlementOverrides) : null],
                    ]),
                },
                actorId,
                requestId,
            });

            // Post-commit: ledger entry for contract activation.
            // RULE: promo contracts MUST NOT generate ledger entries (§6).
            if (accessType !== "promo") {
                setImmediate(async () => {
                    try {
                        await led().writeLedgerEntry({
                            eventType: "contract.activated",
                            organizationId,
                            contractId: String(contract._id),
                            amount: finalPrice,
                            currency: pricing.currency,
                            provider: "manual",
                            source: "contractActivation",          // valid LEDGER_SOURCES enum value
                            actorType: actorId ? "user" : "system",
                            metadata: { requestId, planVersionId, billingInterval, accessType }
                        });
                    } catch (ledErr) {
                        logger.error({ ledErr, organizationId, requestId }, "[Orchestrator] nonBillable — ledger write failed");
                    }
                });
            } else {
                logger.info(
                    { contractId: String(contract._id), organizationId },
                    "[Ledger] Skipping promo contract — no ledger entry written"
                );
            }

            // v22.3: Zero-value safety assertion — ensures no invoice leaked through
            assertZeroValueSafety({ price: finalPrice, invoice: null, contract, requestId });
            // v23.0: Billing invariant — non-billable contract must not have invoice
            assertBillingInvariant(contract, null);

            return {
                contractId: String(contract._id),
                status: "activated",
                accessType,
                promoDays: accessType === "promo" ? promoDays : undefined,
                promoStartDate: accessType === "promo" && promoStartDate ? promoStartDate.toISOString() : undefined,
                promoEndDate: accessType === "promo" && promoEndDate ? promoEndDate.toISOString() : undefined,
                invoiceId: null,
                amountDue: 0,
                currency: pricing.currency,
                billingInterval,
                effectiveFrom: resolvedEffectiveFrom.toISOString(),
                paymentMethod: paymentMethod || "manual",
            };
        }

        log("lifecycle.invoiceFirst", {
            effectiveFrom: resolvedEffectiveFrom.toISOString(),
            contractStartDate
        });

        // ── Start MongoDB transaction ─────────────────────────────────────────────
        // All steps execute atomically. On failure the transaction aborts — no partial state.
        const session = await mongoose.startSession();
        session.startTransaction();

        let contract, invoice;
        let currentStep = "startTransaction";

        try {
            // ── Step 2: Create contract directly in pending_payment ───────────────
            // Section 4: Use initialStatus to skip TDS routing and draft
            // intermediate states entirely. The contract is born in pending_payment.
            currentStep = "createContract";
            log("step", { step: currentStep });
            contract = await sub().createContract({
                organizationId,
                planVersionId,
                planCode: pv.templateCode,
                billingInterval,
                lockedPrice: finalPrice,
                currency: pricing.currency,
                effectiveFrom: resolvedEffectiveFrom,
                effectiveTo: contractEndDate ? new Date(contractEndDate) : null,
                autoRenew,
                trialDays: resolvedTrialDays,
                accessType,   // v23.0: always "paid" in this branch
                pricingSnapshot: pricing.snapshot,
                source: normalizeSource("platform_admin"),
                paymentProvider: paymentMethod || "manual",
                // Section 3: Create directly in pending_payment — bypasses draft + TDS routing
                initialStatus: "pending_payment",
                metadata: new Map([
                    ["initiatedFrom", "platform_ui"],
                    ["initiatedByRole", "superadmin"],
                    ["requestId", requestId || null],
                    ["accessType", accessType],
                    ["entitlementOverrides", entitlementOverrides ? JSON.stringify(entitlementOverrides) : null],
                ]),
            }, actorId, { session });

            log("contract.created", {
                contractId: contract._id,
                status: contract.contractStatus  // will be "pending_payment"
            });

            // ── Step 3: Generate invoice ──────────────────────────────────────────
            // Invoice is generated while contract is "pending_payment".
            // InvoiceEngine allows: draft, ready, pending_payment, active.
            currentStep = "generateInvoice";
            log("step", { step: currentStep });
            const invoiceResult = await inv().generateInvoice(String(contract._id), {
                session,
                billingInterval,
                createdBy: actorId,
                invoiceType: "subscription"
            });
            invoice = invoiceResult.invoice || invoiceResult;
            log("invoice.generated", {
                invoiceId: invoice._id,
                status: invoice.status,
                amount: invoice.totalAmount
            });

            // ── Step 4: Issue invoice ─────────────────────────────────────────────
            // "issued" = invoice is visible to the payer and ready to receive payment.
            // Section 7: Activation fires automatically via paymentApplicationService
            // when invoice.status becomes "paid" — no activateContract call here.
            currentStep = "issueInvoice";
            log("step", { step: currentStep });
            invoice = await inv().issueInvoice(String(invoice._id), { actorId, session });
            log("invoice.issued", { invoiceId: invoice._id, status: invoice.status });

            // ── Commit ────────────────────────────────────────────────────────────
            currentStep = "commit";
            await session.commitTransaction();
            log("complete", {
                contractId: contract._id,
                invoiceId: invoice._id,
                status: "pending_payment"
            });

        } catch (err) {
            try { await session.abortTransaction(); } catch (_) { /* swallow */ }
            logger.error(
                { err, organizationId, planVersionId, requestId, failedStep: currentStep },
                `[Orchestrator] upgrade.ABORTED at step "${currentStep}": ${err.message}`
            );
            throw err;
        } finally {
            session.endSession();
        }

        // ── Post-commit: Write ledger entry for contract.created (non-blocking) ──
        setImmediate(async () => {
            try {
                await led().writeLedgerEntry({
                    eventType: "contract.created",
                    organizationId,
                    contractId: String(contract._id),
                    invoiceId: String(invoice._id),
                    amount: finalPrice,
                    currency: pricing.currency,
                    provider: "manual",
                    source: "contractActivation",         // valid LEDGER_SOURCES enum value
                    actorType: actorId ? "user" : "system",
                    metadata: { requestId, planVersionId, billingInterval, planCode: pv.templateCode }
                });
            } catch (ledErr) {
                logger.error(
                    { ledErr, organizationId, requestId, severity: "CRITICAL" },
                    "[Orchestrator] upgrade — post-commit ledger write failed (contract.created)"
                );
            }
        });

        // ── v22.3: Post-commit integrity assertion ────────────────────────────
        assertUpgradeIntegrity({ contract, invoice, price: finalPrice, requestId });
        // v23.0: Billing invariant — paid contract MUST have invoice
        assertBillingInvariant(contract, invoice);

        return {
            contractId: String(contract._id),
            status: "pending_payment",
            invoiceId: String(invoice._id),
            amountDue: invoice.totalAmount,
            currency: pricing.currency,
            billingInterval,
            effectiveFrom: resolvedEffectiveFrom.toISOString(),
            paymentMethod: paymentMethod || "manual",
        };
    },

    /**
     * atomicContractSwitch
     *
     * Atomically swaps the current active contract for a new one using a
     * MongoDB session transaction with automatic retry on transient write
     * conflicts (withTransaction).
     *
     * ── Sequence (all within a single transaction) ────────────────────────────
     *   1. Create new contract in "draft" status
     *   2. Activate new contract — contractActivation.service atomically:
     *        • Supersedes previous active contract  (prev → "superseded")
     *        • Stamps prev.effectiveTo = new.effectiveFrom  (zero-gap, zero-overlap)
     *        • Sets org.currentContractId = new contract._id
     *        • Applies module entitlements from PlanVersion
     *   3. Commit (or auto-rollback + retry on transient error)
     *
     * ── Guarantees ────────────────────────────────────────────────────────────
     *   ✔ Exactly ONE active contract after completion
     *   ✔ org.currentContractId ALWAYS points to the new active contract
     *   ✔ Previous contract gets a deterministic timeline close (no gap, no overlap)
     *   ✔ Complete rollback on any failure — zero partial state
     *   ✔ Auto-retry on transient write conflicts (WriteConflict / NoSuchTransaction)
     *
     * CRITICAL RULES:
     *   — NEVER create a contract outside this method for non-billable activations
     *   — NEVER update org.currentContractId outside this transaction
     *   — NEVER cancel/supersede the old contract outside this transaction
     *
     * @param {object} params
     * @param {string} params.organizationId
     * @param {object} params.contractPayload   - Full payload for sub().createContract()
     * @param {string} params.actorId
     * @param {string} [params.requestId]       - Correlation ID for logs
     * @returns {Promise<OrgContract>}          - The newly activated contract document
     */
    async atomicContractSwitch({ organizationId, contractPayload, actorId, requestId }) {
        const log = (msg, extra = {}) =>
            logger.info({ organizationId, actorId, requestId, ...extra }, `[Orchestrator] atomicSwitch.${msg}`);

        log("start");

        const session = await mongoose.startSession();
        let contract;

        try {
            await session.withTransaction(async () => {
                // ── Step 1: Create new contract (draft) ───────────────────────────
                // initialStatus="draft" is set by caller in contractPayload.
                // The CONTRACT_TIMELINE_OVERLAP guard is bypassed because initialStatus
                // is explicitly set — the orchestrator owns timeline management here.
                contract = await sub().createContract(contractPayload, actorId, { session });
                log("contract.created", { contractId: String(contract._id), accessType: contract.accessType });

                // ── Step 2: Activate ───────────────────────────────────────────────
                // contractActivation.service performs the full atomic switch:
                //   • previousContract.contractStatus → "superseded"
                //   • previousContract.effectiveTo = newContract.effectiveFrom (deterministic close)
                //   • newContract.contractStatus → "active"
                //   • org.currentContractId → newContract._id
                //   • OrganizationEntitlement upserted from PlanVersion
                // All saved with { session } — committed together with Step 1.
                await sub().activateContract(String(contract._id), null, actorId, {
                    session,
                    skipInvoiceCheck: true,
                    correlationId: requestId,
                });
                log("contract.activated", { contractId: String(contract._id) });

                // ── Step 3: Commit is handled automatically by withTransaction ─────
                // On transient write conflict: entire callback retries from Step 1.
                // On any other error: transaction aborts and error propagates.
            });

            log("complete", { contractId: String(contract._id) });
            return contract;

        } catch (err) {
            logger.error(
                { err, organizationId, requestId, contractId: contract ? String(contract._id) : null },
                "[Orchestrator] atomicSwitch.FAILED"
            );
            throw err;
        } finally {
            session.endSession();
        }
    },

    async renewSubscription({ contractId, amount, currency, method = "manual", provider = "internal",
        idempotencyKey, actorId, requestId }) {

        logger.info({ contractId, amount, currency, requestId }, "[Orchestrator] renewSubscription — start");

        const { invoice, isNew } = await inv().generateInvoice(contractId);

        let payment;
        try {
            ({ payment } = await pay().applyPayment({
                invoiceId: String(invoice._id),
                amount, method, provider, idempotencyKey, actorId, requestId
            }));
        } catch (payErr) {
            logger.error({ payErr, invoiceId: invoice._id, contractId, requestId }, "[Orchestrator] renewSubscription — payment failed");
            throw payErr;
        }

        let ledgerWritten = false;
        await led().writeLedgerEntry({
            eventType: "renewal.completed",
            organizationId: invoice.organizationId,
            contractId,
            invoiceId: String(invoice._id),
            paymentAttemptId: payment && payment._id ? String(payment._id) : null,
            provider, amount, currency,
            source: "canonicalEventProcessor",
            actorType: actorId ? "user" : "system",
            metadata: { requestId, renewalContractId: contractId }
        })
            .then(function() { ledgerWritten = true; })
            .catch(function(err) { logger.error({ err, contractId, requestId }, "[Orchestrator] renewSubscription — ledger write failed (non-fatal)"); });

        return { invoice, payment, ledgerWritten };
    },

    // ═══════════════════════════════════════════════════════════════════════
    // RECONCILIATION ENGINE DELEGATION
    // ═══════════════════════════════════════════════════════════════════════

    async reconcileBilling(orgId, options = {}) {
        logger.info({ orgId }, "[Orchestrator] reconcileBilling");
        return reconcileBilling(orgId, options);
    },

    // ═══════════════════════════════════════════════════════════════════════
    // FAILSAFE WRAPPERS (v22.3)
    // ═══════════════════════════════════════════════════════════════════════

    async safeUpgradeSubscription(params) {
        try {
            const result = await this.upgradeSubscription(params);
            return Object.assign({ success: true }, result);
        } catch (err) {
            if (err.status && err.status >= 400 && err.status < 500) {
                throw err;
            }

            const isIntegrity = err instanceof UpgradeIntegrityError
                || err.code === "LEDGER_WRITE_CRITICAL_FAILURE";

            logger.error({
                err,
                event: "UPGRADE_FAILSAFE_CAUGHT",
                severity: "CRITICAL",
                organizationId: params.organizationId,
                planVersionId: params.planVersionId,
                requestId: params.requestId,
                errorCode: err.code || "UNKNOWN",
                isIntegrity: isIntegrity,
            }, "[Orchestrator] FAILSAFE — upgrade failed with " + (isIntegrity ? "INTEGRITY" : "INTERNAL") + " error");

            return {
                success: false,
                code: isIntegrity ? "BILLING_INTEGRITY_ERROR" : "BILLING_INTERNAL_ERROR",
                message: "Upgrade could not be completed safely. The operation has been rolled back.",
                errorRef: params.requestId || null,
                detail: {
                    organizationId: params.organizationId,
                    planVersionId: params.planVersionId,
                    originalError: err.message,
                    errorCode: err.code || null,
                }
            };
        }
    }
};

module.exports = BillingOrchestrator;
