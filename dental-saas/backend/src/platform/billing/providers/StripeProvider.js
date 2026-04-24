/**
 * StripeProvider.js
 * Stripe implementation of the PaymentProvider interface.
 * v12.0 — Extracted from platformStripe.adapter.js
 *
 * ALL Stripe SDK usage in the platform is consolidated here.
 * No other file may require("stripe") or instantiate Stripe directly.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const PaymentProvider = require("./PaymentProvider");
const logger = require("@utils/logger");
const {
  metrics
} = require("@infra/metrics/metrics");
const Stripe = require("stripe");
let _stripeInstance = null;
function getStripe() {
  if (!_stripeInstance) {
    _stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock", {
      apiVersion: "2023-10-16",
      timeout: 10000
    });
  }
  return _stripeInstance;
}
class StripeProvider extends PaymentProvider {
  // ─── Subscription Operations ───────────────────────────────────────────

  async createSubscription(org, plan, interval, autoRenew) {
    const stripe = getStripe();
    try {
      logger.info(`[StripeProvider] Creating Subscription for Org ${org._id}`);

      // Resolve price ID by interval from providerPriceIds
      const priceId = this._resolvePriceId(plan, interval);
      const subscription = await stripe.subscriptions.create({
        customer: org.subscription.providerCustomerId,
        items: [{
          price: priceId
        }],
        cancel_at_period_end: !autoRenew,
        metadata: {
          organizationId: org._id.toString()
        }
      });
      return {
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000)
      };
    } catch (err) {
      this._handleError(err, "createSubscription");
    }
  }
  async cancelSubscription(subscriptionId, options = {}) {
    const stripe = getStripe();
    try {
      const {
        cancelAtPeriodEnd = true,
        idempotencyKey
      } = options;
      logger.info({
        subscriptionId,
        cancelAtPeriodEnd
      }, "[StripeProvider] Canceling subscription");
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: cancelAtPeriodEnd
      }, idempotencyKey ? {
        idempotencyKey
      } : {});
      return {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      };
    } catch (err) {
      this._handleError(err, "cancelSubscription");
    }
  }
  async getSubscription(subscriptionId) {
    const stripe = getStripe();
    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (err) {
      this._handleError(err, "getSubscription");
    }
  }
  async updateAutoRenew(subscriptionId, autoRenew) {
    const stripe = getStripe();
    try {
      logger.info({
        subscriptionId,
        autoRenew
      }, "[StripeProvider] Updating auto-renew");
      await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: !autoRenew
      });
    } catch (err) {
      this._handleError(err, "updateAutoRenew");
    }
  }

  // ─── Refund Operations ─────────────────────────────────────────────────

  async refundPayment(paymentId, amountMinor, idempotencyKey) {
    const stripe = getStripe();
    try {
      logger.info({
        paymentId,
        amountMinor
      }, "[StripeProvider] Executing refund");
      const refund = await stripe.refunds.create({
        payment_intent: paymentId,
        amount: amountMinor,
        metadata: {
          idempotencyKey
        }
      }, {
        idempotencyKey
      });
      return {
        id: refund.id,
        status: refund.status
      };
    } catch (err) {
      this._handleError(err, "refundPayment");
    }
  }
  async listRefunds(paymentId) {
    const stripe = getStripe();
    try {
      const refunds = await stripe.refunds.list({
        payment_intent: paymentId,
        limit: 10
      });
      return refunds.data.map(r => ({
        id: r.id,
        amount: r.amount,
        status: r.status
      }));
    } catch (err) {
      this._handleError(err, "listRefunds");
    }
  }

  // ─── Customer Credit ───────────────────────────────────────────────────

  async applyCustomerCredit(customerId, amountMinor, currency, idempotencyKey) {
    const stripe = getStripe();
    try {
      logger.info({
        customerId,
        amountMinor,
        currency
      }, "[StripeProvider] Adjusting customer balance (credit)");
      const transaction = await stripe.customers.createBalanceTransaction(customerId, {
        amount: -Math.abs(amountMinor),
        currency: currency.toLowerCase(),
        description: "Platform Credit Adjustment"
      }, {
        idempotencyKey
      });
      return {
        id: transaction.id,
        amount: transaction.amount,
        endingBalance: transaction.ending_balance
      };
    } catch (err) {
      this._handleError(err, "applyCustomerCredit");
    }
  }
  async listCustomerBalanceTransactions(customerId) {
    const stripe = getStripe();
    try {
      const transactions = await stripe.customers.listBalanceTransactions(customerId, {
        limit: 20
      });
      return transactions.data;
    } catch (err) {
      this._handleError(err, "listCustomerBalanceTransactions");
    }
  }

  /**
   * chargeInvoice
   * Off-session charge via PaymentIntents API for dunning engine.
   * Uses customer's default stored payment method.
   */
  async chargeInvoice(customerId, {
    amountMinor,
    currency,
    idempotencyKey
  }) {
    const stripe = getStripe();
    try {
      logger.info({
        customerId,
        amountMinor,
        currency
      }, "[StripeProvider] Dunning: creating off-session payment intent");

      // Resolve default payment method from customer
      const customer = await stripe.customers.retrieve(customerId);
      const paymentMethodId = customer.invoice_settings?.default_payment_method;
      if (!paymentMethodId) {
        throw new Error(`[StripeProvider] No default payment method on customer ${customerId}`);
      }
      const intent = await stripe.paymentIntents.create({
        amount: amountMinor,
        currency,
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        // Automatic retry handled by dunning engine — disable Stripe's built-in retry
        payment_method_options: {
          card: {
            request_three_d_secure: "automatic"
          }
        }
      }, {
        idempotencyKey
      });
      return {
        id: intent.id,
        status: intent.status // "succeeded" | "requires_action" | "canceled" etc.
      };
    } catch (err) {
      this._handleError(err, "chargeInvoice");
    }
  }

  // ─── Webhook ───────────────────────────────────────────────────────────

  /**
   * verifyWebhookSignature
   * Verifies Stripe webhook signature. Throws on invalid signature.
   * @returns {object} Verified Stripe event
   */
  verifyWebhookSignature(payload, signature, secret) {
    const stripe = getStripe();
    return stripe.webhooks.constructEvent(payload, signature, secret);
  }

  /**
   * parseEvent — Phase 6 canonical adapter (matches KashierProvider.parseEvent).
   *
   * Emits the same shape the unified dispatcher (handlePaymentSuccess) expects,
   * so Stripe and Kashier flow through one downstream pipeline. Only two
   * Stripe event types are meaningful here:
   *
   *   - `checkout.session.completed` → "payment_success"
   *       Uses the session metadata we set in createNewCheckoutSession
   *       (orgId, contractId, planVersionId, interval).
   *   - `invoice.payment_failed`     → "payment_failed"
   *
   * Everything else returns `{ type: "ignored" }` — the webhook controller
   * short-circuits on those and, for non-checkout events (subscription.updated
   * etc.), falls through to the legacy canonicalEventProcessor so renewals
   * keep working. This function is intentionally narrow.
   *
   * @param {object} rawEvent - verified Stripe event object
   * @returns {object} canonical event (payment_success | payment_failed | ignored)
   */
  parseEvent(rawEvent) {
    if (!rawEvent || !rawEvent.type) {
      return {
        type: "ignored",
        provider: "stripe"
      };
    }
    const type = rawEvent.type;
    if (type === "checkout.session.completed") {
      const obj = rawEvent.data?.object || {};
      const m = obj.metadata || {};
      const amount = typeof obj.amount_total === "number" ? obj.amount_total : null;
      const paymentId = obj.id || rawEvent.id;
      return {
        type: "payment_success",
        provider: "stripe",
        eventId: rawEvent.id,
        externalId: paymentId,
        paymentId,
        // Phase 8 alias — consumer code reads `event.paymentId`
        orgId: m.orgId || m.organizationId || null,
        planVersionId: m.planVersionId || null,
        contractId: m.contractId || null,
        invoiceId: m.invoiceId || m.platformInvoiceId || null,
        interval: m.interval || null,
        amount,
        // minor units (Stripe amount_total is already minor)
        amountMinor: amount,
        // alias, matches KashierProvider
        currency: (obj.currency || "usd").toUpperCase(),
        correlationId: rawEvent.id,
        metadata: m,
        raw: rawEvent
      };
    }
    if (type === "invoice.payment_failed") {
      return {
        type: "payment_failed",
        provider: "stripe",
        eventId: rawEvent.id,
        externalId: rawEvent.data?.object?.id || rawEvent.id,
        correlationId: rawEvent.id,
        raw: rawEvent
      };
    }
    return {
      type: "ignored",
      provider: "stripe",
      eventId: rawEvent.id
    };
  }

  /**
   * normalizeToCanonical
   * Translates a Stripe-specific event into the platform canonical event shape.
   * THIS IS THE ONLY PLACE Stripe event type strings may be referenced.
   * Business logic must NEVER inspect stripe event types directly.
   *
   * @param {object} stripeEvent - Raw verified Stripe event from verifyWebhookSignature()
   * @returns {object|null} Canonical event, or null if event type not handled
   */
  normalizeToCanonical(stripeEvent) {
    const obj = stripeEvent.data.object;

    // Stripe event type → canonical type mapping
    const TYPE_MAP = {
      "payment_intent.succeeded": "payment.succeeded",
      "payment_intent.payment_failed": "payment.failed",
      "charge.refunded": "refund.completed",
      "charge.dispute.created": "dispute.created",
      "customer.subscription.created": "subscription.created",
      "customer.subscription.deleted": "subscription.canceled",
      "customer.subscription.updated": "subscription.updated"
    };
    const canonicalType = TYPE_MAP[stripeEvent.type];
    if (!canonicalType) {
      // Not a handled event — return null (caller should log and skip)
      return null;
    }
    return {
      provider: "stripe",
      type: canonicalType,
      externalId: stripeEvent.id,
      amount: obj.amount || obj.amount_received || 0,
      currency: (obj.currency || "usd").toUpperCase(),
      metadata: {
        stripeEventType: stripeEvent.type,
        // preserved for debugging only
        customerId: obj.customer || null,
        subscriptionId: obj.subscription || null,
        // ── Checkout-session reconciliation fields ────────────────
        // paymentIntentId: the actual payment object ID (pi_xxx).
        // Used by handlePaymentSucceeded as PlatformInvoice.providerPaymentId.
        paymentIntentId: obj.id || null,
        // platformInvoiceId: embedded by CheckoutOrchestrator in Stripe metadata.
        // Allows invoice lookup BEFORE providerPaymentId is persisted on our side.
        platformInvoiceId: obj.metadata?.platformInvoiceId || null
      },
      raw: stripeEvent // raw preserved for diagnostics — NEVER read by business logic
    };
  }

  // ─── Checkout / Portal ─────────────────────────────────────────────────

  async createCheckoutSession(org, planId, options = {}) {
    const stripe = getStripe();
    try {
      const {
        interval,
        currency,
        autoRenew,
        salesOwnerId
      } = options;

      // MIGRATION: legacy callers pass a Plan._id; new callers should pass PlanVersion._id.
      // We attempt PlanVersion lookup first (new architecture), then fall back to template lookup.
      const PlanVersionDef = require("../../billing/models/PlanVersion.model");
      const PlanVersion = getPlatformModel(PlanVersionDef);
      const plan = await PlanVersion.findById(planId).lean();
      if (!plan) throw new Error("PlanVersion not found (legacy createCheckoutSession)");
      const priceId = this._resolvePriceId(plan, interval || "monthly");

      // Sprint 5 (M4): currency sourced from OrgContract — no direct subscription access.
      // Explicit `currency` option from caller takes precedence (allows override in tests).
      let resolvedCurrency = currency;
      if (!resolvedCurrency) {
        const {
          requireActiveContract
        } = require("../services/contractResolver.service");
        const contract = await requireActiveContract(org._id);
        resolvedCurrency = contract.currency;
      }
      const session = await stripe.checkout.sessions.create({
        customer: org.subscription?.providerCustomerId || undefined,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        subscription_data: {
          cancel_at_period_end: !autoRenew,
          metadata: {
            organizationId: org._id.toString(),
            salesOwnerId
          }
        },
        currency: resolvedCurrency,
        success_url: `${process.env.FRONTEND_URL}/org/billing?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/org/billing`
      });
      return {
        url: session.url
      };
    } catch (err) {
      this._handleError(err, "createCheckoutSession");
    }
  }

  /**
     * createNewCheckoutSession
   * Contract-first checkout — used by CheckoutOrchestrator.
   *
   * Embeds invoiceId in Stripe metadata so the webhook (canonicalEventProcessor
   * payment.succeeded) can reconcile the Stripe payment back to our PlatformInvoice.
   *
   * @param {object} p
   * @param {string} p.organizationId
   * @param {string} p.invoiceId       - PlatformInvoice._id (for webhook reconciliation)
   * @param {string} p.providerPriceId - Stripe Price ID from PlanVersion region block
   * @param {number} p.amount          - Minor currency units (e.g. 4900 = $49.00)
   * @param {string} p.currency        - ISO currency code
   * @param {string} p.successUrl
   * @param {string} p.cancelUrl
   * @returns {{ url: string, sessionId: string }}
   */
  async createNewCheckoutSession({
    organizationId,
    invoiceId,
    contractId,
    // Phase 5: passed through to Stripe metadata (no drops).
    planVersionId,
    // Phase 5: passed through to Stripe metadata (no drops).
    interval,
    // Phase 5: passed through to Stripe metadata (no drops).
    providerPriceId,
    amount,
    currency,
    successUrl,
    cancelUrl
  }) {
    const stripe = getStripe();
    try {
      logger.info({
        organizationId,
        invoiceId,
        contractId,
        providerPriceId
      }, "[StripeProvider] Creating contract-first checkout session");

      // Prefer pre-configured provider price ID (fast path).
      // Fall back to price_data for manual-override contracts.
      const lineItems = providerPriceId ? [{
        price: providerPriceId,
        quantity: 1
      }] : [{
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: amount,
          recurring: {
            interval: "month"
          },
          product_data: {
            name: "Dental SaaS Subscription"
          }
        },
        quantity: 1
      }];

      // Stripe requires metadata values to be strings and rejects
      // null/undefined. Build the dict explicitly so we never ship a
      // null field (Phase 5 — no dropped fields).
      //
      // Phase 6: canonical keys match KashierProvider's metadata shape
      // (orgId / invoiceId) so StripeProvider.parseEvent and
      // KashierProvider.parseEvent emit identical event objects.
      // Legacy keys (organizationId / platformInvoiceId) are kept for
      // the existing canonicalEventProcessor path.
      const sessionMetadata = {
        // Canonical (Phase 6)
        orgId: organizationId,
        invoiceId,
        // Legacy (canonicalEventProcessor still reads these)
        organizationId,
        platformInvoiceId: invoiceId,
        ...(contractId != null ? {
          contractId: String(contractId)
        } : {}),
        ...(planVersionId != null ? {
          planVersionId: String(planVersionId)
        } : {}),
        ...(interval ? {
          interval: String(interval)
        } : {}),
        source: "checkout_v1"
      };
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: lineItems,
        currency: currency.toLowerCase(),
        // platformInvoiceId in metadata → webhook finds PlatformInvoice on payment.succeeded
        subscription_data: {
          metadata: sessionMetadata
        },
        metadata: sessionMetadata,
        success_url: successUrl,
        cancel_url: cancelUrl
      });
      return {
        url: session.url,
        sessionId: session.id
      };
    } catch (err) {
      this._handleError(err, "createNewCheckoutSession");
    }
  }

  /**
   * createCheckout — Phase 4 unified checkout interface.
   *
   * Same shape as KashierProvider.createCheckout. Thin adapter over the
   * existing `createNewCheckoutSession` — keeps Stripe's live flow
   * untouched while giving the unified orchestrator a single call site.
   *
   * @param {object} params
   * @param {number} params.amountMinor  - Minor currency units (e.g. cents).
   * @param {string} params.currency     - ISO 4217 (e.g. "USD").
   * @param {object} params.metadata     - { orgId, invoiceId, contractId, planVersionId, interval, providerPriceId?, successUrl?, cancelUrl? }
   * @returns {Promise<{ url: string, sessionId: string, provider: "stripe" }>}
   */
  async createCheckout({
    amountMinor,
    currency,
    metadata = {}
  } = {}) {
    const session = await this.createNewCheckoutSession({
      organizationId: metadata.orgId,
      invoiceId: metadata.invoiceId,
      // Phase 5: do not drop these — Stripe webhook keeps the invoice
      // reconciliation path, but any future consumer can now read
      // contract/plan/interval directly off the Stripe session metadata.
      contractId: metadata.contractId,
      planVersionId: metadata.planVersionId,
      interval: metadata.interval,
      providerPriceId: metadata.providerPriceId || null,
      amount: amountMinor,
      currency,
      successUrl: metadata.successUrl,
      cancelUrl: metadata.cancelUrl
    });
    return {
      provider: "stripe",
      url: session.url,
      sessionId: session.sessionId
    };
  }
  async createPortalSession(customerId, returnUrl) {
    const stripe = getStripe();
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl
      });
      return {
        url: session.url
      };
    } catch (err) {
      this._handleError(err, "createPortalSession");
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  /**
   * Resolve a Stripe price ID from the plan's providerPriceIds.
   * Falls back to legacy stripePriceId if providerPriceIds not yet migrated.
   */
  _resolvePriceId(plan, interval) {
    // New provider-agnostic schema
    if (plan.providerPriceIds?.stripe) {
      const ids = plan.providerPriceIds.stripe;
      return ids[interval] || ids.monthly;
    }
    // Legacy fallback (pre-migration)
    const legacyMap = {
      monthly: plan.stripePriceIdMonthly,
      yearly: plan.stripePriceIdYearly,
      biennial: plan.stripePriceIdBiennial
    };
    return legacyMap[interval] || plan.stripePriceIdMonthly;
  }
  _handleError(err, context) {
    logger.error({
      err,
      context
    }, `[StripeProvider] Error in ${context}`);
    if (err.type === "StripeCardError") throw new Error(`Card Error: ${err.message}`);
    if (err.type === "StripeRateLimitError") throw new Error("Stripe API rate limit hit. Retrying...");
    throw err;
  }
}
module.exports = new StripeProvider();