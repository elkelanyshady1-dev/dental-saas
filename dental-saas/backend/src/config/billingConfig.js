/**
 * billingConfig.js
 * Phase 1 Hardening — Billing Feature Flags.
 *
 * Flags live here (not in platformFeatureFlags.js) because they gate
 * provider-layer wiring that evolves independently of the platform
 * feature-flag contract. Keep this file small and dependency-free.
 *
 * PLANE: Platform / Billing
 */

"use strict";

const BILLING_FEATURES = {
    // Sourced from `ENABLE_KASHIER` env var so the production-readiness
    // assertion at server boot can refuse to start the process when
    // ENABLE_KASHIER=true but Kashier API/secret env vars are missing.
    //
    // When false, any attempt to route to the Kashier provider is rejected
    // at the guard (KASHIER_DISABLED). Flip to "true" in the deployment
    // environment only after KashierProvider's hosted-page integration
    // is wired and the API/Merchant/Webhook-secret env vars are populated.
    ENABLE_KASHIER: process.env.ENABLE_KASHIER === "true",

    // Phase 10 — when true, all soft-deprecated legacy paths
    // (pricingEngine.computePrice, the old createCheckoutSession,
    // pricing.regions reads) throw `LEGACY_PATH_USED` instead of just
    // emitting a warn log. Recommended workflow:
    //   1. Run scripts/auditLegacyPricing.js — confirm zero offenders.
    //   2. Set BILLING_STRICT_MODE=true in staging; smoke-test all flows.
    //   3. Set in production. Phase 11 then deletes the legacy code paths.
    STRICT_MODE: process.env.BILLING_STRICT_MODE === "true",
};

module.exports = { BILLING_FEATURES };
