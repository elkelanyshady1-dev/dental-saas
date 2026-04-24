/**
 * tests/unit/billing/services/billingValidation.service.unit.test.js
 * Phase 2 Hardening — Task 2 coverage.
 */

"use strict";

const {
    assertPaymentMatchesContract
} = require("@billing/services/billingValidation.service");

describe("assertPaymentMatchesContract", () => {
    test("passes when amount + currency match (contract.amountMinor)", () => {
        expect(() => assertPaymentMatchesContract({
            amount: 4900,
            currency: "USD",
            contract: { amountMinor: 4900, currency: "USD" }
        })).not.toThrow();
    });

    test("passes when amount derived from contract.lockedPrice matches", () => {
        expect(() => assertPaymentMatchesContract({
            amount: 4900,
            currency: "USD",
            contract: { lockedPrice: 49, currency: "USD" }
        })).not.toThrow();
    });

    test("currency comparison is case-insensitive", () => {
        expect(() => assertPaymentMatchesContract({
            amount: 245000,
            currency: "egp",
            contract: { amountMinor: 245000, currency: "EGP" }
        })).not.toThrow();
    });

    test("rejects contract missing with code CONTRACT_REQUIRED", () => {
        expect(() => assertPaymentMatchesContract({
            amount: 100,
            currency: "USD",
            contract: null
        })).toThrow(/CONTRACT_REQUIRED/);
    });

    test("rejects amount mismatch with code AMOUNT_MISMATCH", () => {
        try {
            assertPaymentMatchesContract({
                amount: 4800,
                currency: "USD",
                contract: { amountMinor: 4900, currency: "USD" }
            });
            throw new Error("should have thrown");
        } catch (err) {
            expect(err.code).toBe("AMOUNT_MISMATCH");
            expect(err.expected).toBe(4900);
            expect(err.actual).toBe(4800);
        }
    });

    test("rejects currency mismatch with code CURRENCY_MISMATCH", () => {
        try {
            assertPaymentMatchesContract({
                amount: 4900,
                currency: "EGP",
                contract: { amountMinor: 4900, currency: "USD" }
            });
            throw new Error("should have thrown");
        } catch (err) {
            expect(err.code).toBe("CURRENCY_MISMATCH");
            expect(err.expected).toBe("USD");
            expect(err.actual).toBe("EGP");
        }
    });

    test("rejects when contract has no resolvable amount", () => {
        expect(() => assertPaymentMatchesContract({
            amount: 4900,
            currency: "USD",
            contract: { currency: "USD" }
        })).toThrow(/AMOUNT_MISMATCH/);
    });

    test("rejects when contract has no currency", () => {
        expect(() => assertPaymentMatchesContract({
            amount: 4900,
            currency: "USD",
            contract: { amountMinor: 4900 }
        })).toThrow(/CURRENCY_MISMATCH/);
    });
});
