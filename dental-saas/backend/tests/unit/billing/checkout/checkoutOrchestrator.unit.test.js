/**
 * checkoutOrchestrator.unit.test.js
 * v24 — Billing Hardening (Tasks A1, A2, A3, A5)
 *
 * Covers createCheckoutSession with heavy mocks at the module boundary:
 *   Case 1 — Successful checkout creates contract + invoice with billingSnapshot
 *   Case 2 — Idempotency short-circuit: duplicate call returns existing invoice
 *   Case 3 — E11000 race: concurrent insert failure is rescued via lookup
 *   Case 4 — Transaction rollback: contract failure → no invoice persisted
 */

"use strict";

// ─── Mocks — installed BEFORE requiring the SUT ─────────────────────────────

const mockPlanFindById = jest.fn();
const mockOrgFindById  = jest.fn();
const mockOrgContractFindById = jest.fn();
const mockInvoiceFindOne  = jest.fn();
const mockInvoiceCreate   = jest.fn();
const mockStartSession    = jest.fn();
const mockEndSession      = jest.fn();
const mockWithTransaction = jest.fn();

jest.mock("@billing/models/PlanVersion.model", () => ({
    default: { findById: (...a) => mockPlanFindById(...a) }
}), { virtual: true });

jest.mock("@billing/models/OrgContract.model", () => ({
    default: { findById: (...a) => mockOrgContractFindById(...a), findOne: jest.fn() }
}), { virtual: true });

jest.mock("@billing/models/PlatformInvoice.model", () => ({
    default: {
        findOne: (...a) => mockInvoiceFindOne(...a),
        create:  (...a) => mockInvoiceCreate(...a),
        db: { startSession: (...a) => mockStartSession(...a) }
    }
}), { virtual: true });

jest.mock("@shared/models/Organization", () => ({
    default: { findById: (...a) => mockOrgFindById(...a) }
}), { virtual: true });

jest.mock("@platform/domain/models/addOn.model", () => ({
    default: { findById: jest.fn() }
}), { virtual: true });

jest.mock("@billing/models/OrgAddOn.model", () => ({
    default: {
        findOne: jest.fn(),
        create:  jest.fn()
    }
}), { virtual: true });

const mockComputePrice = jest.fn();
jest.mock("@billing/pricing/pricingEngine.service", () => ({
    computePrice: (...a) => mockComputePrice(...a)
}), { virtual: true });

jest.mock("@billing/pricing/resolvePrice", () => ({
    resolvePrice: jest.fn()
}), { virtual: true });

const mockCreateContract = jest.fn();
jest.mock("@billing/services/contractEngine.service", () => ({
    createContract: (...a) => mockCreateContract(...a)
}), { virtual: true });

const mockProvider = { createNewCheckoutSession: jest.fn() };
jest.mock("@billing/providers/paymentProviderFactory", () => ({
    getProvider: jest.fn(() => mockProvider)
}), { virtual: true });

jest.mock("@utils/logger", () => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const {
    createCheckoutSession
} = require("@billing/services/checkoutOrchestrator.service");

// ─── Shared fixtures ────────────────────────────────────────────────────────

function resetAll() {
    mockPlanFindById.mockReset();
    mockOrgFindById.mockReset();
    mockOrgContractFindById.mockReset();
    mockInvoiceFindOne.mockReset();
    mockInvoiceCreate.mockReset();
    mockStartSession.mockReset();
    mockEndSession.mockReset();
    mockWithTransaction.mockReset();
    mockComputePrice.mockReset();
    mockCreateContract.mockReset();
    mockProvider.createNewCheckoutSession.mockReset();

    mockStartSession.mockResolvedValue({
        withTransaction: mockWithTransaction,
        endSession: mockEndSession
    });
    mockEndSession.mockResolvedValue(undefined);
}

function seedHappyPath() {
    mockOrgFindById.mockReturnValue({
        select: () => ({
            lean: () => Promise.resolve({
                _id: "org-1",
                name: "Acme",
                isArchived: false,
                billingCountry: "US",
                country: "US"
            })
        })
    });
    mockPlanFindById.mockReturnValue({
        lean: () => Promise.resolve({
            _id: "plan-1",
            status: "active",
            visibility: "public",
            templateCode: "PRO",
            versionTag: "v1"
        })
    });
    mockComputePrice.mockResolvedValue({
        finalPrice:  100,
        currency:    "USD",
        billingInterval: "monthly",
        provider:    "stripe",
        providerPriceId: "price_test",
        resolvedVia: "global-usd",
        fxRate:      null,
        taxRate:     0,
        taxAmount:   0,
        discountAmount: 0,
        snapshot: { engineVersion: "v4" }
    });
    mockInvoiceFindOne.mockReturnValue({
        lean: () => Promise.resolve(null) // no existing invoice → fresh path
    });
    mockCreateContract.mockResolvedValue({
        _id: "contract-1",
        contractStatus: "draft",
        effectiveTo: null
    });
    mockInvoiceCreate.mockResolvedValue([{
        _id: "invoice-1",
        contractId: "contract-1",
        currency: "USD",
        totalAmountMinor: 10000
    }]);
    mockProvider.createNewCheckoutSession.mockResolvedValue({
        url: "https://checkout.test/session/abc"
    });
}

beforeEach(resetAll);

// ─── Case 1: Successful Checkout ────────────────────────────────────────────
describe("createCheckoutSession — happy path", () => {
    test("Case 1: creates contract + invoice atomically with billingSnapshot", async () => {
        seedHappyPath();

        // Execute the transaction callback inline — simulates successful commit
        mockWithTransaction.mockImplementation(async (cb) => { await cb(); });

        const result = await createCheckoutSession({
            organizationId: "org-1",
            planVersionId:  "plan-1",
            billingInterval: "monthly"
        });

        expect(result).toEqual({
            checkoutUrl: "https://checkout.test/session/abc",
            contractId:  "contract-1",
            invoiceId:   "invoice-1"
        });

        // A2: transaction was used
        expect(mockStartSession).toHaveBeenCalledTimes(1);
        expect(mockWithTransaction).toHaveBeenCalledTimes(1);
        expect(mockEndSession).toHaveBeenCalledTimes(1);

        // A3: idempotencyKey flows into contractEngine
        const contractArgs = mockCreateContract.mock.calls[0][0];
        expect(contractArgs.idempotencyKey).toBe("checkout:org-1:plan-1:monthly");

        // A1: billingSnapshot present on the invoice create payload
        const invoiceArgs = mockInvoiceCreate.mock.calls[0][0][0];
        expect(invoiceArgs.billingSnapshot).toMatchObject({
            resolvedPrice: 100,
            currency:      "USD",
            provider:      "stripe",
            resolvedVia:   "global-usd"
        });
        expect(invoiceArgs.idempotencyKey).toBe("checkout:org-1:plan-1:monthly");

        // A1: billingSnapshot is ALSO merged into the contract pricingSnapshot
        expect(contractArgs.pricingSnapshot).toMatchObject({
            resolvedPrice: 100,
            currency:      "USD",
            provider:      "stripe"
        });

        // Provider session created OUTSIDE the transaction
        expect(mockProvider.createNewCheckoutSession).toHaveBeenCalledTimes(1);
    });
});

// ─── Case 2: Idempotency Short-Circuit ──────────────────────────────────────
describe("createCheckoutSession — idempotency", () => {
    test("Case 2: duplicate call with same key returns existing invoice", async () => {
        seedHappyPath();

        // First lookup returns an existing draft/open invoice → short-circuit
        mockInvoiceFindOne.mockReturnValueOnce({
            lean: () => Promise.resolve({
                _id: "invoice-existing",
                contractId: "contract-existing",
                currency: "USD",
                totalAmountMinor: 10000
            })
        });

        const result = await createCheckoutSession({
            organizationId: "org-1",
            planVersionId:  "plan-1",
            billingInterval: "monthly"
        });

        expect(result.invoiceId).toBe("invoice-existing");
        expect(result.contractId).toBe("contract-existing");

        // No transaction opened — short-circuited before the write path
        expect(mockStartSession).not.toHaveBeenCalled();
        expect(mockCreateContract).not.toHaveBeenCalled();
        expect(mockInvoiceCreate).not.toHaveBeenCalled();

        // Fresh provider session still created (URLs are short-lived)
        expect(mockProvider.createNewCheckoutSession).toHaveBeenCalledTimes(1);
    });
});

// ─── Case 3: E11000 Race Fallback ───────────────────────────────────────────
describe("createCheckoutSession — E11000 race", () => {
    test("Case 3: concurrent insert (E11000) is rescued via existing-record lookup", async () => {
        seedHappyPath();

        // Pre-check returns null (no existing record yet)
        mockInvoiceFindOne.mockReturnValueOnce({
            lean: () => Promise.resolve(null)
        });

        // Transaction throws E11000 (concurrent writer won the unique index)
        const dupErr = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
        mockWithTransaction.mockImplementation(async () => { throw dupErr; });

        // Fallback lookup inside catch returns the record that won
        mockInvoiceFindOne.mockReturnValueOnce({
            lean: () => Promise.resolve({
                _id: "invoice-raced",
                contractId: "contract-raced",
                currency: "USD",
                totalAmountMinor: 10000
            })
        });
        mockOrgContractFindById.mockReturnValueOnce({
            lean: () => Promise.resolve({
                _id: "contract-raced",
                contractStatus: "draft"
            })
        });

        const result = await createCheckoutSession({
            organizationId: "org-1",
            planVersionId:  "plan-1",
            billingInterval: "monthly"
        });

        expect(result.invoiceId).toBe("invoice-raced");
        expect(result.contractId).toBe("contract-raced");
        expect(mockEndSession).toHaveBeenCalledTimes(1); // session properly closed
    });

    test("Case 3b: E11000 with no reusable record re-throws", async () => {
        seedHappyPath();
        mockInvoiceFindOne
            .mockReturnValueOnce({ lean: () => Promise.resolve(null) })
            .mockReturnValueOnce({ lean: () => Promise.resolve(null) });

        const dupErr = Object.assign(new Error("E11000"), { code: 11000 });
        mockWithTransaction.mockImplementation(async () => { throw dupErr; });

        await expect(createCheckoutSession({
            organizationId: "org-1",
            planVersionId:  "plan-1",
            billingInterval: "monthly"
        })).rejects.toMatchObject({ code: 11000 });

        expect(mockEndSession).toHaveBeenCalled();
    });
});

// ─── Case 4: Transaction Rollback ───────────────────────────────────────────
describe("createCheckoutSession — transaction rollback", () => {
    test("Case 4: non-E11000 error inside transaction propagates and no invoice is returned", async () => {
        seedHappyPath();
        mockInvoiceFindOne.mockReturnValueOnce({ lean: () => Promise.resolve(null) });

        const bizErr = new Error("contract engine blew up");
        mockWithTransaction.mockImplementation(async () => { throw bizErr; });

        await expect(createCheckoutSession({
            organizationId: "org-1",
            planVersionId:  "plan-1",
            billingInterval: "monthly"
        })).rejects.toThrow("contract engine blew up");

        // Provider session was NEVER called — failure happened before commit
        expect(mockProvider.createNewCheckoutSession).not.toHaveBeenCalled();
        // Session cleaned up
        expect(mockEndSession).toHaveBeenCalledTimes(1);
    });
});
