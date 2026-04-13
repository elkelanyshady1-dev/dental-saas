/**
 * StripeProvider.js
 * Stripe implementation of the PaymentProvider interface.
 * v12.0 — Extracted from platformStripe.adapter.js
 *
 * ALL Stripe SDK usage in the platform is consolidated here.
 * No other file may require("stripe") or instantiate Stripe directly.
 */

"use strict";

const PaymentProvider = require("./PaymentProvider");
const logger = require("@utils/logger");
const { metrics } = require("@infra/metrics/metrics");

const Stripe = require("stripe");

let _stripeInstance = null;

function getStripe() {
    if (!_stripeInstance) {
        _stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_mock", {
            apiVersion: "2023-10-16",
            timeout: 10000,
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
                items: [{ price: priceId }],
                cancel_at_period_end: !autoRenew,
                metadata: { organizationId: org._id.toString() }
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
            const { cancelAtPeriodEnd = true, idempotencyKey } = options;
            logger.info({ subscriptionId, cancelAtPeriodEnd }, "[StripeProvider] Canceling subscription");

            const subscription = await stripe.subscriptions.update(
                subscriptionId,
                { cancel_at_period_end: cancelAtPeriodEnd },
                idempotencyKey ? { idempotencyKey } : {}
            );

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
            logger.info({ subscriptionId, autoRenew }, "[StripeProvider] Updating auto-renew");
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
            logger.info({ paymentId, amountMinor }, "[StripeProvider] Executing refund");
            const refund = await stripe.refunds.create(
                {
                    payment_intent: paymentId,
                    amount: amountMinor,
                    metadata: { idempotencyKey }
                },
                { idempotencyKey }
            );

            return { id: refund.id, status: refund.status };
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
            return refunds.data.map(r => ({ id: r.id, amount: r.amount, status: r.status }));
        } catch (err) {
            this._handleError(err, "listRefunds");
        }
    }

    // ─── Customer Credit ───────────────────────────────────────────────────

    async applyCustomerCredit(customerId, amountMinor, currency, idempotencyKey) {
        const stripe = getStripe();
        try {
            logger.info({ customerId, amountMinor, currency }, "[StripeProvider] Adjusting customer balance (credit)");
            const transaction = await stripe.customers.createBalanceTransaction(
                customerId,
                {
                    amount: -Math.abs(amountMinor),
                    currency: currency.toLowerCase(),
                    description: "Platform Credit Adjustment"
                },
                { idempotencyKey }
            );

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
            const transactions = await stripe.customers.listBalanceTransactions(customerId, { limit: 20 });
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
    async chargeInvoice(customerId, { amountMinor, currency, idempotencyKey }) {
        const stripe = getStripe();
        try {
            logger.info({ customerId, amountMinor, currency }, "[StripeProvider] Dunning: creating off-session payment intent");

            // Resolve default payment method from customer
            const customer = await stripe.customers.retrieve(customerId);
            const paymentMethodId = customer.invoice_settings?.default_payment_method;

            if (!paymentMethodId) {
                throw new Error(`[StripeProvider] No default payment method on customer ${customerId}`);
            }

            const intent = await stripe.paymentIntents.create(
                {
                    amount: amountMinor,
                    currency,
                    customer: customerId,
                    payment_method: paymentMethodId,
                    off_session: true,
                    confirm: true,
                    // Automatic retry handled by dunning engine — disable Stripe's built-in retry
                    payment_method_options: {
                        card: { request_three_d_secure: "automatic" }
                    }
                },
                { idempotencyKey }
            );

            return {
                id: intent.id,
                status: intent.status  // "succeeded" | "requires_action" | "canceled" etc.
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
                stripeEventType: stripeEvent.type,  // preserved for debugging only
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
            raw: stripeEvent  // raw preserved for diagnostics — NEVER read by business logic
        };
    }

    // ─── Checkout / Portal ─────────────────────────────────────────────────

    async createCheckoutSession(org, planId, options = {}) {
        const stripe = getStripe();
        try {
            const { interval, currency, autoRenew, salesOwnerId } = options;

            // MIGRATION: legacy callers pass a Plan._id; new callers should pass PlanVersion._id.
            // We attempt PlanVersion lookup first (new architecture), then fall back to template lookup.
            const PlanVersion = require("../../billing/models/PlanVersion.model").default;
            const plan = await PlanVersion.findById(planId).lean();
            if (!plan) throw new Error("PlanVersion not found (legacy createCheckoutSession)");

            const priceId = this._resolvePriceId(plan, interval || "monthly");

            // Sprint 5 (M4): currency sourced from OrgContract — no direct subscription access.
            // Explicit `currency` option from caller takes precedence (allows override in tests).
            let resolvedCurrency = currency;
            if (!resolvedCurrency) {
                const { requireActiveContract } = require("../services/contractResolver.service");
                const contract = await requireActiveContract(org._id);
                resolvedCurrency = contract.currency;
            }

            const session = await stripe.checkout.sessions.create({
                customer: org.subscription?.providerCustomerId || undefined,
                mode: "subscription",
                payment_method_types: ["card"],
                line_items: [{ price: priceId, quantity: 1 }],
                subscription_data: {
                    cancel_at_period_end: !autoRenew,
                    metadata: { organizationId: org._id.toString(), salesOwnerId }
                },
                currency: resolvedCurrency,
                success_url: `${process.env.FRONTEND_URL}/org/billing?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.FRONTEND_URL}/org/billing`
            });

            return { url: session.url };
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
    async createNewCheckoutSession({ organizationId, invoiceId, providerPriceId, amount, currency, successUrl, cancelUrl }) {
        const stripe = getStripe();
        try {
            logger.info({ organizationId, invoiceId, providerPriceId }, "[StripeProvider] Creating contract-first checkout session");

            // Prefer pre-configured provider price ID (fast path).
            // Fall back to price_data for manual-override contracts.
            const lineItems = providerPriceId
                ? [{ price: providerPriceId, quantity: 1 }]
                : [{
                    price_data: {
                        currency: currency.toLowerCase(),
                        unit_amount: amount,
                        recurring: { interval: "month" },
                        product_data: { name: "Dental SaaS Subscription" }
                    },
                    quantity: 1
                }];

            const session = await stripe.checkout.sessions.create({
                mode: "subscription",
                payment_method_types: ["card"],
                line_items: lineItems,
                currency: currency.toLowerCase(),
                // platformInvoiceId in metadata → webhook finds PlatformInvoice on payment.succeeded
                subscription_data: {
                    metadata: { organizationId, platformInvoiceId: invoiceId }
                },
                metadata: { organizationId, platformInvoiceId: invoiceId },
                success_url: successUrl,
                cancel_url: cancelUrl
            });

            return { url: session.url, sessionId: session.id };
        } catch (err) {
            this._handleError(err, "createNewCheckoutSession");
        }
    }

    async createPortalSession(customerId, returnUrl) {

        const stripe = getStripe();
        try {
            const session = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl
            });
            return { url: session.url };
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
        logger.error({ err, context }, `[StripeProvider] Error in ${context}`);

        if (err.type === "StripeCardError") throw new Error(`Card Error: ${err.message}`);
        if (err.type === "StripeRateLimitError") throw new Error("Stripe API rate limit hit. Retrying...");

        throw err;
    }
}

module.exports = new StripeProvider();
