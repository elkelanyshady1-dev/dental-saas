/**
 * PaymentProvider.js
 * Abstract base class for payment provider integrations.
 * All providers (Stripe, Paymob, PayPal) must extend this class
 * and implement every method.
 *
 * NO business logic belongs here — only the interface contract.
 */

"use strict";

class PaymentProvider {
    /**
     * Create a subscription for an organization.
     * @param {object} org - Organization document
     * @param {object} plan - Plan document
     * @param {string} interval - "monthly" | "yearly" | "biennial"
     * @param {boolean} autoRenew
     * @returns {{ id, status, currentPeriodStart, currentPeriodEnd }}
     */
    async createSubscription(org, plan, interval, autoRenew) {
        throw new Error(`[PaymentProvider] createSubscription is not implemented by ${this.constructor.name}`);
    }

    /**
     * Cancel a subscription.
     * @param {string} subscriptionId
     * @param {object} options - { cancelAtPeriodEnd: boolean, idempotencyKey: string }
     * @returns {{ id, status, cancelAtPeriodEnd }}
     */
    async cancelSubscription(subscriptionId, options = {}) {
        throw new Error(`[PaymentProvider] cancelSubscription is not implemented by ${this.constructor.name}`);
    }

    /**
     * Execute a refund against a payment.
     * @param {string} paymentId - Provider-specific payment reference
     * @param {number} amountMinor - Amount in minor currency units
     * @param {string} idempotencyKey
     * @returns {{ id, status }}
     */
    async refundPayment(paymentId, amountMinor, idempotencyKey) {
        throw new Error(`[PaymentProvider] refundPayment is not implemented by ${this.constructor.name}`);
    }

    /**
     * List refunds for a payment.
     * @param {string} paymentId
     * @returns {Array<{ id, amount, status }>}
     */
    async listRefunds(paymentId) {
        throw new Error(`[PaymentProvider] listRefunds is not implemented by ${this.constructor.name}`);
    }

    /**
     * Retrieve a subscription by provider ID.
     * @param {string} subscriptionId
     * @returns {object} - Full subscription object (provider-specific, used internally only)
     */
    async getSubscription(subscriptionId) {
        throw new Error(`[PaymentProvider] getSubscription is not implemented by ${this.constructor.name}`);
    }

    /**
     * Apply a credit balance to a customer account.
     * @param {string} customerId
     * @param {number} amountMinor - Amount in minor units (positive = credit)
     * @param {string} currency - ISO currency code
     * @param {string} idempotencyKey
     * @returns {{ id, amount, endingBalance }}
     */
    async applyCustomerCredit(customerId, amountMinor, currency, idempotencyKey) {
        throw new Error(`[PaymentProvider] applyCustomerCredit is not implemented by ${this.constructor.name}`);
    }

    /**
     * Verify a webhook signature. Must throw if invalid.
     * @param {Buffer|string} payload - Raw request body
     * @param {string} signature - Signature header value
     * @param {string} secret - Regional webhook secret
     * @returns {object} - Parsed, verified event object
     */
    verifyWebhookSignature(payload, signature, secret) {
        throw new Error(`[PaymentProvider] verifyWebhookSignature is not implemented by ${this.constructor.name}`);
    }

    /**
     * Create a hosted checkout session for a new subscription.
     * @param {object} org - Organization document
     * @param {string} planId
     * @param {object} options - { interval, currency, autoRenew, salesOwnerId }
     * @returns {{ url: string }}
     */
    async createCheckoutSession(org, planId, options = {}) {
        throw new Error(`[PaymentProvider] createCheckoutSession is not implemented by ${this.constructor.name}`);
    }

    /**
     * Create a billing portal session (self-service management).
     * @param {string} customerId
     * @param {string} returnUrl
     * @returns {{ url: string }}
     */
    async createPortalSession(customerId, returnUrl) {
        throw new Error(`[PaymentProvider] createPortalSession is not implemented by ${this.constructor.name}`);
    }

    /**
     * Toggle auto-renewal on an existing subscription.
     * @param {string} subscriptionId
     * @param {boolean} autoRenew
     */
    async updateAutoRenew(subscriptionId, autoRenew) {
        throw new Error(`[PaymentProvider] updateAutoRenew is not implemented by ${this.constructor.name}`);
    }

    /**
     * List balance transactions for a customer.
     * @param {string} customerId
     * @returns {Array}
     */
    async listCustomerBalanceTransactions(customerId) {
        throw new Error(`[PaymentProvider] listCustomerBalanceTransactions is not implemented by ${this.constructor.name}`);
    }

    /**
     * chargeInvoice
     * Off-session charge against a stored payment method (dunning engine use only).
     * Provider should use the customer's default stored payment method.
     *
     * @param {string} customerId - Provider customer ID (e.g. Stripe cus_xxx)
     * @param {object} options
     * @param {number}  options.amountMinor      - Amount in minor currency units (e.g. cents)
     * @param {string}  options.currency         - ISO currency code, lowercase (e.g. "usd")
     * @param {string}  options.idempotencyKey   - Unique key to prevent double-charging
     * @returns {{ id: string, status: string }}  - Provider payment/charge reference and status
     */
    async chargeInvoice(customerId, options) {
        throw new Error(`[PaymentProvider] chargeInvoice is not implemented by ${this.constructor.name}`);
    }
}

module.exports = PaymentProvider;
