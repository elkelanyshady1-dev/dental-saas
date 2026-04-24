/**
 * tests/unit/billing/services/checkoutPolicy.service.unit.test.js
 * Phase 5 — resolveEffectiveProvider coverage.
 *
 * Policy is currently a passthrough. These tests lock the contract so a
 * future policy change (e.g. forcing EG → Kashier) has to update the tests
 * deliberately rather than silently shipping a regression.
 */

"use strict";

const {
    resolveEffectiveProvider
} = require("@billing/services/checkoutPolicy.service");

describe("resolveEffectiveProvider", () => {
    test("returns the requested provider for a non-EG org", () => {
        expect(resolveEffectiveProvider({
            org: { billingCountry: "US" },
            requestedProvider: "stripe"
        })).toBe("stripe");
    });

    test("returns kashier for non-EG org when kashier is requested", () => {
        expect(resolveEffectiveProvider({
            org: { billingCountry: "DE" },
            requestedProvider: "kashier"
        })).toBe("kashier");
    });

    // ─── Phase 9: strict EG validation (no silent remap) ────────────────────
    test("EG billingCountry + stripe request → throws INVALID_PROVIDER_FOR_COUNTRY (400)", () => {
        try {
            resolveEffectiveProvider({
                org: { billingCountry: "EG" },
                requestedProvider: "stripe"
            });
            throw new Error("should have thrown");
        } catch (err) {
            expect(err.code).toBe("INVALID_PROVIDER_FOR_COUNTRY");
            expect(err.status).toBe(400);
            expect(err.billingCountry).toBe("EG");
            expect(err.requestedProvider).toBe("stripe");
            expect(err.expectedProvider).toBe("kashier");
        }
    });

    test("EG billingCountry + kashier request → kashier (happy path)", () => {
        expect(resolveEffectiveProvider({
            org: { billingCountry: "EG" },
            requestedProvider: "kashier"
        })).toBe("kashier");
    });

    test("EG billingCountry + paypal request → throws INVALID_PROVIDER_FOR_COUNTRY", () => {
        expect(() => resolveEffectiveProvider({
            org: { billingCountry: "EG" },
            requestedProvider: "paypal"
        })).toThrow(/INVALID_PROVIDER_FOR_COUNTRY/);
    });

    test("EG policy uses ONLY billingCountry — country='EG' alone does NOT force kashier", () => {
        // country (signup country, potentially GeoIP-derived) must not drive
        // payment routing. Only billingCountry (locked at contract activation).
        expect(resolveEffectiveProvider({
            org: { country: "EG", billingCountry: null },
            requestedProvider: "stripe"
        })).toBe("stripe");
    });

    test("org.billingCountry 'eg' lowercase is NOT treated as EG (strict match)", () => {
        expect(resolveEffectiveProvider({
            org: { billingCountry: "eg" },
            requestedProvider: "stripe"
        })).toBe("stripe");
    });

    test("does not override user choice with pricing.provider for non-EG orgs", () => {
        expect(resolveEffectiveProvider({
            org: { billingCountry: "US" },
            requestedProvider: "stripe",
            pricing: { provider: "kashier", amountMinor: 245000, currency: "EGP" }
        })).toBe("stripe");
    });

    test("throws PROVIDER_REQUIRED when requestedProvider is missing", () => {
        expect(() => resolveEffectiveProvider({
            org: { country: "US" }
        })).toThrow(/PROVIDER_REQUIRED/);
    });

    test("throws PROVIDER_REQUIRED for empty string", () => {
        expect(() => resolveEffectiveProvider({
            org: {}, requestedProvider: ""
        })).toThrow(/PROVIDER_REQUIRED/);
    });

    test("throws PROVIDER_REQUIRED for null", () => {
        try {
            resolveEffectiveProvider({ org: {}, requestedProvider: null });
            throw new Error("should have thrown");
        } catch (err) {
            expect(err.code).toBe("PROVIDER_REQUIRED");
            expect(err.status).toBe(400);
        }
    });

    test("works with empty params object (guard triggers first)", () => {
        expect(() => resolveEffectiveProvider({})).toThrow(/PROVIDER_REQUIRED/);
    });
});
