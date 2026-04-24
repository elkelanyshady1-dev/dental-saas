/**
 * providerGuard.js
 * Phase 1 Hardening — Payment provider runtime guard.
 *
 * The pricing resolver (resolvePrice) may return `provider: "kashier"` for EG
 * orgs on the new global path, but KashierProvider is not implemented yet.
 * This guard is the single chokepoint that prevents a "kashier" (or any other
 * unsupported value) from reaching the factory/checkout layer.
 *
 * Call from every checkout entry immediately after provider resolution:
 *
 *     const { assertProviderSupported } = require("@utils/providerGuard");
 *     assertProviderSupported(pricing.provider); // throws on unsupported
 *
 * Error codes (all thrown as `Error` with a `.code` property):
 *   - KASHIER_DISABLED       → provider === "kashier" and feature flag off
 *   - PROVIDER_NOT_SUPPORTED → anything else not in SUPPORTED_PROVIDERS
 *
 * PLANE: Platform / Billing
 */

"use strict";

const { BILLING_FEATURES } = require("../config/billingConfig");

// Explicit allow-list. Paymob/PayPal are temporarily excluded during the
// pricing-decoupling window; they can be restored by adding them here.
// Phase 2: `kashier` is allow-listed, but the separate `ENABLE_KASHIER`
// feature flag still gates actual usage — so the flag check below runs
// FIRST and short-circuits with KASHIER_DISABLED when the flag is off.
//
// Phase 9 hardening: frozen so accidental mutation at runtime (e.g. test
// teardown forgetting to restore, debug code calling `.push()`) cannot
// silently widen the allow-list.
const SUPPORTED_PROVIDERS = Object.freeze(["stripe", "kashier"]);

/**
 * assertProviderSupported
 * Throws if `provider` cannot be served by the current build.
 *
 * @param {string} provider - e.g. "stripe", "kashier", "paymob"
 * @throws {Error} with `.code = "KASHIER_DISABLED" | "PROVIDER_NOT_SUPPORTED"`
 */
function assertProviderSupported(provider) {
    if (provider === "kashier" && !BILLING_FEATURES.ENABLE_KASHIER) {
        throw Object.assign(
            new Error("KASHIER_DISABLED: Kashier provider is not enabled in this build."),
            { code: "KASHIER_DISABLED", status: 503 }
        );
    }

    if (!SUPPORTED_PROVIDERS.includes(provider)) {
        throw Object.assign(
            new Error(`PROVIDER_NOT_SUPPORTED: ${provider}`),
            { code: "PROVIDER_NOT_SUPPORTED", provider, status: 400 }
        );
    }
}

module.exports = {
    assertProviderSupported,
    SUPPORTED_PROVIDERS,
};
