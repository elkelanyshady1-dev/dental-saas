/**
 * tests/unit/billing/pricing/resolvePrice.unit.test.js
 * Phase 1 — Pricing Decoupling (Region → Global) + Phase 1 Hardening
 *
 * Scenarios:
 *   A. EG org on GLOBAL pricing → Kashier + EGP (temp constant FX)
 *      — forward-declared; guarded by providerGuard at checkout.
 *   B. US org → Stripe + USD with providerPriceId
 *   C. Non-EG, non-US → Stripe + USD
 *   D. Legacy pricing.regions[USD] fallback unchanged; EG stays on Paymob
 *      (pre-Phase-1 behaviour restored).
 *   E. Missing pricing.global AND no legacy → throws (code PRICING_UNRESOLVED)
 *   F. Invalid interval → throws (code INVALID_INTERVAL)
 *   G. billingCountry takes precedence over country
 *   H. isLegacyPricing helper
 *   I. convertUsdToEgp helper (piastre output)
 *   J. Throws carry machine-readable `code` properties
 */

"use strict";

const {
    resolvePrice,
    isLegacyPricing,
    convertUsdToEgp,
} = require("@platform/billing/pricing/resolvePrice");

// ─── Fixtures ────────────────────────────────────────────────────────────────

const globalPlan = {
    templateCode: "growth",
    pricing: {
        global: {
            currency: "USD",
            amountMonthly: 49,
            amountYearly: 490,
            providerPriceIds: {
                stripe: {
                    monthly: "price_stripe_m",
                    yearly: "price_stripe_y"
                },
                kashier: {
                    monthly: "price_kashier_m",
                    yearly: "price_kashier_y"
                }
            }
        }
    }
};

const legacyPlan = {
    templateCode: "legacy",
    pricing: {
        regions: [
            {
                regionCode: "US",
                currency: "USD",
                monthly: 49,
                yearly: 490,
                providerPriceIds: {
                    stripe: { monthly: "price_legacy_m", yearly: "price_legacy_y" }
                }
            },
            { regionCode: "EU", currency: "EUR", monthly: 45, yearly: 450 }
        ]
    }
};

// ─── A. EG org → EGP via Kashier ─────────────────────────────────────────────

describe("resolvePrice — EG billing country (new global path)", () => {
    test("routes EG org to Kashier + EGP with constant FX", async () => {
        const result = await resolvePrice({
            org: { billingCountry: "EG" },
            plan: globalPlan,
            interval: "monthly"
        });

        expect(result).toMatchObject({
            currency: "EGP",
            provider: "kashier",
            amountMinor: convertUsdToEgp(49),           // 49 * 50 * 100 = 245000
            usdAmount: 49,
            providerPriceId: "price_kashier_m",
            resolvedVia: "country-eg",
            source: "global"
        });
    });

    test("yearly interval uses amountYearly", async () => {
        const result = await resolvePrice({
            org: { billingCountry: "EG" },
            plan: globalPlan,
            interval: "yearly"
        });

        expect(result.amountMinor).toBe(convertUsdToEgp(490));
        expect(result.providerPriceId).toBe("price_kashier_y");
    });
});

// ─── B & C. Non-EG → USD via Stripe ──────────────────────────────────────────

describe("resolvePrice — non-EG routing (new global path)", () => {
    test("US org → Stripe USD with providerPriceId", async () => {
        const result = await resolvePrice({
            org: { billingCountry: "US" },
            plan: globalPlan,
            interval: "monthly"
        });

        expect(result).toMatchObject({
            currency: "USD",
            provider: "stripe",
            amountMinor: 4900,
            usdAmount: 49,
            providerPriceId: "price_stripe_m",
            resolvedVia: "global-usd",
            source: "global"
        });
    });

    test("DE org → Stripe USD (everyone who is not EG)", async () => {
        const result = await resolvePrice({
            org: { billingCountry: "DE" },
            plan: globalPlan,
            interval: "yearly"
        });
        expect(result.currency).toBe("USD");
        expect(result.provider).toBe("stripe");
        expect(result.amountMinor).toBe(49000);
        expect(result.providerPriceId).toBe("price_stripe_y");
    });
});

// ─── D. Legacy fallback ──────────────────────────────────────────────────────

describe("resolvePrice — legacy pricing.regions[] fallback", () => {
    test("extracts USD from regions[] when pricing.global is absent", async () => {
        const result = await resolvePrice({
            org: { billingCountry: "US" },
            plan: legacyPlan,
            interval: "monthly"
        });

        expect(result.currency).toBe("USD");
        expect(result.provider).toBe("stripe");
        expect(result.amountMinor).toBe(4900);
        expect(result.providerPriceId).toBe("price_legacy_m");
        expect(result.resolvedVia).toBe("legacy-global-usd");
        expect(result.source).toBe("legacy-regions");
    });

    test("EG org on legacy pricing → Paymob (pre-Phase-1 behaviour, NOT Kashier)", async () => {
        const result = await resolvePrice({
            org: { billingCountry: "EG" },
            plan: legacyPlan,
            interval: "monthly"
        });

        expect(result.currency).toBe("EGP");
        expect(result.provider).toBe("paymob");         // NOT "kashier"
        expect(result.amountMinor).toBe(convertUsdToEgp(49));
        expect(result.resolvedVia).toBe("legacy-fx-converted");
    });
});

// ─── E & F. Invalid inputs ───────────────────────────────────────────────────

describe("resolvePrice — invalid inputs", () => {
    test("throws when pricing has neither global nor regions nor pricingV3", async () => {
        await expect(
            resolvePrice({
                org: { billingCountry: "US" },
                plan: { pricing: {} },
                interval: "monthly"
            })
        ).rejects.toThrow(/No pricing\.global/i);
    });

    test("throws on invalid interval", async () => {
        await expect(
            resolvePrice({
                org: { billingCountry: "US" },
                plan: globalPlan,
                interval: "weekly"
            })
        ).rejects.toThrow(/Invalid interval/);
    });

    test("throws when plan is missing", async () => {
        await expect(
            resolvePrice({ org: { billingCountry: "US" }, interval: "monthly" })
        ).rejects.toThrow(/plan is required/);
    });
});

// ─── G. Country resolution precedence ────────────────────────────────────────

describe("resolvePrice — country resolution precedence", () => {
    test("billingCountry='EG' wins over country='US' → Kashier/EGP/country-eg", async () => {
        const result = await resolvePrice({
            org: { billingCountry: "EG", country: "US" },
            plan: globalPlan,
            interval: "monthly"
        });
        expect(result.currency).toBe("EGP");
        expect(result.provider).toBe("kashier");
        expect(result.resolvedVia).toBe("country-eg");
    });

    test("non-EG org with only `country` set → default Stripe/USD path", async () => {
        const result = await resolvePrice({
            org: { country: "US" },
            plan: globalPlan,
            interval: "monthly"
        });
        expect(result.currency).toBe("USD");
        expect(result.provider).toBe("stripe");
    });

    // Phase 7: EG routing MUST NOT fire based on `country` (signup country,
    // which may have been pre-filled from GeoIP). Only `billingCountry` counts.
    test("country='EG' WITHOUT billingCountry → stays on Stripe/USD", async () => {
        const result = await resolvePrice({
            org: { country: "EG", billingCountry: null },
            plan: globalPlan,
            interval: "monthly"
        });
        expect(result.currency).toBe("USD");
        expect(result.provider).toBe("stripe");
    });

});

// ─── H. isLegacyPricing helper ───────────────────────────────────────────────

describe("isLegacyPricing", () => {
    test("returns false for plans with pricing.global", () => {
        expect(isLegacyPricing(globalPlan)).toBe(false);
        expect(isLegacyPricing(globalPlan.pricing)).toBe(false);
    });

    test("returns true for legacy regions[]-only plans", () => {
        expect(isLegacyPricing(legacyPlan)).toBe(true);
        expect(isLegacyPricing(legacyPlan.pricing)).toBe(true);
    });

    test("returns true for missing/empty pricing", () => {
        expect(isLegacyPricing(null)).toBe(true);
        expect(isLegacyPricing({})).toBe(true);
        expect(isLegacyPricing({ pricing: {} })).toBe(true);
    });
});

// ─── I. convertUsdToEgp helper ───────────────────────────────────────────────

describe("convertUsdToEgp", () => {
    test("returns EGP minor units (piastres)", () => {
        // 49 USD * 50 FX * 100 piastres/EGP = 245000 piastres (= 2450 EGP)
        expect(convertUsdToEgp(49)).toBe(245000);
    });

    test("rounds to nearest piastre", () => {
        expect(convertUsdToEgp(10.005)).toBe(Math.round(10.005 * 50 * 100));
    });

    test("handles zero", () => {
        expect(convertUsdToEgp(0)).toBe(0);
    });
});

// ─── J. Error shapes ─────────────────────────────────────────────────────────

// Pre-Phase-8 hardening — provider-invariant guard is logically unreachable
// under the current branching (EG always returns "kashier"), but we assert
// on the EG happy path that the invariant HOLDS. A future refactor that
// breaks it would flip this test and the assertion inside resolvePrice.
describe("resolvePrice — pricing-layer provider invariant", () => {
    test("EG org always returns provider='kashier' (invariant held)", async () => {
        const r = await resolvePrice({
            org: { billingCountry: "EG" },
            plan: globalPlan,
            interval: "monthly"
        });
        expect(r.provider).toBe("kashier");
        expect(r.currency).toBe("EGP");
    });
});

describe("resolvePrice — error codes", () => {
    test("invalid interval throws with code INVALID_INTERVAL", async () => {
        await expect(
            resolvePrice({ org: {}, plan: globalPlan, interval: "weekly" })
        ).rejects.toMatchObject({ code: "INVALID_INTERVAL" });
    });

    test("missing plan throws with code PLAN_REQUIRED", async () => {
        await expect(resolvePrice({ org: {} })).rejects.toMatchObject({
            code: "PLAN_REQUIRED"
        });
    });

    test("unresolvable pricing throws with code PRICING_UNRESOLVED", async () => {
        await expect(
            resolvePrice({
                org: {},
                plan: { pricing: {} },
                interval: "monthly"
            })
        ).rejects.toMatchObject({ code: "PRICING_UNRESOLVED" });
    });
});
