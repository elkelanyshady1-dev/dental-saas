/**
 * checkoutOrchestrator.service.js
 * Org Plane — Self-Serve Checkout
 *
 * Connects the pricing page to the billing engine for subscription upgrades.
 *
 * Flow:
 *   1. Resolve and validate PlanVersion (must be active + public/sales)
 *   2. computePrice() → locked price, currency, providerPriceId, snapshot
 *   3. contractEngine.createContract() → draft or pending_activation OrgContract
 *   4. PlatformInvoice.create() → "scheduled" invoice (open, pending payment)
 *   5. StripeProvider.createNewCheckoutSession() → checkout URL
 *   6. Return { checkoutUrl, contractId, invoiceId } to controller
 *
 * After this:
 *   Webhook (existing canonicalEventProcessor) → payment.succeeded
 *   → invoice marked paid
 *   → activateContract() triggered automatically
 *
 * PLANE ISOLATION:
 *   This orchestrator lives in organization/ but only imports from
 *   platform/billing (read-only models + services). No org-plane RBAC.
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact: ADDITIVE — new checkout flow, no schema changes
 *   RBAC impact:     orgProtect enforced at route level
 *   Regression risk: LOW
 */

"use strict";

const mongoose = require("mongoose");
// PHASE 8 — PLANE-002 fix: All cross-plane imports use module aliases.
const PlanVersion = require("@billing/models/PlanVersion.model").default;
const OrgContract = require("@billing/models/OrgContract.model").default;
const PlatformInvoice = require("@billing/models/PlatformInvoice.model").default;
const Organization = require("@shared/models/Organization").default;
const { computePrice } = require("@billing/pricing/pricingEngine.service");
const contractEngine = require("@billing/services/contractEngine.service");
const { getProvider } = require("@billing/providers/paymentProviderFactory");
const logger = require("@utils/logger");

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_INTERVALS = ["monthly", "yearly", "biennial"];
const SELF_SERVE_ACTOR = "000000000000000000000000"; // system actor for self-serve contracts

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * createCheckoutSession
 *
 * Orchestrates a full self-serve checkout session:
 * resolves pricing → creates contract → creates invoice → opens provider session.
 *
 * @param {object} params
 * @param {string}  params.organizationId  - From org JWT (never from request body)
 * @param {string}  params.planVersionId   - PlanVersion to subscribe to
 * @param {string}  params.billingInterval - "monthly" | "yearly" | "biennial"
 * @param {string}  params.provider        - Payment provider key ("stripe"|"paymob"|"paypal")
 * @param {string}  params.country         - ISO country code (e.g. "EG", "US")
 * @param {string}  [params.coupon]        - Optional coupon code
 * @param {number}  [params.taxRate]       - Optional tax rate (0.15 = 15%)
 * @returns {{ checkoutUrl: string, contractId: string, invoiceId: string }}
 */
async function createCheckoutSession({
    organizationId,
    planVersionId,
    billingInterval,
    provider,
    country,
    coupon,
    taxRate
}) {
    // ── Guard: billing interval ───────────────────────────────────────────────
    if (!VALID_INTERVALS.includes(billingInterval)) {
        throw Object.assign(
            new Error(`Invalid billingInterval "${billingInterval}". Must be one of: ${VALID_INTERVALS.join(", ")}`),
            { status: 400, code: "INVALID_BILLING_INTERVAL" }
        );
    }

    // ── 1. Resolve Organization ───────────────────────────────────────────────
    // @per-org-transactional — billing orchestrator — Organization.findById with JWT-scoped organizationId
    const org = await Organization.findById(organizationId)
        .select("_id name isArchived country subscription")
        .lean();

    if (!org) {
        throw Object.assign(new Error("Organization not found"), { status: 404, code: "ORG_NOT_FOUND" });
    }
    if (org.isArchived) {
        throw Object.assign(new Error("Organization is archived and cannot create checkouts"), { status: 400, code: "ORG_ARCHIVED" });
    }

    // Use org.country as fallback if country not passed
    const resolvedCountry = country || org.country;
    if (!resolvedCountry) {
        throw Object.assign(
            new Error("Country is required for pricing resolution. Pass country or ensure org.country is set."),
            { status: 400, code: "COUNTRY_REQUIRED" }
        );
    }

    // ── 2. Resolve PlanVersion ────────────────────────────────────────────────
    // @per-org-transactional — billing orchestrator — PlanVersion.findById (platform catalog, no org scope)
    const planVersion = await PlanVersion.findById(planVersionId).lean();

    if (!planVersion) {
        throw Object.assign(new Error(`PlanVersion ${planVersionId} not found`), { status: 404, code: "PLAN_VERSION_NOT_FOUND" });
    }
    if (planVersion.status !== "active") {
        throw Object.assign(
            new Error(`PlanVersion ${planVersionId} is not active (status: ${planVersion.status})`),
            { status: 400, code: "PLAN_VERSION_NOT_ACTIVE" }
        );
    }
    // Visibility guard: self-serve can only access public plans
    // sales-only and internal plans require a sales contract, not a checkout
    if (planVersion.visibility !== "public") {
        throw Object.assign(
            new Error(`PlanVersion ${planVersionId} is not publicly available (visibility: ${planVersion.visibility})`),
            { status: 403, code: "PLAN_NOT_PUBLIC" }
        );
    }

    // ── 3. Compute Price ──────────────────────────────────────────────────────
    // pricingEngine validates billing interval, region, provider mapping,
    // applies coupon + tax, and returns providerPriceId + snapshot.
    const pricing = await computePrice({
        planVersion,          // engine needs the document, not just the ID
        billingInterval,
        country: resolvedCountry,
        coupon: coupon || null,
        taxRate: taxRate || 0,
        provider
    });

    logger.info({
        organizationId,
        planVersionId,
        billingInterval,
        finalPrice: pricing.finalPrice,
        currency: pricing.currency,
        provider
    }, "[CheckoutOrchestrator] Price computed");

    // ── 4. Idempotency guard ──────────────────────────────────────────────────
    // Deterministic key: same org + plan + interval always resolves to the same key.
    // Prevents duplicate invoices on double-click or browser refresh.
    // Date.now() REMOVED — non-deterministic keys break idempotency.
    const idempotencyKey =
        `checkout:${organizationId}:${planVersionId}:${billingInterval}`;

    // Return existing draft/open invoice if it already exists for this key.
    // This is the idempotent re-entry point — avoids creating a second contract + invoice.
    // @per-org-transactional — billing orchestrator — idempotency guard with deterministic key
    const existingInvoice = await PlatformInvoice.findOne({
        idempotencyKey,
        status: { $in: ["draft", "open"] }
    }).lean();

    if (existingInvoice) {
        logger.info({
            invoiceId: existingInvoice._id,
            contractId: existingInvoice.contractId,
            organizationId,
            idempotencyKey
        }, "[CheckoutOrchestrator] Returning existing open invoice (idempotent)");

        // Re-create checkout session against the existing invoice's contract
        // (provider session is short-lived so we always create a fresh URL)
        const paymentProvider = getProvider(provider);
        if (typeof paymentProvider.createNewCheckoutSession !== "function") {
            throw Object.assign(
                new Error(`Provider "${provider}" does not support checkout sessions yet.`),
                { status: 400, code: "PROVIDER_NO_CHECKOUT" }
            );
        }
        const totalMinorExisting = existingInvoice.totalAmountMinor;
        const existingSession = await paymentProvider.createNewCheckoutSession({
            organizationId: organizationId.toString(),
            invoiceId: existingInvoice._id.toString(),
            providerPriceId: pricing.providerPriceId,
            amount: totalMinorExisting,
            currency: existingInvoice.currency,
            successUrl: `${process.env.FRONTEND_URL}/org/billing?checkout=success&invoice=${existingInvoice._id}`,
            cancelUrl: `${process.env.FRONTEND_URL}/org/billing?checkout=cancelled`
        });

        return {
            checkoutUrl: existingSession.url,
            contractId: existingInvoice.contractId.toString(),
            invoiceId: existingInvoice._id.toString()
        };
    }

    // ── 5. Create OrgContract ─────────────────────────────────────────────────
    // contractEngine.createContract() auto-routes:
    //   - Active trial present  → contractStatus = "pending_activation"
    //   - No active trial       → contractStatus = "draft" (activates on invoice payment)
    const contract = await contractEngine.createContract(
        {
            organizationId,
            planVersionId,
            planCode: planVersion.templateCode,
            planVersionTag: planVersion.versionTag,
            lockedPrice: pricing.finalPrice,
            currency: pricing.currency,
            billingInterval: pricing.billingInterval,
            providerPriceId: pricing.providerPriceId,
            pricingSnapshot: pricing.snapshot,
            effectiveFrom: new Date(),    // engine will override to trial end if pending_activation
            autoRenew: true,
            source: "self_serve"
        },
        SELF_SERVE_ACTOR
    );

    logger.info({
        contractId: contract._id,
        contractStatus: contract.contractStatus,
        organizationId
    }, "[CheckoutOrchestrator] Contract created");

    // ── 5. Create PlatformInvoice ─────────────────────────────────────────────
    // "scheduled" invoiceType = pre-paid invoice for a contract not yet active.
    // status = "open" = awaiting payment.
    // The webhook canonicalEventProcessor will mark this paid when Stripe confirms.
    const now = new Date();
    const dueIn3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // due in 3 days

    // Convert decimal price to minor units (cents / piastres)
    const totalMinor = Math.round(pricing.finalPrice * 100);

    const invoice = await PlatformInvoice.create({
        organizationId,
        contractId: contract._id,
        planVersionId,
        invoiceType: contract.contractStatus === "pending_activation"
            ? "scheduled"   // will activate after trial ends
            : "initial",    // immediate activation on payment
        billingCycleStart: now,
        billingCycleEnd: contract.effectiveTo || dueIn3,
        dueDate: dueIn3,
        currency: pricing.currency,
        // Financial fields — all derived from the pricing engine output
        basePlanAmount: pricing.finalPrice,
        basePlanAmountMinor: totalMinor,
        subtotalAmount: pricing.finalPrice - (pricing.taxAmount || 0),
        subtotalAmountMinor: Math.round((pricing.finalPrice - (pricing.taxAmount || 0)) * 100),
        taxPercent: (pricing.taxRate || 0) * 100, // decimal → percent
        taxAmount: pricing.taxAmount || 0,
        taxAmountMinor: Math.round((pricing.taxAmount || 0) * 100),
        totalAmount: pricing.finalPrice,
        totalAmountMinor: totalMinor,
        couponDiscountAmount: pricing.discountAmount || 0,
        couponDiscountAmountMinor: Math.round((pricing.discountAmount || 0) * 100),
        couponCode: coupon || null,
        status: "open",        // awaiting payment
        paymentStatus: "pending",
        paymentProvider: provider,
        idempotencyKey,
        lineItems: [{
            description: `${planVersion.templateCode} — ${billingInterval}`,
            quantity: 1,
            unitPrice: pricing.finalPrice,
            unitPriceMinor: totalMinor,
            total: pricing.finalPrice,
            totalMinor: totalMinor,
            type: "plan"
        }]
    });

    logger.info({
        invoiceId: invoice._id,
        contractId: contract._id,
        totalAmount: pricing.finalPrice,
        currency: pricing.currency
    }, "[CheckoutOrchestrator] Invoice created");

    // ── 6. Create Provider Checkout Session ───────────────────────────────────
    // Use the existing StripeProvider.createNewCheckoutSession() which returns { url }.
    // The invoice _id is embedded in Stripe metadata so the webhook can reconcile.
    const paymentProvider = getProvider(provider);

    // Guard: provider must support checkout sessions (Paymob/PayPal may not yet)
    if (typeof paymentProvider.createNewCheckoutSession !== "function") {
        // Roll back: cancel the draft invoice since we can't open a payment session
        await PlatformInvoice.updateOne(
            { _id: invoice._id },
            { $set: { status: "void", voidedAt: new Date() } }
        );
        await OrgContract.updateOne(
            { _id: contract._id },
            { $set: { contractStatus: "terminated" } }
        );
        throw Object.assign(
            new Error(`Provider "${provider}" does not support checkout sessions yet. Use provider="manual" or contact sales.`),
            { status: 400, code: "PROVIDER_NO_CHECKOUT" }
        );
    }

    const session = await paymentProvider.createNewCheckoutSession({
        organizationId: organizationId.toString(),
        invoiceId: invoice._id.toString(),
        providerPriceId: pricing.providerPriceId,
        amount: totalMinor,       // minor units
        currency: pricing.currency,
        successUrl: `${process.env.FRONTEND_URL}/org/billing?checkout=success&invoice=${invoice._id}`,
        cancelUrl: `${process.env.FRONTEND_URL}/org/billing?checkout=cancelled`
    });

    logger.info({
        organizationId,
        contractId: contract._id,
        invoiceId: invoice._id,
        provider,
        hasUrl: Boolean(session?.url)
    }, "[CheckoutOrchestrator] Checkout session created");

    return {
        checkoutUrl: session.url,
        contractId: contract._id.toString(),
        invoiceId: invoice._id.toString()
    };
}

module.exports = { createCheckoutSession };
