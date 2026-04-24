/**
 * checkoutPolicy.service.js
 * Phase 5 — Provider policy SSOT.
 *
 * The orchestrator does not decide which provider serves a checkout. This
 * module does. Centralising the decision gives us one place to:
 *   - validate the request contains a provider
 *   - (future) enforce compliance overrides (e.g. EG org MUST use Kashier,
 *     regardless of what the UI picked)
 *   - (future) consult policy flags per org
 *
 * Phase 5 ships as a passthrough: whatever the user requested wins, as long
 * as it's present. The shape is stable so future policies plug in without
 * changing the orchestrator.
 *
 * PLANE: Platform / Billing
 */

"use strict";

/**
 * resolveEffectiveProvider
 * @param {object} params
 * @param {object} params.org                - Organization doc (may be partial).
 * @param {string} params.requestedProvider  - Provider string from the request body.
 * @param {object} [params.pricing]          - Output of resolvePrice(); provider hint
 *                                              available but NOT authoritative.
 * @returns {string} the provider identifier to use everywhere downstream.
 * @throws  Error {code:"PROVIDER_REQUIRED"} when requestedProvider is falsy.
 */
function resolveEffectiveProvider({ org, requestedProvider, pricing } = {}) {
    if (!requestedProvider) {
        throw Object.assign(
            new Error("PROVIDER_REQUIRED"),
            { code: "PROVIDER_REQUIRED", status: 400 }
        );
    }

    // ── HARD RULE: Egypt MUST explicitly request Kashier ────────────────────
    // Decision source: org.billingCountry ONLY. Deliberately NOT
    // org.country (which may have been pre-filled from a GeoIP suggestion
    // at signup) and NOT any IP-based header.
    //
    // Phase 9: we REJECT mismatches instead of silently remapping. A caller
    // that asks for Stripe on an EG org gets a visible error at the API
    // boundary; this surfaces misconfigured frontends (e.g. provider-picker
    // didn't hide Stripe for EG) immediately instead of letting the routing
    // layer paper over them. EG orgs must explicitly pass provider="kashier".
    if (org?.billingCountry === "EG") {
        if (requestedProvider !== "kashier") {
            throw Object.assign(
                new Error(
                    `INVALID_PROVIDER_FOR_COUNTRY: Egypt organisations must use Kashier, got "${requestedProvider}".`
                ),
                {
                    code: "INVALID_PROVIDER_FOR_COUNTRY",
                    status: 400,
                    billingCountry: "EG",
                    requestedProvider,
                    expectedProvider: "kashier"
                }
            );
        }
        return "kashier";
    }

    // Default behaviour (Phase 5 passthrough). `pricing` argument is available
    // for future policies — e.g. pin the provider to pricing.provider when
    // the pricing resolver should own the decision.
    return requestedProvider;
}

module.exports = {
    resolveEffectiveProvider,
};
