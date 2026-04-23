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
const {
  computePrice
} = require("@billing/pricing/pricingEngine.service");
const contractEngine = require("@billing/services/contractEngine.service");
const {
  getProvider
} = require("@billing/providers/paymentProviderFactory");
const {
  assertProviderSupported
} = require("@utils/providerGuard");
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
/**
 * @deprecated Phase 10 — use `createUnifiedCheckout`.
 * The old self-serve checkout path. Still routed at
 * `POST /api/org/v1/billing/checkout-session` until the frontend migrates.
 * Every invocation emits LEGACY_PATH_USED so SRE can track residual traffic.
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
  // Phase 10 — legacy-path observability. Greppable: LEGACY_PATH_USED.
  logger.warn({
    event: "LEGACY_PATH_USED",
    path: "createCheckoutSession",
    organizationId: organizationId ? String(organizationId) : null,
    planVersionId,
    provider
  }, "[checkoutOrchestrator] LEGACY checkout path used — migrate caller to /api/org/v1/checkout");

  // ── Guard: payment provider (Phase 1 Hardening — ported into live path) ─
  // Runs before any DB work so unsupported providers (e.g. "kashier" when
  // the flag is off) fail fast with a clear code instead of crashing at
  // the factory with an opaque message.
  assertProviderSupported(provider);

  // ── Guard: billing interval ───────────────────────────────────────────────
  if (!VALID_INTERVALS.includes(billingInterval)) {
    throw Object.assign(new Error(`Invalid billingInterval "${billingInterval}". Must be one of: ${VALID_INTERVALS.join(", ")}`), {
      status: 400,
      code: "INVALID_BILLING_INTERVAL"
    });
  }

  // ── 1. Resolve Organization ───────────────────────────────────────────────
  // @per-org-transactional — billing orchestrator — Organization.findById with JWT-scoped organizationId
  const org = await Organization.findById(organizationId).select("_id name isArchived country subscription").lean();
  if (!org) {
    throw Object.assign(new Error("Organization not found"), {
      status: 404,
      code: "ORG_NOT_FOUND"
    });
  }
  if (org.isArchived) {
    throw Object.assign(new Error("Organization is archived and cannot create checkouts"), {
      status: 400,
      code: "ORG_ARCHIVED"
    });
  }

  // Use org.country as fallback if country not passed
  const resolvedCountry = country || org.country;
  if (!resolvedCountry) {
    throw Object.assign(new Error("Country is required for pricing resolution. Pass country or ensure org.country is set."), {
      status: 400,
      code: "COUNTRY_REQUIRED"
    });
  }

  // ── 2. Resolve PlanVersion ────────────────────────────────────────────────
  // @per-org-transactional — billing orchestrator — PlanVersion.findById (platform catalog, no org scope)
  const planVersion = await PlanVersion.findById(planVersionId).lean();
  if (!planVersion) {
    throw Object.assign(new Error(`PlanVersion ${planVersionId} not found`), {
      status: 404,
      code: "PLAN_VERSION_NOT_FOUND"
    });
  }
  if (planVersion.status !== "active") {
    throw Object.assign(new Error(`PlanVersion ${planVersionId} is not active (status: ${planVersion.status})`), {
      status: 400,
      code: "PLAN_VERSION_NOT_ACTIVE"
    });
  }
  // Visibility guard: self-serve can only access public plans
  // sales-only and internal plans require a sales contract, not a checkout
  if (planVersion.visibility !== "public") {
    throw Object.assign(new Error(`PlanVersion ${planVersionId} is not publicly available (visibility: ${planVersion.visibility})`), {
      status: 403,
      code: "PLAN_NOT_PUBLIC"
    });
  }

  // ── 3. Compute Price ──────────────────────────────────────────────────────
  // pricingEngine validates billing interval, region, provider mapping,
  // applies coupon + tax, and returns providerPriceId + snapshot.
  const pricing = await computePrice({
    planVersion,
    // engine needs the document, not just the ID
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
  const idempotencyKey = `checkout:${organizationId}:${planVersionId}:${billingInterval}`;

  // Return existing draft/open invoice if it already exists for this key.
  // This is the idempotent re-entry point — avoids creating a second contract + invoice.
  // @per-org-transactional — billing orchestrator — idempotency guard with deterministic key
  const existingInvoice = await PlatformInvoice.findOne({
    idempotencyKey,
    status: {
      $in: ["draft", "open"]
    }
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
      throw Object.assign(new Error(`Provider "${provider}" does not support checkout sessions yet.`), {
        status: 400,
        code: "PROVIDER_NO_CHECKOUT"
      });
    }
    const totalMinorExisting = existingInvoice.totalAmountMinor;
    const existingSession = await paymentProvider.createNewCheckoutSession({
      invoiceId: existingInvoice._id.toString(),
      // Phase 3 (ported): Kashier webhook resolves contract via contractId
      // and no longer falls back to invoice. Stripe destructures only what
      // it uses, so extras are harmless.
      contractId: existingInvoice.contractId?.toString(),
      planVersionId: planVersionId?.toString(),
      interval: billingInterval,
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
  const contract = await contractEngine.createContract({
    planVersionId,
    planCode: planVersion.templateCode,
    planVersionTag: planVersion.versionTag,
    lockedPrice: pricing.finalPrice,
    currency: pricing.currency,
    billingInterval: pricing.billingInterval,
    providerPriceId: pricing.providerPriceId,
    pricingSnapshot: pricing.snapshot,
    effectiveFrom: new Date(),
    // engine will override to trial end if pending_activation
    autoRenew: true,
    source: "self_serve"
  }, SELF_SERVE_ACTOR);
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
    contractId: contract._id,
    planVersionId,
    invoiceType: contract.contractStatus === "pending_activation" ? "scheduled" // will activate after trial ends
    : "initial",
    // immediate activation on payment
    billingCycleStart: now,
    billingCycleEnd: contract.effectiveTo || dueIn3,
    dueDate: dueIn3,
    currency: pricing.currency,
    // Financial fields — all derived from the pricing engine output
    basePlanAmount: pricing.finalPrice,
    basePlanAmountMinor: totalMinor,
    subtotalAmount: pricing.finalPrice - (pricing.taxAmount || 0),
    subtotalAmountMinor: Math.round((pricing.finalPrice - (pricing.taxAmount || 0)) * 100),
    taxPercent: (pricing.taxRate || 0) * 100,
    // decimal → percent
    taxAmount: pricing.taxAmount || 0,
    taxAmountMinor: Math.round((pricing.taxAmount || 0) * 100),
    totalAmount: pricing.finalPrice,
    totalAmountMinor: totalMinor,
    couponDiscountAmount: pricing.discountAmount || 0,
    couponDiscountAmountMinor: Math.round((pricing.discountAmount || 0) * 100),
    couponCode: coupon || null,
    status: "open",
    // awaiting payment
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
    await PlatformInvoice.updateOne({
      _id: invoice._id
    }, {
      $set: {
        status: "void",
        voidedAt: new Date()
      }
    });
    await OrgContract.updateOne({
      _id: contract._id
    }, {
      $set: {
        contractStatus: "terminated"
      }
    });
    throw Object.assign(new Error(`Provider "${provider}" does not support checkout sessions yet. Use provider="manual" or contact sales.`), {
      status: 400,
      code: "PROVIDER_NO_CHECKOUT"
    });
  }
  const session = await paymentProvider.createNewCheckoutSession({
    invoiceId: invoice._id.toString(),
    // Phase 3 (ported): required by Kashier webhook (no invoice fallback).
    contractId: contract._id.toString(),
    planVersionId: planVersionId?.toString(),
    interval: billingInterval,
    providerPriceId: pricing.providerPriceId,
    amount: totalMinor,
    // minor units
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

// ═════════════════════════════════════════════════════════════════════════════
// Phase 4 — Unified Checkout
//
// Single pipeline for every provider. Replaces the older `createCheckoutSession`
// long-term; kept side-by-side for now so existing `/billing/checkout-session`
// callers are not disturbed.
//
// Strict, minimal flow:
//   1. input validation (PROVIDER_REQUIRED / PLAN_REQUIRED / INTERVAL_REQUIRED)
//   2. provider guard  — runs EARLY (before any DB write) so blocked providers
//                         never leave orphan contracts behind. This is a
//                         deliberate deviation from the brief's numbered
//                         "step 4" position; per Phase 2 Hardening, early
//                         failure is the safer invariant.
//   3. resolve org + plan
//   4. resolvePrice({ org, plan, interval })  ← pricing engine = FX-aware
//      but never provider-aware (see resolvePrice.js FX advisory).
//   5. create OrgContract
//   6. create PlatformInvoice (keeps Stripe webhook reconciliation working)
//   7. provider.createCheckout({ amountMinor, currency, metadata })  ← uniform
//   8. structured CHECKOUT_CREATED log
//   9. return { checkoutUrl, provider, contractId }
//
// Provider-specific branches live ONLY inside each provider's createCheckout
// implementation. The orchestrator stays provider-agnostic.
// ═════════════════════════════════════════════════════════════════════════════

const {
  resolvePrice
} = require("@billing/pricing/resolvePrice");
const {
  resolveEffectiveProvider
} = require("@billing/services/checkoutPolicy.service");

/**
 * createUnifiedCheckout
 *
 * @param {object} params
 * @param {string} params.organizationId
 * @param {string} params.planVersionId
 * @param {string} params.billingInterval  — "monthly" | "yearly" | "biennial"
 * @param {string} params.provider         — "stripe" | "kashier"
 * @returns {Promise<{ checkoutUrl: string, provider: string, contractId: string, invoiceId: string }>}
 */
async function createUnifiedCheckout({
  organizationId,
  planVersionId,
  billingInterval,
  provider: requestedProvider
}) {
  // ── 1. Input validation ───────────────────────────────────────────────────
  if (!requestedProvider) {
    throw Object.assign(new Error("PROVIDER_REQUIRED"), {
      code: "PROVIDER_REQUIRED",
      status: 400
    });
  }
  if (!planVersionId) {
    throw Object.assign(new Error("PLAN_REQUIRED"), {
      code: "PLAN_REQUIRED",
      status: 400
    });
  }
  if (!billingInterval) {
    throw Object.assign(new Error("INTERVAL_REQUIRED"), {
      code: "INTERVAL_REQUIRED",
      status: 400
    });
  }
  if (!VALID_INTERVALS.includes(billingInterval)) {
    throw Object.assign(new Error(`Invalid billingInterval "${billingInterval}". Must be one of: ${VALID_INTERVALS.join(", ")}`), {
      status: 400,
      code: "INVALID_BILLING_INTERVAL"
    });
  }
  if (!organizationId) {
    throw Object.assign(new Error("ORG_REQUIRED"), {
      code: "ORG_REQUIRED",
      status: 400
    });
  }

  // ── 2. Early provider guard (prevents orphan contracts) ──────────────────
  // Runs on the REQUESTED provider before any DB work. The policy may
  // later promote/remap the provider; we re-guard after that.
  assertProviderSupported(requestedProvider);

  // ── 3. Resolve org + plan ────────────────────────────────────────────────
  const org = await Organization.findById(organizationId).select("_id name isArchived country billingCountry subscription").lean();
  if (!org) {
    throw Object.assign(new Error("Organization not found"), {
      status: 404,
      code: "ORG_NOT_FOUND"
    });
  }
  if (org.isArchived) {
    throw Object.assign(new Error("Organization is archived"), {
      status: 400,
      code: "ORG_ARCHIVED"
    });
  }
  const planVersion = await PlanVersion.findById(planVersionId).lean();
  if (!planVersion) {
    throw Object.assign(new Error(`PlanVersion ${planVersionId} not found`), {
      status: 404,
      code: "PLAN_VERSION_NOT_FOUND"
    });
  }
  if (planVersion.status !== "active") {
    throw Object.assign(new Error(`PlanVersion is not active (status: ${planVersion.status})`), {
      status: 400,
      code: "PLAN_NOT_ACTIVE"
    });
  }

  // ── 4. Resolve price (Phase 1 path — global pricing + FX for EG) ─────────
  const pricing = await resolvePrice({
    org,
    plan: planVersion,
    interval: billingInterval
  });

  // ── 5. Provider policy — single source of truth for the decision ─────────
  // `effectiveProvider` is used EVERYWHERE downstream: guard, factory,
  // contract, metadata, log. Phase 7: the policy forces EG billingCountry
  // orgs to Kashier regardless of `requestedProvider`.
  const effectiveProvider = resolveEffectiveProvider({
    org,
    requestedProvider,
    pricing
  });

  // ── PROVIDER_RESOLUTION — audit log for policy decisions ────────────────
  logger.info({
    event: "PROVIDER_RESOLUTION",
    orgId: String(org._id),
    billingCountry: org.billingCountry || null,
    requestedProvider,
    effectiveProvider
  }, "[checkoutOrchestrator] provider resolved");

  // ── Phase 9 hardening — Section 1: PRICING ↔ POLICY consistency ─────────
  // Pricing layer and policy layer both decide a provider. They MUST agree.
  // Today they're both keyed on billingCountry, so divergence is impossible
  // through normal code paths — this assertion exists to catch refactor
  // regressions that drift the two halves apart.
  if (pricing.provider && pricing.provider !== effectiveProvider) {
    throw Object.assign(new Error(`PRICING_POLICY_MISMATCH: pricing.provider=${pricing.provider} but effectiveProvider=${effectiveProvider}`), {
      code: "PRICING_POLICY_MISMATCH",
      status: 500,
      pricingProvider: pricing.provider,
      effectiveProvider
    });
  }

  // ── EG → Kashier safety guard ───────────────────────────────────────────
  // Belt-and-braces assertion: if billingCountry === "EG" the policy MUST
  // have chosen Kashier. If a future policy change ever breaks this
  // invariant, fail loudly here rather than silently routing an EG payment
  // through Stripe (which cannot settle EGP cleanly).
  if (org.billingCountry === "EG" && effectiveProvider !== "kashier") {
    throw Object.assign(new Error("PROVIDER_POLICY_VIOLATION: EG orgs must use Kashier"), {
      code: "PROVIDER_POLICY_VIOLATION",
      status: 500
    });
  }

  // Re-guard on the effective value — future policies could promote to a
  // provider the allow-list does not yet include; this is the safety net.
  assertProviderSupported(effectiveProvider);

  // ── 6. Create OrgContract ────────────────────────────────────────────────
  const lockedPriceDecimal = pricing.amountMinor / 100;
  const contract = await contractEngine.createContract({
    planVersionId,
    planCode: planVersion.templateCode,
    planVersionTag: planVersion.versionTag,
    lockedPrice: lockedPriceDecimal,
    currency: pricing.currency,
    billingInterval,
    providerPriceId: pricing.providerPriceId,
    // Phase 5 — Task 4: persist effective provider (not raw request).
    paymentProvider: effectiveProvider,
    pricingSnapshot: {
      currency: pricing.currency,
      amountMinor: pricing.amountMinor,
      resolvedVia: pricing.resolvedVia,
      source: pricing.source,
      usdAmount: pricing.usdAmount
    },
    effectiveFrom: new Date(),
    autoRenew: true,
    source: "self_serve"
  }, SELF_SERVE_ACTOR);

  // ── 7. Create PlatformInvoice ────────────────────────────────────────────
  // Kept so Stripe webhook's existing invoice-based reconciliation keeps
  // working. Kashier doesn't need it, but harmless to populate.
  //
  // Phase 9 hardening — Section 5: confirm invoice amount aligns with
  // contract. Both derive from the same `pricing.amountMinor` source by
  // construction; this assertion exists so a future refactor that splits
  // the source can never silently let invoice and contract drift apart.
  const contractAmountMinor = Math.round(contract.lockedPrice * 100);
  if (pricing.amountMinor !== contractAmountMinor) {
    throw Object.assign(new Error(`INVOICE_AMOUNT_MISMATCH: invoice=${pricing.amountMinor}, contract=${contractAmountMinor}`), {
      code: "INVOICE_AMOUNT_MISMATCH",
      status: 500,
      invoiceAmountMinor: pricing.amountMinor,
      contractAmountMinor
    });
  }
  const now = new Date();
  const dueIn3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const invoice = await PlatformInvoice.create({
    contractId: contract._id,
    planVersionId,
    invoiceType: contract.contractStatus === "pending_activation" ? "scheduled" : "initial",
    billingCycleStart: now,
    billingCycleEnd: contract.effectiveTo || dueIn3,
    dueDate: dueIn3,
    currency: pricing.currency,
    basePlanAmount: lockedPriceDecimal,
    basePlanAmountMinor: pricing.amountMinor,
    subtotalAmount: lockedPriceDecimal,
    subtotalAmountMinor: pricing.amountMinor,
    taxPercent: 0,
    taxAmount: 0,
    taxAmountMinor: 0,
    totalAmount: lockedPriceDecimal,
    totalAmountMinor: pricing.amountMinor,
    couponDiscountAmount: 0,
    couponDiscountAmountMinor: 0,
    couponCode: null,
    status: "open",
    paymentStatus: "pending",
    paymentProvider: effectiveProvider,
    idempotencyKey: `checkout-unified:${organizationId}:${planVersionId}:${billingInterval}:${effectiveProvider}`,
    lineItems: [{
      description: `${planVersion.templateCode} — ${billingInterval}`,
      quantity: 1,
      unitPrice: lockedPriceDecimal,
      unitPriceMinor: pricing.amountMinor,
      total: lockedPriceDecimal,
      totalMinor: pricing.amountMinor,
      type: "plan"
    }]
  });

  // ── 8. Build provider metadata + validate (Phase 9 — Section 2) ─────────
  // Hoisted so every required field can be checked BEFORE we hit the
  // provider. Missing any of orgId/planVersionId/contractId/invoiceId/interval
  // means we constructed something corrupt earlier in this function — fail
  // fast with the exact field name instead of letting the provider get
  // null metadata it can't echo back to its webhook.
  const successUrl = `${process.env.FRONTEND_URL}/org/billing?checkout=success&invoice=${invoice._id}`;
  const cancelUrl = `${process.env.FRONTEND_URL}/org/billing?checkout=cancelled`;
  const providerMetadata = {
    orgId: organizationId.toString(),
    planVersionId: planVersionId?.toString(),
    contractId: contract._id.toString(),
    invoiceId: invoice._id.toString(),
    interval: billingInterval,
    providerPriceId: pricing.providerPriceId || null,
    successUrl,
    cancelUrl,
    // Canonical name expected by KashierProvider's real-API payload.
    returnUrl: successUrl
  };
  for (const key of ["orgId", "planVersionId", "contractId", "invoiceId", "interval"]) {
    if (!providerMetadata[key]) {
      throw Object.assign(new Error(`CHECKOUT_METADATA_MISSING: ${key}`), {
        code: "CHECKOUT_METADATA_MISSING",
        status: 500,
        missingField: key
      });
    }
  }

  // ── Final-hardening — Section 9: UNKNOWN_PROVIDER_RUNTIME guard ─────────
  // Belt-and-braces: by this point the early guard, the policy, the
  // PRICING_POLICY_MISMATCH check and the PROVIDER_POLICY_VIOLATION check
  // have all run, but a deferred-resolution bug could still let an
  // unsupported value through. Inline whitelist refuses anything else.
  if (!["stripe", "kashier"].includes(effectiveProvider)) {
    throw Object.assign(new Error(`UNKNOWN_PROVIDER_RUNTIME: ${effectiveProvider}`), {
      code: "UNKNOWN_PROVIDER_RUNTIME",
      status: 500,
      provider: effectiveProvider
    });
  }

  // ── Final-hardening — Section 7: KASHIER_CHECKOUT_INITIATED audit ───────
  // Single emit point so support / SRE can grep "KASHIER_CHECKOUT_INITIATED"
  // and see every Kashier checkout the platform has opened.
  if (effectiveProvider === "kashier") {
    logger.info({
      event: "KASHIER_CHECKOUT_INITIATED",
      orgId: organizationId.toString(),
      contractId: contract._id.toString(),
      amountMinor: pricing.amountMinor,
      currency: pricing.currency
    }, "[checkoutOrchestrator] Kashier checkout initiated");
  }
  const providerInstance = getProvider(effectiveProvider);
  const session = await providerInstance.createCheckout({
    amountMinor: pricing.amountMinor,
    currency: pricing.currency,
    metadata: providerMetadata
  });

  // ── 9. Structured audit log (Phase 9 — Section 7: full context) ─────────
  logger.info({
    event: "CHECKOUT_CREATED",
    orgId: organizationId.toString(),
    billingCountry: org.billingCountry || null,
    requestedProvider,
    effectiveProvider,
    contractId: contract._id.toString(),
    invoiceId: invoice._id.toString(),
    planVersionId: planVersionId.toString(),
    amountMinor: pricing.amountMinor,
    currency: pricing.currency
  }, "[checkoutOrchestrator] unified checkout created");

  // ── 10. Response shape (Final-hardening — Section 4) ────────────────────
  // Every field MUST be a non-empty string before we hand the response back
  // to the controller. A null `checkoutUrl` would push a broken redirect to
  // the user; a null contractId/invoiceId would break the success page's
  // reconciliation.
  const response = {
    checkoutUrl: session.url,
    provider: effectiveProvider,
    contractId: contract._id.toString(),
    invoiceId: invoice._id.toString()
  };
  for (const [key, value] of Object.entries(response)) {
    if (!value || typeof value !== "string") {
      throw Object.assign(new Error(`CHECKOUT_RESPONSE_INVALID: ${key} is missing or non-string`), {
        code: "CHECKOUT_RESPONSE_INVALID",
        status: 500,
        missingField: key
      });
    }
  }
  return response;
}
module.exports = {
  createCheckoutSession,
  createUnifiedCheckout
};