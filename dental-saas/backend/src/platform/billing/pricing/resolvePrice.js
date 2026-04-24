/**
 * resolvePrice.js
 * Platform Billing — Phase 1 Pricing Resolver (+ Phase 1 Hardening)
 *
 * Architecture:
 *
 *   PlanTemplate / PlanVersion.pricing.global   ← new canonical shape
 *              ↓
 *   resolvePrice({ org, plan, interval })
 *              ↓
 *   New-global path:
 *     ┌─ org.country === "EG"  → { currency:"EGP", provider:"kashier" }   (gated by guard)
 *     └─ else                  → { currency:"USD", provider:"stripe" }
 *
 *   Legacy fallback (no pricing.global → read pricing.regions[] / pricingV3.default):
 *     ┌─ org.country === "EG"  → { currency:"EGP", provider:"paymob" }    (pre-Phase-1 routing)
 *     └─ else                  → { currency:"USD", provider:"stripe" }
 *
 * Phase 1 Hardening notes:
 *   - Legacy EG still routes to `paymob` to preserve pre-decoupling behaviour.
 *     Silent rerouting to Kashier on legacy data was removed — that introduced
 *     a behavioural regression the caller never opted into.
 *   - `provider: "kashier"` is forward-declared. Actual checkout is blocked by
 *     providerGuard (KASHIER_DISABLED) until KashierProvider lands in Phase 2.
 *   - All throws use `{ code }` for machine inspection.
 *   - FX is a TEMP constant (FX_RATE = 50) until Phase 2 swaps in fxService.
 *
 * PLANE: Platform / Billing
 */

"use strict";

const logger = require("@utils/logger");

// ─── Supported intervals ─────────────────────────────────────────────────────
const VALID_INTERVALS = ["monthly", "yearly"];

// ─── EG detection ────────────────────────────────────────────────────────────
const EG_COUNTRY = "EG";

// ─── Temp FX helper ──────────────────────────────────────────────────────────
// IMPORTANT:
//   FX is only used during price generation (checkout session amount, UI
//   display). It is NEVER the source of truth for an ACTIVATED subscription.
//   Final validation MUST always compare the webhook's reported amount
//   against `contract.amountMinor` via
//   billingValidation.assertPaymentMatchesContract — the FX rate at charge
//   time may drift from the rate at checkout, and we refuse to let that
//   drift silently activate a subscription at the wrong price.
//
// TODO: replace with real FX service (backend/src/platform/billing/pricing/fxService.js).
// Returns EGP in minor units (piastres). 1 EGP = 100 piastres.
function convertUsdToEgp(usd) {
    const FX_RATE = 50; // temp constant
    return Math.round(usd * FX_RATE * 100);
}

// ─── Country resolution ──────────────────────────────────────────────────────
// EG routing is decided EXCLUSIVELY by `billingCountry`. `country` (signup
// country, which may have been pre-filled from a GeoIP suggestion) is NOT
// consulted for the EG→Kashier rule — we refuse to let a geography guess
// influence payment routing. This mirrors checkoutPolicy.resolveEffectiveProvider.
function _isEgByBillingCountry(org) {
    if (!org) return false;
    const bc = org.billingCountry;
    return typeof bc === "string" && bc.toUpperCase() === EG_COUNTRY;
}

// ─── Legacy-shape detector ───────────────────────────────────────────────────
/**
 * isLegacyPricing
 * Returns true when the pricing document does NOT have a `global` subdoc
 * and will therefore go through the legacy resolver.
 *
 * Accepts either a pricing object or a plan (auto-unwraps `plan.pricing`).
 */
function isLegacyPricing(pricingOrPlan) {
    if (!pricingOrPlan) return true;
    const pricing = pricingOrPlan.pricing || pricingOrPlan;
    return !pricing?.global;
}

// ─── Legacy resolver (regions[] / pricingV3.default) ─────────────────────────
/**
 * resolveLegacyRegionPricing
 * Reads the legacy `pricing.regions[]` or `pricingV3.default` tree and applies
 * the same country-based routing as the global path. Kept so unmigrated
 * PlanVersions keep working during the Phase 1 rollout.
 */
function resolveLegacyRegionPricing({ org, plan, interval }) {
    const pricing = plan?.pricing;
    if (!pricing) {
        throw Object.assign(
            new Error("plan.pricing is required."),
            { code: "PLAN_PRICING_REQUIRED" }
        );
    }

    // Phase 10 — single legacy source: pricing.regions[] (USD region).
    // The pricingV3.default branch was removed because it was already
    // unreachable in practice (no PlanVersion in production was created
    // without a regions[] entry). Schema field remains for legacy reads;
    // see PlanVersion.model.js @deprecated note.
    const regions = Array.isArray(pricing.regions) ? pricing.regions : [];
    const usdRegion =
        regions.find(r => (r.currency || "").toUpperCase() === "USD") ||
        regions[0] ||
        null;

    let usdAmount = null;
    let stripePriceId = null;
    let paymobPriceId = null;
    const source = "legacy-regions";

    if (usdRegion && typeof usdRegion[interval] === "number") {
        usdAmount = usdRegion[interval];
        stripePriceId = usdRegion.providerPriceIds?.stripe?.[interval] || null;
        paymobPriceId = usdRegion.providerPriceIds?.paymob?.[interval] || null;
    }

    if (typeof usdAmount !== "number" || usdAmount < 0) {
        throw Object.assign(
            new Error(
                "No pricing.global configured and legacy fallback could not " +
                "resolve a USD amount. Run scripts/migratePricingToGlobal.js."
            ),
            { code: "PRICING_UNRESOLVED" }
        );
    }

    // Phase 10 — legacy-path observability. Every PlanVersion that still
    // resolves through this branch is a migration debt; greppable for SRE
    // alerts and the audit script.
    logger.warn({
        event: "LEGACY_PATH_USED",
        path: "pricing.regions",
        planId: plan?._id ? String(plan._id) : null,
        templateCode: plan?.templateCode || null,
        interval
    }, "[resolvePrice] LEGACY_PRICING_USED — run scripts/migratePricingToGlobal.js");

    // ── Legacy EG routing → Paymob (PRE-PHASE-1 behaviour preserved). ────────
    // Phase 1 originally re-routed EG to Kashier here; Phase 1 Hardening
    // restores Paymob. Downstream checkout is guarded by providerGuard, which
    // currently rejects "paymob" with PROVIDER_NOT_SUPPORTED. That is the
    // intended deprecation signal — not a silent reroute.
    // EG detection: billingCountry ONLY (no IP, no country fallback).
    // NOTE: legacy EG routes to Paymob by design (pre-Phase-1 behaviour). The
    // provider-invariant assertion below accepts Paymob for EG — the
    // "EG must not use Stripe" invariant still holds; downstream
    // providerGuard rejects Paymob anyway (PROVIDER_NOT_SUPPORTED).
    if (_isEgByBillingCountry(org)) {
        return {
            currency: "EGP",
            amountMinor: convertUsdToEgp(usdAmount),
            provider: "paymob",
            providerPriceId: paymobPriceId,
            usdAmount,
            resolvedVia: "legacy-fx-converted",
            source
        };
    }

    return _assertProviderMatchesCountry(org, {
        currency: "USD",
        amountMinor: Math.round(usdAmount * 100),
        provider: "stripe",
        providerPriceId: stripePriceId,
        usdAmount,
        resolvedVia: "legacy-global-usd",
        source
    });
}

// ─── Pricing-layer provider invariant ────────────────────────────────────────
// Pre-Phase-8 hardening: the pricing resolver must never emit a non-Kashier
// provider for an EG billing country. If a future code change breaks that
// invariant — e.g. the EG branch gets accidentally reordered — this guard
// fails loudly instead of letting a Stripe-routed EG payment in EGP reach
// checkout. Logically redundant today; deliberately kept as a second-line
// assertion against refactor regressions.
function _assertProviderMatchesCountry(org, result) {
    if (org?.billingCountry === EG_COUNTRY && result.provider !== "kashier") {
        throw Object.assign(
            new Error(
                `PRICING_PROVIDER_MISMATCH: billingCountry=EG but provider="${result.provider}"`
            ),
            {
                code: "PRICING_PROVIDER_MISMATCH",
                billingCountry: "EG",
                provider: result.provider
            }
        );
    }
    return result;
}

// ─── New global resolver ─────────────────────────────────────────────────────
function _resolveGlobalPricing({ org, pricing, interval }) {
    const global = pricing.global;
    const field = interval === "yearly" ? "amountYearly" : "amountMonthly";
    const usdAmount = global[field];

    if (typeof usdAmount !== "number" || usdAmount < 0) {
        throw Object.assign(
            new Error(`pricing.global.${field} is missing or invalid.`),
            { code: "PRICING_GLOBAL_INVALID", field }
        );
    }

    // ── EG path: USD → EGP via temp FX, route to Kashier ────────────────────
    // EG detection: billingCountry ONLY — matches checkoutPolicy exactly.
    // This is the pricing-layer half of the "Egypt must use Kashier" invariant;
    // the policy layer enforces it again at the provider selection step.
    if (_isEgByBillingCountry(org)) {
        return _assertProviderMatchesCountry(org, {
            currency: "EGP",
            amountMinor: convertUsdToEgp(usdAmount),
            provider: "kashier",
            providerPriceId: global.providerPriceIds?.kashier?.[interval] || null,
            usdAmount,
            resolvedVia: "country-eg",
            source: "global"
        });
    }

    // ── Default path: USD via Stripe ─────────────────────────────────────────
    return _assertProviderMatchesCountry(org, {
        currency: "USD",
        amountMinor: Math.round(usdAmount * 100),
        provider: "stripe",
        providerPriceId: global.providerPriceIds?.stripe?.[interval] || null,
        usdAmount,
        resolvedVia: "global-usd",
        source: "global"
    });
}

// ─── Public entrypoint ───────────────────────────────────────────────────────
/**
 * resolvePrice
 * Single pricing resolver for Platform billing.
 *
 * @param {object} params
 * @param {object} params.org       - { billingCountry?, country? }
 * @param {object} params.plan      - PlanVersion-shaped doc with `pricing`
 * @param {string} [params.interval="monthly"] - "monthly" | "yearly"
 *
 * @returns {Promise<{
 *   currency: "USD" | "EGP",
 *   amountMinor: number,
 *   provider: "stripe" | "kashier",
 *   providerPriceId: string | null,
 *   usdAmount: number,
 *   resolvedVia: "global-usd" | "global-fx-converted" | "legacy-global-usd" | "legacy-fx-converted",
 *   source: "global" | "legacy-regions" | "legacy-v3-default"
 * }>}
 */
async function resolvePrice({ org, plan, interval = "monthly" } = {}) {
    if (!VALID_INTERVALS.includes(interval)) {
        throw Object.assign(
            new Error(
                `Invalid interval: "${interval}". ` +
                `Must be one of: ${VALID_INTERVALS.join(", ")}`
            ),
            { code: "INVALID_INTERVAL", interval }
        );
    }
    if (!plan || typeof plan !== "object") {
        throw Object.assign(
            new Error("plan is required."),
            { code: "PLAN_REQUIRED" }
        );
    }

    const pricing = plan.pricing;
    let result;

    // ✅ NEW PATH (preferred)
    if (pricing?.global) {
        result = _resolveGlobalPricing({ org, pricing, interval });
    } else {
        // ⚠️ LEGACY FALLBACK (DO NOT REMOVE)
        logger.debug({
            event: "PRICING_LEGACY_FALLBACK",
            templateCode: plan.templateCode || plan.code
        }, "[resolvePrice] using legacy regions[]/pricingV3 fallback");
        result = resolveLegacyRegionPricing({ org, plan, interval });
    }

    // ── Diagnostic trace (opt-in via AUTH_TRACE=true) ────────────────────────
    // Emits one line per resolution so the decision path can be inspected
    // without turning on debug-level logging globally.
    if (process.env.AUTH_TRACE === "true") {
        // eslint-disable-next-line no-console
        console.log("[PRICING]", {
            org: org?._id || null,
            country: org?.billingCountry || org?.country || null,
            provider: result.provider,
            currency: result.currency,
            source: pricing?.global ? "global" : "legacy",
            resolvedVia: result.resolvedVia
        });
    }

    return result;
}

module.exports = {
    resolvePrice,
    resolveLegacyRegionPricing,
    isLegacyPricing,
    convertUsdToEgp,
    VALID_INTERVALS,
};
