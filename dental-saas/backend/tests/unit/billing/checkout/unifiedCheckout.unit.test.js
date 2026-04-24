/**
 * tests/unit/billing/checkout/unifiedCheckout.unit.test.js
 * Phase 4 — provider-agnostic checkout orchestrator.
 *
 * Strategy: mock every collaborator so the unit stays pure.
 *
 * Covers:
 *   - Input validation: PROVIDER_REQUIRED, PLAN_REQUIRED, INTERVAL_REQUIRED,
 *     INVALID_BILLING_INTERVAL, ORG_REQUIRED.
 *   - Provider guard: KASHIER_DISABLED when flag is off — NO contract
 *     created (orphan prevention).
 *   - Stripe happy path: returns { checkoutUrl, provider, contractId }.
 *   - Kashier happy path with flag on.
 *   - Metadata correctness: orgId, planVersionId, contractId, invoiceId,
 *     interval all threaded to provider.createCheckout.
 *   - Contract precedes provider call (order spy).
 *   - Pricing uses resolvePrice; amountMinor + currency come from pricing,
 *     not from the provider.
 */

"use strict";

// ─── Collaborator mocks ──────────────────────────────────────────────────────

jest.mock("@shared/models/Organization", () => {
    const findByIdLean = jest.fn();
    const findById = jest.fn().mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        lean: findByIdLean
    }));
    return {
        __esModule: true,
        default: { findById },
        _findByIdLean: findByIdLean
    };
});

jest.mock("@billing/models/PlanVersion.model", () => {
    const findById = jest.fn();
    return {
        __esModule: true,
        default: {
            findById: (...args) => ({ lean: () => findById(...args) })
        },
        _findById: findById
    };
});

jest.mock("@billing/models/OrgContract.model", () => ({
    __esModule: true,
    default: { findById: jest.fn(), updateOne: jest.fn() }
}));

jest.mock("@billing/models/PlatformInvoice.model", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        updateOne: jest.fn(),
        create: jest.fn()
    }
}));

jest.mock("@billing/pricing/resolvePrice", () => ({
    resolvePrice: jest.fn()
}));

jest.mock("@billing/services/contractEngine.service", () => ({
    createContract: jest.fn()
}));

jest.mock("@billing/providers/paymentProviderFactory", () => ({
    getProvider: jest.fn()
}));

const Organization = require("@shared/models/Organization");
const PlanVersion = require("@billing/models/PlanVersion.model");
const PlatformInvoice = require("@billing/models/PlatformInvoice.model").default;
const { resolvePrice } = require("@billing/pricing/resolvePrice");
const contractEngine = require("@billing/services/contractEngine.service");
const { getProvider } = require("@billing/providers/paymentProviderFactory");

const { createUnifiedCheckout } = require(
    "@root/organization/billing/checkout/checkoutOrchestrator.service"
);

// ─── Fixtures ────────────────────────────────────────────────────────────────

function validHappyPath({ kashierFlagOn = false, egCountry = false } = {}) {
    // Ambient env for provider guard — the guard reads billingConfig directly,
    // so we control it via the flag in the mock below.
    Organization._findByIdLean.mockResolvedValueOnce({
        _id: "org_1",
        name: "Acme",
        isArchived: false,
        country: egCountry ? "EG" : "US",
        billingCountry: egCountry ? "EG" : "US",
        subscription: { status: "trial" }
    });
    PlanVersion._findById.mockResolvedValueOnce({
        _id: "plan_v1",
        status: "active",
        templateCode: "growth",
        versionTag: "v1",
        pricing: { global: { currency: "USD", amountMonthly: 49, amountYearly: 490 } }
    });
    resolvePrice.mockResolvedValueOnce({
        provider: egCountry ? "kashier" : "stripe",
        amountMinor: egCountry ? 245000 : 4900,
        currency: egCountry ? "EGP" : "USD",
        usdAmount: 49,
        providerPriceId: egCountry ? null : "price_stripe_m",
        resolvedVia: egCountry ? "country-eg" : "global-usd",
        source: "global"
    });
    contractEngine.createContract.mockResolvedValueOnce({
        _id: { toString: () => "ctr_1" },
        contractStatus: "draft",
        effectiveTo: null,
        // Phase 9 hardening — INVOICE_AMOUNT_MISMATCH guard reads lockedPrice.
        // For the happy path, this must equal pricing.amountMinor / 100.
        lockedPrice: egCountry ? 2450 : 49
    });
    PlatformInvoice.create.mockResolvedValueOnce({
        _id: { toString: () => "inv_1" }
    });
}

beforeEach(() => {
    jest.resetModules();
    jest.doMock("@config/billingConfig", () => ({
        BILLING_FEATURES: { ENABLE_KASHIER: false }
    }));
    Organization._findByIdLean.mockReset();
    PlanVersion._findById.mockReset();
    PlatformInvoice.create.mockReset();
    resolvePrice.mockReset();
    contractEngine.createContract.mockReset();
    getProvider.mockReset();
});

// ─── 1. Input validation ─────────────────────────────────────────────────────

describe("createUnifiedCheckout — input validation", () => {
    test("missing provider → PROVIDER_REQUIRED", async () => {
        await expect(
            createUnifiedCheckout({
                organizationId: "org_1",
                planVersionId: "plan_v1",
                billingInterval: "monthly"
            })
        ).rejects.toMatchObject({ code: "PROVIDER_REQUIRED" });
    });

    test("missing planVersionId → PLAN_REQUIRED", async () => {
        await expect(
            createUnifiedCheckout({
                organizationId: "org_1",
                billingInterval: "monthly",
                provider: "stripe"
            })
        ).rejects.toMatchObject({ code: "PLAN_REQUIRED" });
    });

    test("missing interval → INTERVAL_REQUIRED", async () => {
        await expect(
            createUnifiedCheckout({
                organizationId: "org_1",
                planVersionId: "plan_v1",
                provider: "stripe"
            })
        ).rejects.toMatchObject({ code: "INTERVAL_REQUIRED" });
    });

    test("invalid interval → INVALID_BILLING_INTERVAL", async () => {
        await expect(
            createUnifiedCheckout({
                organizationId: "org_1",
                planVersionId: "plan_v1",
                billingInterval: "weekly",
                provider: "stripe"
            })
        ).rejects.toMatchObject({ code: "INVALID_BILLING_INTERVAL" });
    });

    test("missing organizationId → ORG_REQUIRED", async () => {
        await expect(
            createUnifiedCheckout({
                planVersionId: "plan_v1",
                billingInterval: "monthly",
                provider: "stripe"
            })
        ).rejects.toMatchObject({ code: "ORG_REQUIRED" });
    });
});

// ─── 2. Provider guard (no orphan contracts) ─────────────────────────────────

describe("createUnifiedCheckout — provider guard", () => {
    test("kashier with flag OFF → KASHIER_DISABLED AND no contract created", async () => {
        await expect(
            createUnifiedCheckout({
                organizationId: "org_1",
                planVersionId: "plan_v1",
                billingInterval: "monthly",
                provider: "kashier"
            })
        ).rejects.toMatchObject({ code: "KASHIER_DISABLED" });

        // Critical: guard runs BEFORE any DB work.
        expect(Organization._findByIdLean).not.toHaveBeenCalled();
        expect(contractEngine.createContract).not.toHaveBeenCalled();
        expect(PlatformInvoice.create).not.toHaveBeenCalled();
        expect(getProvider).not.toHaveBeenCalled();
    });

    test("unknown provider → PROVIDER_NOT_SUPPORTED, no DB work", async () => {
        await expect(
            createUnifiedCheckout({
                organizationId: "org_1",
                planVersionId: "plan_v1",
                billingInterval: "monthly",
                provider: "crypto-magic"
            })
        ).rejects.toMatchObject({ code: "PROVIDER_NOT_SUPPORTED" });

        expect(contractEngine.createContract).not.toHaveBeenCalled();
    });
});

// ─── 3. Happy path: Stripe ───────────────────────────────────────────────────

describe("createUnifiedCheckout — Stripe happy path", () => {
    test("returns { checkoutUrl, provider:'stripe', contractId, invoiceId }", async () => {
        validHappyPath();
        const createCheckout = jest.fn().mockResolvedValue({
            provider: "stripe", url: "https://stripe/c/1", sessionId: "cs_1"
        });
        getProvider.mockReturnValueOnce({ createCheckout });

        const result = await createUnifiedCheckout({
            organizationId: "org_1",
            planVersionId: "plan_v1",
            billingInterval: "monthly",
            provider: "stripe"
        });

        expect(result).toEqual({
            checkoutUrl: "https://stripe/c/1",
            provider: "stripe",
            contractId: "ctr_1",
            invoiceId: "inv_1"
        });
        expect(getProvider).toHaveBeenCalledWith("stripe");
    });

    // Phase 5 — Task 4: contract.paymentProvider must be the effectiveProvider.
    test("contract is created with paymentProvider = effectiveProvider (not raw request)", async () => {
        validHappyPath();
        const createCheckout = jest.fn().mockResolvedValue({
            provider: "stripe", url: "u", sessionId: "s"
        });
        getProvider.mockReturnValueOnce({ createCheckout });

        await createUnifiedCheckout({
            organizationId: "org_1",
            planVersionId: "plan_v1",
            billingInterval: "monthly",
            provider: "stripe"
        });

        expect(contractEngine.createContract).toHaveBeenCalledWith(
            expect.objectContaining({ paymentProvider: "stripe" }),
            expect.anything()
        );
    });

    test("metadata passed to provider.createCheckout includes contractId/planVersionId/invoiceId/interval/orgId", async () => {
        validHappyPath();
        const createCheckout = jest.fn().mockResolvedValue({
            provider: "stripe", url: "u", sessionId: "s"
        });
        getProvider.mockReturnValueOnce({ createCheckout });

        await createUnifiedCheckout({
            organizationId: "org_1",
            planVersionId: "plan_v1",
            billingInterval: "yearly",
            provider: "stripe"
        });

        expect(createCheckout).toHaveBeenCalledWith({
            amountMinor: 4900,
            currency: "USD",
            metadata: expect.objectContaining({
                orgId: "org_1",
                planVersionId: "plan_v1",
                contractId: "ctr_1",
                invoiceId: "inv_1",
                interval: "yearly"
            })
        });
    });

    test("amountMinor + currency come from pricing (resolvePrice), NOT from the provider", async () => {
        validHappyPath();
        const createCheckout = jest.fn().mockResolvedValue({
            provider: "stripe", url: "u", sessionId: "s"
        });
        getProvider.mockReturnValueOnce({ createCheckout });

        await createUnifiedCheckout({
            organizationId: "org_1",
            planVersionId: "plan_v1",
            billingInterval: "monthly",
            provider: "stripe"
        });

        expect(resolvePrice).toHaveBeenCalledTimes(1);
        // Provider receives the SAME amount the pricer produced — never computes its own.
        expect(createCheckout.mock.calls[0][0].amountMinor).toBe(4900);
        expect(createCheckout.mock.calls[0][0].currency).toBe("USD");
    });
});

// ─── Phase 7: EG enforcement — policy overrides user request ─────────────────

describe("createUnifiedCheckout — EG billingCountry strict enforcement (Phase 9)", () => {
    test("EG org + stripe request → rejects with INVALID_PROVIDER_FOR_COUNTRY; no contract created", async () => {
        jest.resetModules();
        jest.doMock("@config/billingConfig", () => ({
            BILLING_FEATURES: { ENABLE_KASHIER: true }
        }));
        const Organization2 = require("@shared/models/Organization");
        const PlanVersion2 = require("@billing/models/PlanVersion.model");
        const { resolvePrice: resolvePrice2 } = require("@billing/pricing/resolvePrice");
        const contractEngine2 = require("@billing/services/contractEngine.service");
        const { getProvider: getProvider2 } = require("@billing/providers/paymentProviderFactory");
        const { createUnifiedCheckout: createUnifiedCheckout2 } = require(
            "@root/organization/billing/checkout/checkoutOrchestrator.service"
        );

        Organization2._findByIdLean.mockResolvedValueOnce({
            _id: "org_eg_force",
            isArchived: false,
            country: "US",               // signup country (GeoIP-derived, ignored)
            billingCountry: "EG",        // contract-locked — the authoritative source
            subscription: { status: "trial" }
        });
        PlanVersion2._findById.mockResolvedValueOnce({
            _id: "plan_v1",
            status: "active",
            templateCode: "growth",
            versionTag: "v1",
            pricing: { global: { currency: "USD", amountMonthly: 49, amountYearly: 490 } }
        });
        resolvePrice2.mockResolvedValueOnce({
            provider: "kashier",
            amountMinor: 245000,
            currency: "EGP",
            usdAmount: 49,
            providerPriceId: null,
            resolvedVia: "country-eg",
            source: "global"
        });

        await expect(createUnifiedCheckout2({
            organizationId: "org_eg_force",
            planVersionId: "plan_v1",
            billingInterval: "monthly",
            provider: "stripe"   // user asked for stripe — REJECTED
        })).rejects.toMatchObject({
            code: "INVALID_PROVIDER_FOR_COUNTRY",
            status: 400
        });

        // Critical: rejection fires BEFORE contract/invoice creation + provider call.
        expect(contractEngine2.createContract).not.toHaveBeenCalled();
        expect(getProvider2).not.toHaveBeenCalled();
    });

    test("EG org + kashier request → happy path (contract created with kashier)", async () => {
        jest.resetModules();
        jest.doMock("@config/billingConfig", () => ({
            BILLING_FEATURES: { ENABLE_KASHIER: true }
        }));
        const Organization2 = require("@shared/models/Organization");
        const PlanVersion2 = require("@billing/models/PlanVersion.model");
        const { resolvePrice: resolvePrice2 } = require("@billing/pricing/resolvePrice");
        const contractEngine2 = require("@billing/services/contractEngine.service");
        const { getProvider: getProvider2 } = require("@billing/providers/paymentProviderFactory");
        const PlatformInvoice2 = require("@billing/models/PlatformInvoice.model").default;
        const { createUnifiedCheckout: createUnifiedCheckout2 } = require(
            "@root/organization/billing/checkout/checkoutOrchestrator.service"
        );

        Organization2._findByIdLean.mockResolvedValueOnce({
            _id: "org_eg_ok", isArchived: false, country: "EG", billingCountry: "EG",
            subscription: { status: "trial" }
        });
        PlanVersion2._findById.mockResolvedValueOnce({
            _id: "plan_v1", status: "active", templateCode: "growth", versionTag: "v1",
            pricing: { global: { currency: "USD", amountMonthly: 49, amountYearly: 490 } }
        });
        resolvePrice2.mockResolvedValueOnce({
            provider: "kashier", amountMinor: 245000, currency: "EGP", usdAmount: 49,
            providerPriceId: null, resolvedVia: "country-eg", source: "global"
        });
        contractEngine2.createContract.mockResolvedValueOnce({
            _id: { toString: () => "ctr_ok" }, contractStatus: "draft", effectiveTo: null,
            lockedPrice: 2450  // 245000 minor units = pricing.amountMinor
        });
        PlatformInvoice2.create.mockResolvedValueOnce({ _id: { toString: () => "inv_ok" } });
        const createCheckout = jest.fn().mockResolvedValue({
            provider: "kashier", url: "https://checkout.kashier.io/session/y", sessionId: "kshr_y"
        });
        getProvider2.mockReturnValueOnce({ createCheckout });

        const result = await createUnifiedCheckout2({
            organizationId: "org_eg_ok",
            planVersionId: "plan_v1",
            billingInterval: "monthly",
            provider: "kashier"   // explicit — passes the strict check
        });

        expect(result.provider).toBe("kashier");
        expect(contractEngine2.createContract).toHaveBeenCalledWith(
            expect.objectContaining({ paymentProvider: "kashier" }),
            expect.anything()
        );
    });
});

// ─── 4. Happy path: Kashier (flag ON) ────────────────────────────────────────

describe("createUnifiedCheckout — Kashier happy path", () => {
    test("with ENABLE_KASHIER=true and EG org → Kashier checkout URL", async () => {
        jest.resetModules();
        jest.doMock("@config/billingConfig", () => ({
            BILLING_FEATURES: { ENABLE_KASHIER: true }
        }));
        const Organization2 = require("@shared/models/Organization");
        const PlanVersion2 = require("@billing/models/PlanVersion.model");
        const { resolvePrice: resolvePrice2 } = require("@billing/pricing/resolvePrice");
        const contractEngine2 = require("@billing/services/contractEngine.service");
        const { getProvider: getProvider2 } = require("@billing/providers/paymentProviderFactory");
        const PlatformInvoice2 = require("@billing/models/PlatformInvoice.model").default;
        const { createUnifiedCheckout: createUnifiedCheckout2 } = require(
            "@root/organization/billing/checkout/checkoutOrchestrator.service"
        );

        Organization2._findByIdLean.mockResolvedValueOnce({
            _id: "org_eg",
            name: "Cairo Clinic",
            isArchived: false,
            country: "EG",
            billingCountry: "EG",
            subscription: { status: "trial" }
        });
        PlanVersion2._findById.mockResolvedValueOnce({
            _id: "plan_v1",
            status: "active",
            templateCode: "growth",
            versionTag: "v1",
            pricing: { global: { currency: "USD", amountMonthly: 49, amountYearly: 490 } }
        });
        resolvePrice2.mockResolvedValueOnce({
            provider: "kashier",
            amountMinor: 245000,
            currency: "EGP",
            usdAmount: 49,
            providerPriceId: null,
            resolvedVia: "country-eg",
            source: "global"
        });
        contractEngine2.createContract.mockResolvedValueOnce({
            _id: { toString: () => "ctr_eg" },
            contractStatus: "draft",
            effectiveTo: null,
            lockedPrice: 2450  // 245000 minor units = pricing.amountMinor
        });
        PlatformInvoice2.create.mockResolvedValueOnce({
            _id: { toString: () => "inv_eg" }
        });

        const createCheckout = jest.fn().mockResolvedValue({
            provider: "kashier",
            url: "https://checkout.kashier.io/session/kshr_inv_eg_abc",
            sessionId: "kshr_inv_eg_abc"
        });
        getProvider2.mockReturnValueOnce({ createCheckout });

        const result = await createUnifiedCheckout2({
            organizationId: "org_eg",
            planVersionId: "plan_v1",
            billingInterval: "monthly",
            provider: "kashier"
        });

        expect(result.checkoutUrl).toBe("https://checkout.kashier.io/session/kshr_inv_eg_abc");
        expect(result.provider).toBe("kashier");
        expect(result.contractId).toBe("ctr_eg");
        expect(createCheckout).toHaveBeenCalledWith(expect.objectContaining({
            amountMinor: 245000,
            currency: "EGP"
        }));
    });
});

// ─── 5. Order: contract BEFORE provider call ─────────────────────────────────

describe("createUnifiedCheckout — ordering", () => {
    test("contract is created BEFORE provider.createCheckout", async () => {
        validHappyPath();

        const callOrder = [];
        contractEngine.createContract.mockReset();
        contractEngine.createContract.mockImplementationOnce(async () => {
            callOrder.push("contract");
            return {
                _id: { toString: () => "ctr_1" },
                contractStatus: "draft",
                effectiveTo: null,
                lockedPrice: 49 // matches pricing.amountMinor=4900
            };
        });
        const createCheckout = jest.fn().mockImplementation(async () => {
            callOrder.push("checkout");
            return { provider: "stripe", url: "u", sessionId: "s" };
        });
        getProvider.mockReturnValueOnce({ createCheckout });

        await createUnifiedCheckout({
            organizationId: "org_1",
            planVersionId: "plan_v1",
            billingInterval: "monthly",
            provider: "stripe"
        });

        expect(callOrder).toEqual(["contract", "checkout"]);
    });
});

// ─── Phase 9 hardening — invariant assertions ────────────────────────────────

describe("createUnifiedCheckout — Phase 9 invariants", () => {
    test("PRICING_POLICY_MISMATCH when pricing.provider != effectiveProvider (500)", async () => {
        // Force a divergence: pricing returns "kashier" but a non-EG org +
        // requestedProvider="stripe" makes effectiveProvider "stripe".
        Organization._findByIdLean.mockResolvedValueOnce({
            _id: "org_div", name: "X", isArchived: false, country: "US",
            billingCountry: "US",   // not EG → policy returns requested
            subscription: { status: "trial" }
        });
        PlanVersion._findById.mockResolvedValueOnce({
            _id: "plan_v1", status: "active", templateCode: "growth",
            versionTag: "v1", pricing: { global: { currency: "USD", amountMonthly: 49, amountYearly: 490 } }
        });
        // Simulated bug: pricing returns kashier even though org is non-EG.
        resolvePrice.mockResolvedValueOnce({
            provider: "kashier", amountMinor: 4900, currency: "USD", usdAmount: 49,
            providerPriceId: null, resolvedVia: "country-eg", source: "global"
        });

        await expect(createUnifiedCheckout({
            organizationId: "org_div", planVersionId: "plan_v1",
            billingInterval: "monthly", provider: "stripe"
        })).rejects.toMatchObject({
            code: "PRICING_POLICY_MISMATCH",
            status: 500,
            pricingProvider: "kashier",
            effectiveProvider: "stripe"
        });
        expect(contractEngine.createContract).not.toHaveBeenCalled();
    });

    test("INVOICE_AMOUNT_MISMATCH when contract.lockedPrice * 100 != pricing.amountMinor", async () => {
        validHappyPath();
        // Override: contract returns a tampered lockedPrice that doesn't match pricing.amountMinor (4900).
        contractEngine.createContract.mockReset();
        contractEngine.createContract.mockResolvedValueOnce({
            _id: { toString: () => "ctr_tamper" },
            contractStatus: "draft",
            effectiveTo: null,
            lockedPrice: 99   // 9900 in minor units — diverges from pricing.amountMinor=4900
        });

        await expect(createUnifiedCheckout({
            organizationId: "org_1", planVersionId: "plan_v1",
            billingInterval: "monthly", provider: "stripe"
        })).rejects.toMatchObject({
            code: "INVOICE_AMOUNT_MISMATCH",
            status: 500,
            invoiceAmountMinor: 4900,
            contractAmountMinor: 9900
        });
        expect(PlatformInvoice.create).not.toHaveBeenCalled();
    });

    test("CHECKOUT_RESPONSE_INVALID when provider returns null url", async () => {
        validHappyPath();
        const createCheckout = jest.fn().mockResolvedValue({
            provider: "stripe", url: null, sessionId: "cs_null"
        });
        getProvider.mockReturnValueOnce({ createCheckout });

        await expect(createUnifiedCheckout({
            organizationId: "org_1", planVersionId: "plan_v1",
            billingInterval: "monthly", provider: "stripe"
        })).rejects.toMatchObject({
            code: "CHECKOUT_RESPONSE_INVALID",
            status: 500,
            missingField: "checkoutUrl"
        });
    });

    test("CHECKOUT_METADATA_MISSING when invoice._id is missing", async () => {
        validHappyPath();
        // Override invoice to lack _id (simulate broken creation result).
        PlatformInvoice.create.mockReset();
        PlatformInvoice.create.mockResolvedValueOnce({ _id: { toString: () => "" } });

        await expect(createUnifiedCheckout({
            organizationId: "org_1", planVersionId: "plan_v1",
            billingInterval: "monthly", provider: "stripe"
        })).rejects.toMatchObject({
            code: "CHECKOUT_METADATA_MISSING",
            status: 500,
            missingField: "invoiceId"
        });
        expect(getProvider).not.toHaveBeenCalled();
    });
});

// ─── 6. Plan/org failure paths ───────────────────────────────────────────────

describe("createUnifiedCheckout — not-found paths", () => {
    test("org missing → ORG_NOT_FOUND", async () => {
        Organization._findByIdLean.mockResolvedValueOnce(null);
        await expect(
            createUnifiedCheckout({
                organizationId: "org_1",
                planVersionId: "plan_v1",
                billingInterval: "monthly",
                provider: "stripe"
            })
        ).rejects.toMatchObject({ code: "ORG_NOT_FOUND" });
    });

    test("plan missing → PLAN_VERSION_NOT_FOUND", async () => {
        Organization._findByIdLean.mockResolvedValueOnce({
            _id: "org_1", isArchived: false, country: "US", subscription: {}
        });
        PlanVersion._findById.mockResolvedValueOnce(null);
        await expect(
            createUnifiedCheckout({
                organizationId: "org_1",
                planVersionId: "missing",
                billingInterval: "monthly",
                provider: "stripe"
            })
        ).rejects.toMatchObject({ code: "PLAN_VERSION_NOT_FOUND" });
    });

    test("plan not active → PLAN_NOT_ACTIVE", async () => {
        Organization._findByIdLean.mockResolvedValueOnce({
            _id: "org_1", isArchived: false, country: "US", subscription: {}
        });
        PlanVersion._findById.mockResolvedValueOnce({
            _id: "p", status: "draft", templateCode: "x", versionTag: "v1", pricing: {}
        });
        await expect(
            createUnifiedCheckout({
                organizationId: "org_1",
                planVersionId: "p",
                billingInterval: "monthly",
                provider: "stripe"
            })
        ).rejects.toMatchObject({ code: "PLAN_NOT_ACTIVE" });
    });
});
