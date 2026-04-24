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
const paypalProvider = require("./PayPalProvider");
const kashierProvider = require("./KashierProvider");

// Phase 10 — PaymobProvider was a stub-only class with no real
// implementation. Removed entirely. `getProvider("paymob")` now throws
// PROVIDER_NOT_IMPLEMENTED, which is the correct failure mode (the
// upstream providerGuard already rejects "paymob" with
// PROVIDER_NOT_SUPPORTED before this factory is reached). Schema enums
// keep the literal "paymob" for legacy data reads — see Organization +
// OrgContract + OrgAddOn + BillingEventLog.
const PROVIDERS = {
    stripe: stripeProvider,
    paypal: paypalProvider,
    kashier: kashierProvider,
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
        throw Object.assign(
            new Error(
                `PROVIDER_NOT_IMPLEMENTED: "${providerType}". ` +
                `Registered: ${Object.keys(PROVIDERS).join(", ")}`
            ),
            { code: "PROVIDER_NOT_IMPLEMENTED", provider: providerType, status: 501 }
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
