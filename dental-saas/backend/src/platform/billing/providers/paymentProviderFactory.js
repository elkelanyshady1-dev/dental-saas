/**
 * paymentProviderFactory.js
 * Provider resolution factory for multi-provider billing architecture.
 *
 * Usage:
 *   const { getProvider } = require("./paymentProviderFactory");
 *   const provider = getProvider(org.subscription.paymentProvider);
 *   await provider.refundPayment(paymentId, amountMinor, key);
 *
 * Provider assignment is stored on org.subscription.paymentProvider
 * and is set at subscription creation time based on org.country.
 */

"use strict";

const stripeProvider = require("./StripeProvider");
const paymobProvider = require("./PaymobProvider");
const paypalProvider = require("./PayPalProvider");

const PROVIDERS = {
    stripe: stripeProvider,
    paymob: paymobProvider,
    paypal: paypalProvider,
};

/**
 * getProvider
 * Returns the payment provider instance for the given type.
 *
 * @param {string} providerType - "stripe" | "paymob" | "paypal"
 * @returns {PaymentProvider}
 * @throws Error if unsupported provider
 */
function getProvider(providerType) {
    const provider = PROVIDERS[providerType];
    if (!provider) {
        throw new Error(
            `[paymentProviderFactory] Unsupported payment provider: "${providerType}". ` +
            `Supported: ${Object.keys(PROVIDERS).join(", ")}`
        );
    }
    return provider;
}

/**
 * getProviderForOrg
 * Convenience helper — resolves provider directly from an org document.
 * Falls back to "stripe" if paymentProvider field is not set (migration safety).
 *
 * @param {object} org - Organization mongoose document
 * @returns {PaymentProvider}
 */
function getProviderForOrg(org) {
    const providerType = org?.subscription?.paymentProvider || "stripe";
    return getProvider(providerType);
}

module.exports = { getProvider, getProviderForOrg };
