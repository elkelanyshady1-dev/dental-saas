/**
 * billingSettingsDTO.contract.test.js — DTO shape tests (Phase 2 D3)
 */

"use strict";

const {
    BILLING_SETTINGS_DTO_VERSION,
    buildBillingSettingsDTO,
    envelope,
} = require("@modules/billingDomain/organizationFinance/dto/clinicBillingSettings.dto");

function makeSettings(overrides = {}) {
    return {
        singletonKey: "org-billing-settings",
        organizationId: "507f1f77bcf86cd799439011",
        defaultCurrency: "AED",
        supportedCurrencies: ["AED", "USD"],
        taxRates: [
            { code: "VAT_5", label: "VAT 5%", percent: 5, isDefault: true },
        ],
        numberingScheme: {
            prefix: "INV",
            padding: 6,
            nextSequence: 42,
            resetCadence: "yearly",
            lastResetAt: new Date("2026-01-01T00:00:00Z"),
        },
        invoiceTemplate: {
            clinicName: "Smile Clinic",
            footerText: "Thank you",
            showTaxBreakdown: true,
        },
        paymentMethods: ["cash", "card"],
        discountPolicy: {
            maxDiscountPercent: 25,
            requireReasonAbovePercent: 10,
            allowLineItemDiscounts: true,
        },
        version: 3,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-04-15T00:00:00Z"),
        ...overrides,
    };
}

describe("billingSettings.dto", () => {
    test("DTO version is exported", () => {
        expect(BILLING_SETTINGS_DTO_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test("null input returns null", () => {
        expect(buildBillingSettingsDTO(null)).toBeNull();
        expect(buildBillingSettingsDTO(undefined)).toBeNull();
    });

    test("strips singletonKey and organizationId", () => {
        const dto = buildBillingSettingsDTO(makeSettings());
        expect("singletonKey" in dto).toBe(false);
        expect("organizationId" in dto).toBe(false);
    });

    test("ISO-formats dates", () => {
        const dto = buildBillingSettingsDTO(makeSettings());
        expect(dto.createdAt).toMatch(/T/);
        expect(dto.updatedAt).toMatch(/T/);
        expect(dto.numberingScheme.lastResetAt).toMatch(/T/);
    });

    test("exposes version for optimistic concurrency", () => {
        const dto = buildBillingSettingsDTO(makeSettings({ version: 7 }));
        expect(dto.version).toBe(7);
    });

    test("defaults version to 0 when missing", () => {
        const dto = buildBillingSettingsDTO(makeSettings({ version: undefined }));
        expect(dto.version).toBe(0);
    });

    test("copies arrays by value (no reference sharing)", () => {
        const src = makeSettings();
        const dto = buildBillingSettingsDTO(src);
        dto.supportedCurrencies.push("EUR");
        expect(src.supportedCurrencies).toEqual(["AED", "USD"]);
    });

    test("tax rates are cleaned to known fields only", () => {
        const dto = buildBillingSettingsDTO(makeSettings({
            taxRates: [
                { code: "A", label: "A", percent: 5, isDefault: false, _id: "xxx", __v: 0 },
            ],
        }));
        expect(dto.taxRates[0]).toEqual({ code: "A", label: "A", percent: 5, isDefault: false });
    });

    test("falls back gracefully when sub-objects are missing", () => {
        const dto = buildBillingSettingsDTO({
            defaultCurrency: "AED",
            version: 1,
        });
        expect(dto.taxRates).toEqual([]);
        expect(dto.paymentMethods).toEqual([]);
        expect(dto.numberingScheme).toBeNull();
        expect(dto.invoiceTemplate).toBeNull();
        expect(dto.discountPolicy).toBeNull();
        expect(dto.supportedCurrencies).toEqual(["AED"]);
    });

    describe("envelope helper", () => {
        test("wraps data with success + version metadata", () => {
            const env = envelope(buildBillingSettingsDTO(makeSettings()));
            expect(env.success).toBe(true);
            expect(env.version).toBe(BILLING_SETTINGS_DTO_VERSION);
            expect(env.data).toBeTruthy();
            expect(env.data.defaultCurrency).toBe("AED");
        });
    });
});
