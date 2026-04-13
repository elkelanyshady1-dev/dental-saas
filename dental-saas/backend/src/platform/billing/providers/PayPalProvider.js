/**
 * PayPalProvider.js
 * PayPal payment provider — Future integration.
 * STUB — Production integration not yet implemented.
 *
 * Integration requires:
 * - PayPal REST API v2 credentials
 * - Webhook signature verification via PayPal's cert-based validation
 * - Subscription Plan + Billing Agreement flow
 */

"use strict";

const PaymentProvider = require("./PaymentProvider");

class PayPalProvider extends PaymentProvider {
    // All methods inherit "Not implemented" from PaymentProvider.
    // Implement below when PayPal integration sprint begins.
}

module.exports = new PayPalProvider();
