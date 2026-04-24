/**
 * billingSettingsValidator.unit.test.js — Zod schema tests (Phase 2 D3)
 */

"use strict";

const {
    parse,
    patchBillingSettingsSchema,
} = require("@modules/billingDomain/validators/clinicBillingSettings.validator");

describe("patchBillingSettingsSchema", () => {
    const base = { expectedVersion: 0 };

    test("requires expectedVersion", () => {
        expect(() => parse(patchBillingSettingsSchema, { defaultCurrency: "USD" })).toThrow(/VALIDATION_ERROR/);
    });

    test("rejects empty patch (only expectedVersion)", () => {
        expect(() => parse(patchBillingSettingsSchema, base)).toThrow(/VALIDATION_ERROR/);
    });

    test("accepts currency update", () => {
        const parsed = parse(patchBillingSettingsSchema, { ...base, defaultCurrency: "USD" });
        expect(parsed.defaultCurrency).toBe("USD");
    });

    test("rejects unsupported currency", () => {
        expect(() => parse(patchBillingSettingsSchema, { ...base, defaultCurrency: "ZZZ" })).toThrow(/VALIDATION_ERROR/);
    });

    test("rejects unknown top-level keys (strict mode)", () => {
        expect(() => parse(patchBillingSettingsSchema, { ...base, evil: "payload" })).toThrow(/VALIDATION_ERROR/);
    });

    describe("taxRates", () => {
        test("accepts valid tax rates", () => {
            const parsed = parse(patchBillingSettingsSchema, {
                ...base,
                taxRates: [
                    { code: "VAT_5", label: "VAT 5%", percent: 5, isDefault: true },
                    { code: "VAT_0", label: "Zero-rated", percent: 0 },
                ],
            });
            expect(parsed.taxRates).toHaveLength(2);
        });

        test("rejects percent > 100", () => {
            expect(() => parse(patchBillingSettingsSchema, {
                ...base,
                taxRates: [{ code: "X", label: "X", percent: 150 }],
            })).toThrow();
        });

        test("rejects more than one isDefault", () => {
            let err;
            try {
                parse(patchBillingSettingsSchema, {
                    ...base,
                    taxRates: [
                        { code: "A", label: "A", percent: 5, isDefault: true },
                        { code: "B", label: "B", percent: 10, isDefault: true },
                    ],
                });
            } catch (e) {
                err = e;
            }
            expect(err).toBeDefined();
            expect(err.code).toBe("VALIDATION_ERROR");
            expect(err.details.some((d) => /At most one/.test(d.message))).toBe(true);
        });

        test("caps taxRates array at 20 entries", () => {
            const rates = Array.from({ length: 21 }, (_, i) => ({ code: `T${i}`, label: `Tax ${i}`, percent: 1 }));
            expect(() => parse(patchBillingSettingsSchema, { ...base, taxRates: rates })).toThrow();
        });
    });

    describe("paymentMethods", () => {
        test("accepts valid enum values", () => {
            const parsed = parse(patchBillingSettingsSchema, { ...base, paymentMethods: ["cash", "card", "insurance"] });
            expect(parsed.paymentMethods).toEqual(["cash", "card", "insurance"]);
        });

        test("rejects invalid methods", () => {
            expect(() => parse(patchBillingSettingsSchema, { ...base, paymentMethods: ["crypto"] })).toThrow();
        });

        test("requires at least one method", () => {
            expect(() => parse(patchBillingSettingsSchema, { ...base, paymentMethods: [] })).toThrow();
        });
    });

    describe("invoiceTemplate", () => {
        test("accepts partial object", () => {
            const parsed = parse(patchBillingSettingsSchema, {
                ...base,
                invoiceTemplate: { clinicName: "My Clinic", showTaxBreakdown: false },
            });
            expect(parsed.invoiceTemplate.clinicName).toBe("My Clinic");
        });

        test("rejects unknown keys in template", () => {
            expect(() => parse(patchBillingSettingsSchema, {
                ...base,
                invoiceTemplate: { mystery: "x" },
            })).toThrow();
        });

        test("rejects invalid logoUrl", () => {
            expect(() => parse(patchBillingSettingsSchema, {
                ...base,
                invoiceTemplate: { logoUrl: "not-a-url" },
            })).toThrow();
        });
    });

    describe("numberingScheme", () => {
        test("accepts valid scheme", () => {
            const parsed = parse(patchBillingSettingsSchema, {
                ...base,
                numberingScheme: { prefix: "DEN", padding: 5, resetCadence: "yearly" },
            });
            expect(parsed.numberingScheme.prefix).toBe("DEN");
        });

        test("blocks nextSequence injection (not in schema)", () => {
            expect(() => parse(patchBillingSettingsSchema, {
                ...base,
                numberingScheme: { nextSequence: 99999 },
            })).toThrow();
        });
    });

    describe("discountPolicy", () => {
        test("accepts valid policy", () => {
            const parsed = parse(patchBillingSettingsSchema, {
                ...base,
                discountPolicy: { maxDiscountPercent: 50, requireReasonAbovePercent: 20, allowLineItemDiscounts: false },
            });
            expect(parsed.discountPolicy.maxDiscountPercent).toBe(50);
        });

        test("rejects discount > 100", () => {
            expect(() => parse(patchBillingSettingsSchema, {
                ...base,
                discountPolicy: { maxDiscountPercent: 150 },
            })).toThrow();
        });
    });

    test("surfaces structured error details", () => {
        let err;
        try {
            parse(patchBillingSettingsSchema, { ...base, defaultCurrency: "ZZZ" });
        } catch (e) {
            err = e;
        }
        expect(err.code).toBe("VALIDATION_ERROR");
        expect(err.status).toBe(400);
        expect(Array.isArray(err.details)).toBe(true);
        expect(err.details[0].path).toContain("defaultCurrency");
    });
});
