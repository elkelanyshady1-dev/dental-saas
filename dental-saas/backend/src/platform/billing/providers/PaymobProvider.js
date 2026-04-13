/**
 * PaymobProvider.js
 * Paymob payment provider — Egypt region.
 * STUB — Production integration not yet implemented.
 *
 * Integration requires:
 * - Paymob API key configuration
 * - HMAC-SHA512 webhook signature verification
 * - Payment key iframe flow (not redirect)
 * - Order registration + payment key creation flow
 */

"use strict";

const PaymentProvider = require("./PaymentProvider");

class PaymobProvider extends PaymentProvider {
    // All methods inherit "Not implemented" from PaymentProvider.
    // Implement below when Paymob integration sprint begins.

    /**
     * verifyWebhookSignature
     * Paymob uses HMAC-SHA512 on the concatenated response fields.
     * Signature is NOT a standard header — it is embedded in the callback.
     */
    // async verifyWebhookSignature(payload, signature, secret) { ... }

    /**
     * createSubscription
     * Paymob does not have native subscriptions — requires custom
     * recurring charge logic via saved card tokens.
     */
    // async createSubscription(org, plan, interval, autoRenew) { ... }
}

module.exports = new PaymobProvider();
