/**
 * tests/unit/billing/pricing/providerGuard.unit.test.js
 * Phase 1 Hardening — provider guard coverage.
 *
 * Covers:
 *   - Stripe always passes
 *   - Kashier blocked by KASHIER_DISABLED when flag is off
 *   - Kashier passes when flag is on
 *   - Paymob + PayPal rejected with PROVIDER_NOT_SUPPORTED
 *   - End-to-end: resolvePrice → guard blocks EG-global path cleanly
 */

"use strict";

// ─── Stripe is always supported ──────────────────────────────────────────────

describe("assertProviderSupported", () => {
    let assertProviderSupported;

    beforeEach(() => {
        jest.resetModules();
        jest.doMock("@config/billingConfig", () => ({
            BILLING_FEATURES: { ENABLE_KASHIER: false }
        }));
        ({ assertProviderSupported } = require("@utils/providerGuard"));
    });

    test("stripe passes", () => {
        expect(() => assertProviderSupported("stripe")).not.toThrow();
    });

    test("kashier blocked with code KASHIER_DISABLED when flag is off", () => {
        expect(() => assertProviderSupported("kashier")).toThrow(/KASHIER_DISABLED/);
        try {
            assertProviderSupported("kashier");
        } catch (err) {
            expect(err.code).toBe("KASHIER_DISABLED");
            expect(err.status).toBe(503);
        }
    });

    test("paymob blocked with code PROVIDER_NOT_SUPPORTED", () => {
        try {
            assertProviderSupported("paymob");
            throw new Error("should have thrown");
        } catch (err) {
            expect(err.code).toBe("PROVIDER_NOT_SUPPORTED");
            expect(err.provider).toBe("paymob");
        }
    });

    test("paypal blocked with code PROVIDER_NOT_SUPPORTED", () => {
        expect(() => assertProviderSupported("paypal")).toThrow(/PROVIDER_NOT_SUPPORTED/);
    });

    test("unknown string blocked with PROVIDER_NOT_SUPPORTED", () => {
        expect(() => assertProviderSupported("crypto-magic")).toThrow(/PROVIDER_NOT_SUPPORTED/);
    });
});

// ─── Flag on → Kashier allowed ───────────────────────────────────────────────

describe("assertProviderSupported — ENABLE_KASHIER=true", () => {
    let assertProviderSupported;

    beforeEach(() => {
        jest.resetModules();
        jest.doMock("@config/billingConfig", () => ({
            BILLING_FEATURES: { ENABLE_KASHIER: true }
        }));
        ({ assertProviderSupported } = require("@utils/providerGuard"));
    });

    test("kashier passes when flag is on (Phase 2 — SUPPORTED_PROVIDERS now includes kashier)", () => {
        expect(() => assertProviderSupported("kashier")).not.toThrow();
    });

    test("stripe still passes", () => {
        expect(() => assertProviderSupported("stripe")).not.toThrow();
    });

    test("paymob still rejected even with kashier flag on", () => {
        expect(() => assertProviderSupported("paymob")).toThrow(/PROVIDER_NOT_SUPPORTED/);
    });
});

// ─── Phase 10 — Paymob fully removed from factory ───────────────────────────

describe("paymentProviderFactory — Paymob removed (Phase 10)", () => {
    test("getProvider('paymob') throws PROVIDER_NOT_IMPLEMENTED", () => {
        const { getProvider } = require("@billing/providers/paymentProviderFactory");
        expect(() => getProvider("paymob")).toThrow(/PROVIDER_NOT_IMPLEMENTED/);
    });

    test("PROVIDERS map exposes only stripe / paypal / kashier (no paymob)", () => {
        const factoryFile = require("fs").readFileSync(
            require.resolve("@billing/providers/paymentProviderFactory"),
            "utf8"
        );
        // Sanity check: the literal string `paymob:` (a registration entry)
        // must NOT appear in the factory module after Phase 10.
        expect(factoryFile).not.toMatch(/^\s*paymob:/m);
    });
});

// ─── Phase 9 hardening — SUPPORTED_PROVIDERS is frozen ──────────────────────

describe("SUPPORTED_PROVIDERS — frozen at module load", () => {
    let SUPPORTED_PROVIDERS;
    beforeAll(() => {
        ({ SUPPORTED_PROVIDERS } = require("@utils/providerGuard"));
    });

    test("Object.isFrozen returns true", () => {
        expect(Object.isFrozen(SUPPORTED_PROVIDERS)).toBe(true);
    });

    test("attempted .push throws in strict mode", () => {
        expect(() => SUPPORTED_PROVIDERS.push("bitcoin")).toThrow();
    });

    test("attempted index assignment throws in strict mode", () => {
        expect(() => { SUPPORTED_PROVIDERS[0] = "bitcoin"; }).toThrow();
    });
});

// ─── End-to-end: resolvePrice → guard ────────────────────────────────────────

describe("resolvePrice + providerGuard — EG global path is safely blocked", () => {
    let resolvePrice;
    let assertProviderSupported;

    beforeEach(() => {
        jest.resetModules();
        jest.doMock("@config/billingConfig", () => ({
            BILLING_FEATURES: { ENABLE_KASHIER: false }
        }));
        ({ resolvePrice } = require("@platform/billing/pricing/resolvePrice"));
        ({ assertProviderSupported } = require("@utils/providerGuard"));
    });

    test("EG global → provider=kashier → guard throws KASHIER_DISABLED", async () => {
        const plan = {
            pricing: {
                global: {
                    currency: "USD",
                    amountMonthly: 49,
                    amountYearly: 490,
                    providerPriceIds: {
                        stripe: { monthly: "s_m", yearly: "s_y" },
                        kashier: { monthly: "k_m", yearly: "k_y" }
                    }
                }
            }
        };

        const result = await resolvePrice({
            org: { billingCountry: "EG" },
            plan,
            interval: "monthly"
        });

        expect(result.provider).toBe("kashier"); // resolvePrice forward-declares
        expect(() => assertProviderSupported(result.provider))
            .toThrow(/KASHIER_DISABLED/);
    });

    test("non-EG global → provider=stripe → guard passes", async () => {
        const plan = {
            pricing: {
                global: {
                    currency: "USD",
                    amountMonthly: 49,
                    amountYearly: 490,
                    providerPriceIds: {
                        stripe: { monthly: "s_m", yearly: "s_y" }
                    }
                }
            }
        };

        const result = await resolvePrice({
            org: { billingCountry: "US" },
            plan,
            interval: "monthly"
        });

        expect(result.provider).toBe("stripe");
        expect(() => assertProviderSupported(result.provider)).not.toThrow();
    });

    test("EG legacy → provider=paymob → guard throws PROVIDER_NOT_SUPPORTED", async () => {
        const plan = {
            pricing: {
                regions: [{ regionCode: "US", currency: "USD", monthly: 49, yearly: 490 }]
            }
        };

        const result = await resolvePrice({
            org: { billingCountry: "EG" },
            plan,
            interval: "monthly"
        });

        expect(result.provider).toBe("paymob"); // pre-Phase-1 behaviour preserved
        expect(() => assertProviderSupported(result.provider))
            .toThrow(/PROVIDER_NOT_SUPPORTED/);
    });
});
