/**
 * addonCheckoutOrchestrator.unit.test.js
 * v6 — Storage Add-on System (Task B3)
 *
 * Covers createAddOnCheckoutSession:
 *   Case 13 — Successful add-on checkout creates OrgAddOn + invoice with snapshot
 *   Case 14 — Duplicate add-on purchase short-circuits on idempotencyKey
 */

"use strict";

// ─── Mocks (installed before SUT require) ───────────────────────────────────

const mockOrgFindById = jest.fn();
const mockOrgContractFindOne = jest.fn();
const mockAddOnFindById = jest.fn();
const mockInvoiceFindOne = jest.fn();
const mockInvoiceCreate  = jest.fn();
const mockOrgAddOnFindOne = jest.fn();
const mockOrgAddOnCreate  = jest.fn();
const mockStartSession = jest.fn();
const mockWithTransaction = jest.fn();
const mockEndSession = jest.fn();
const mockResolvePrice = jest.fn();

jest.mock("@billing/models/PlanVersion.model", () => ({
    default: { findById: jest.fn() }
}), { virtual: true });

jest.mock("@billing/models/OrgContract.model", () => ({
    default: {
        findOne: (...a) => {
            // Support the chain: OrgContract.findOne(...).sort(...).lean()
            const ret = mockOrgContractFindOne(...a);
            return {
                sort: () => ({ lean: () => Promise.resolve(ret) })
            };
        },
        findById: jest.fn()
    }
}), { virtual: true });

jest.mock("@billing/models/PlatformInvoice.model", () => ({
    default: {
        findOne: (...a) => mockInvoiceFindOne(...a),
        create:  (...a) => mockInvoiceCreate(...a),
        db: { startSession: (...a) => mockStartSession(...a) }
    }
}), { virtual: true });

jest.mock("@shared/models/Organization", () => ({
    default: {
        findById: (...a) => mockOrgFindById(...a)
    }
}), { virtual: true });

jest.mock("@platform/domain/models/addOn.model", () => ({
    default: { findById: (...a) => mockAddOnFindById(...a) }
}), { virtual: true });

jest.mock("@billing/models/OrgAddOn.model", () => ({
    default: {
        findOne: (...a) => mockOrgAddOnFindOne(...a),
        create:  (...a) => mockOrgAddOnCreate(...a)
    }
}), { virtual: true });

jest.mock("@billing/pricing/pricingEngine.service", () => ({
    computePrice: jest.fn()
}), { virtual: true });

jest.mock("@billing/pricing/resolvePrice", () => ({
    resolvePrice: (...a) => mockResolvePrice(...a)
}), { virtual: true });

jest.mock("@billing/services/contractEngine.service", () => ({
    createContract: jest.fn()
}), { virtual: true });

const mockProvider = { createNewCheckoutSession: jest.fn() };
jest.mock("@billing/providers/paymentProviderFactory", () => ({
    getProvider: () => mockProvider
}), { virtual: true });

jest.mock("@utils/logger", () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const {
    createAddOnCheckoutSession
} = require("@billing/services/checkoutOrchestrator.service");

function seedHappy() {
    mockOrgFindById.mockReturnValue({
        select: () => ({
            lean: () => Promise.resolve({
                _id: "org-1", name: "Acme", isArchived: false,
                billingCountry: "US", country: "US"
            })
        })
    });
    mockOrgContractFindOne.mockReturnValue({
        _id: "contract-current",
        contractStatus: "active"
    });
    mockAddOnFindById.mockReturnValue({
        lean: () => Promise.resolve({
            _id: "addon-storage-10gb",
            code: "STORAGE_10GB",
            name: "Storage +10GB",
            type: "STORAGE",
            isActive: true,
            pricing: {
                global: {
                    currency: "USD",
                    monthly: 9,
                    yearly:  90,
                    providerPriceIds: { stripe: { monthly: "price_addon_m" } }
                }
            },
            storageConfig: { quotaMB: 10240, overageAllowed: false, overagePricePerGB: 0 }
        })
    });
    mockResolvePrice.mockResolvedValue({
        currency: "USD",
        amount:   9,
        provider: "stripe",
        providerPriceId: "price_addon_m",
        usdAmount: 9,
        fxRate:   null,
        resolvedVia: "global-usd"
    });
    mockInvoiceFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockOrgAddOnFindOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    mockOrgAddOnCreate.mockResolvedValue([{ _id: "orgAddOn-new" }]);
    mockInvoiceCreate.mockResolvedValue([{
        _id: "invoice-addon-new",
        currency: "USD",
        totalAmountMinor: 900
    }]);
    mockProvider.createNewCheckoutSession.mockResolvedValue({
        url: "https://checkout.test/addon/abc"
    });
    mockStartSession.mockResolvedValue({
        withTransaction: mockWithTransaction,
        endSession: mockEndSession
    });
    mockEndSession.mockResolvedValue(undefined);
    mockWithTransaction.mockImplementation(async (cb) => { await cb(); });
}

beforeEach(() => {
    jest.clearAllMocks();
    seedHappy();
});

describe("createAddOnCheckoutSession", () => {
    test("Case 13: creates OrgAddOn + invoice with billingSnapshot", async () => {
        const result = await createAddOnCheckoutSession({
            organizationId: "org-1",
            addOnId:        "addon-storage-10gb",
            billingInterval: "monthly"
        });

        expect(result).toEqual({
            checkoutUrl: "https://checkout.test/addon/abc",
            orgAddOnId:  "orgAddOn-new",
            invoiceId:   "invoice-addon-new"
        });

        // OrgAddOn create payload carries billingSnapshot + idempotencyKey
        const orgAddOnPayload = mockOrgAddOnCreate.mock.calls[0][0][0];
        expect(orgAddOnPayload.billingSnapshot).toMatchObject({
            resolvedPrice: 9,
            currency: "USD",
            provider: "stripe",
            resolvedVia: "global-usd"
        });
        expect(orgAddOnPayload.idempotencyKey)
            .toBe("addon-checkout:org-1:addon-storage-10gb:monthly");

        // Invoice create payload mirrors the snapshot + idempotencyKey
        const invoicePayload = mockInvoiceCreate.mock.calls[0][0][0];
        expect(invoicePayload.billingSnapshot).toMatchObject({
            resolvedPrice: 9, currency: "USD", provider: "stripe"
        });
        expect(invoicePayload.idempotencyKey)
            .toBe("addon-checkout:org-1:addon-storage-10gb:monthly");
        expect(invoicePayload.invoiceType).toBe("addon");
        expect(invoicePayload.contractId).toBe("contract-current");

        // Transaction was used, session was closed
        expect(mockWithTransaction).toHaveBeenCalledTimes(1);
        expect(mockEndSession).toHaveBeenCalledTimes(1);
    });

    test("Case 14: duplicate purchase short-circuits to existing invoice", async () => {
        mockInvoiceFindOne.mockReturnValueOnce({
            lean: () => Promise.resolve({
                _id: "invoice-existing",
                currency: "USD",
                totalAmountMinor: 900
            })
        });
        mockOrgAddOnFindOne.mockReturnValueOnce({
            lean: () => Promise.resolve({ _id: "orgAddOn-existing" })
        });

        const result = await createAddOnCheckoutSession({
            organizationId: "org-1",
            addOnId:        "addon-storage-10gb",
            billingInterval: "monthly"
        });

        expect(result.invoiceId).toBe("invoice-existing");
        expect(result.orgAddOnId).toBe("orgAddOn-existing");

        // Critical: no new writes
        expect(mockOrgAddOnCreate).not.toHaveBeenCalled();
        expect(mockInvoiceCreate).not.toHaveBeenCalled();
        expect(mockStartSession).not.toHaveBeenCalled();
    });

    test("rejects invalid billing interval", async () => {
        await expect(createAddOnCheckoutSession({
            organizationId: "org-1",
            addOnId:        "addon-storage-10gb",
            billingInterval: "weekly"
        })).rejects.toMatchObject({ code: "INVALID_BILLING_INTERVAL" });
    });

    test("rejects org with no active contract", async () => {
        mockOrgContractFindOne.mockReturnValueOnce(null);
        await expect(createAddOnCheckoutSession({
            organizationId: "org-1",
            addOnId:        "addon-storage-10gb",
            billingInterval: "monthly"
        })).rejects.toMatchObject({ code: "NO_ACTIVE_CONTRACT" });
    });
});
