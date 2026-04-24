/**
 * tests/unit/billing/services/paymentSuccessHandler.unit.test.js
 * Pre-Phase-8 Hardening — dispatcher coverage.
 *
 * Covers:
 *   - Type guard (non-success ignored)
 *   - Global metadata check (orgId + planVersionId + contractId + interval)
 *   - Contract existence (CONTRACT_NOT_FOUND)
 *   - Double-payment idempotency via contract.lastPaymentId
 *   - Provider dispatch (kashier / stripe)
 *   - Invoice reconciliation (incl. "already paid" short-circuit)
 *   - PAYMENT_SUCCESS_PROCESSED unified audit
 */

"use strict";

jest.mock("@billing/services/subscription.service", () => ({
    activateManualSubscription: jest.fn(),
    activateProviderSubscription: jest.fn(),
    getPlanDuration: jest.fn(),
    addDuration: jest.fn()
}));

jest.mock("@billing/models/PlatformInvoice.model", () => ({
    __esModule: true,
    default: {
        findById: jest.fn(),
        findByIdAndUpdate: jest.fn()
    }
}));

jest.mock("@billing/models/OrgContract.model", () => ({
    __esModule: true,
    default: {
        findById: jest.fn()
    }
}));

const subscriptionService = require("@billing/services/subscription.service");
const PlatformInvoice = require("@billing/models/PlatformInvoice.model").default;
const OrgContract = require("@billing/models/OrgContract.model").default;
const { handlePaymentSuccess } = require("@billing/services/paymentSuccessHandler");

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function validEvent(overrides = {}) {
    return {
        provider: "kashier",
        type: "payment_success",
        externalId: "pay_1",
        paymentId: "pay_1",
        orgId: "org_1",
        planVersionId: "plan_v1",
        contractId: "ctr_1",
        invoiceId: "inv_1",
        interval: "monthly",
        amountMinor: 245000,
        currency: "EGP",
        ...overrides
    };
}

function mockContract(overrides = {}) {
    // OrgContract.findById(…).lean() — return a non-duplicate contract.
    OrgContract.findById.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
            _id: "ctr_1",
            lastPaymentId: null,
            ...overrides
        })
    });
}

function mockInvoiceOpen() {
    // markInvoicePaid first calls findById, then findByIdAndUpdate.
    PlatformInvoice.findById.mockResolvedValueOnce({
        _id: "inv_1",
        status: "open"
    });
    PlatformInvoice.findByIdAndUpdate.mockResolvedValueOnce({
        _id: "inv_1",
        status: "paid"
    });
}

beforeEach(() => {
    subscriptionService.activateManualSubscription.mockReset();
    subscriptionService.activateProviderSubscription.mockReset();
    PlatformInvoice.findById.mockReset();
    PlatformInvoice.findByIdAndUpdate.mockReset();
    OrgContract.findById.mockReset();
});

// ─── 1. Type + envelope guards ───────────────────────────────────────────────

describe("handlePaymentSuccess — type + envelope", () => {
    test("throws INVALID_EVENT when event is missing", async () => {
        await expect(handlePaymentSuccess(null))
            .rejects.toMatchObject({ code: "INVALID_EVENT" });
    });

    test("ignores non-success events (no DB work)", async () => {
        const result = await handlePaymentSuccess({
            provider: "kashier",
            type: "payment_failed"
        });
        expect(result).toEqual({ handled: false, reason: "not_a_success_event" });
        expect(OrgContract.findById).not.toHaveBeenCalled();
        expect(subscriptionService.activateManualSubscription).not.toHaveBeenCalled();
    });
});

// ─── 2. Metadata integrity (Section 6) ───────────────────────────────────────

describe("handlePaymentSuccess — metadata integrity", () => {
    test.each([
        ["orgId missing",        { orgId: null }],
        ["planVersionId missing",{ planVersionId: null }],
        ["contractId missing",   { contractId: null }],
        ["interval missing",     { interval: null }]
    ])("rejects with INVALID_EVENT_METADATA when %s", async (_, overrides) => {
        await expect(
            handlePaymentSuccess(validEvent(overrides))
        ).rejects.toMatchObject({ code: "INVALID_EVENT_METADATA" });
        expect(OrgContract.findById).not.toHaveBeenCalled();
        expect(subscriptionService.activateManualSubscription).not.toHaveBeenCalled();
    });
});

// ─── 3. Contract existence ───────────────────────────────────────────────────

describe("handlePaymentSuccess — contract existence", () => {
    test("throws CONTRACT_NOT_FOUND when contract doesn't exist", async () => {
        OrgContract.findById.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue(null)
        });

        await expect(handlePaymentSuccess(validEvent()))
            .rejects.toMatchObject({ code: "CONTRACT_NOT_FOUND" });
        expect(subscriptionService.activateManualSubscription).not.toHaveBeenCalled();
    });
});

// ─── Final-hardening — Section 3: PAYMENT_ID_REQUIRED ───────────────────────

describe("handlePaymentSuccess — PAYMENT_ID_REQUIRED", () => {
    test("throws when both event.paymentId and event.externalId are absent", async () => {
        await expect(
            handlePaymentSuccess(validEvent({ paymentId: undefined, externalId: undefined }))
        ).rejects.toMatchObject({ code: "PAYMENT_ID_REQUIRED", status: 400 });
        // No DB work — runs after metadata check, before contract lookup.
        expect(OrgContract.findById).not.toHaveBeenCalled();
        expect(subscriptionService.activateManualSubscription).not.toHaveBeenCalled();
    });

    test("event.externalId alone satisfies the guard (paymentId derived)", async () => {
        mockContract();
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_x", subscription: {}
        });
        mockInvoiceOpen();

        await expect(
            handlePaymentSuccess(validEvent({
                paymentId: undefined,
                externalId: "ext_only"
            }))
        ).resolves.toMatchObject({ handled: true });
    });
});

// ─── Phase 9 hardening — CONTRACT_ID_MISMATCH double-safety ─────────────────

describe("handlePaymentSuccess — CONTRACT_ID_MISMATCH", () => {
    test("throws when fetched contract._id differs from event.contractId (500)", async () => {
        OrgContract.findById.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: "ctr_DIFFERENT",   // returned doc id != event.contractId
                lastPaymentId: null
            })
        });

        await expect(handlePaymentSuccess(validEvent({ contractId: "ctr_1" })))
            .rejects.toMatchObject({
                code: "CONTRACT_ID_MISMATCH",
                status: 500,
                eventContractId: "ctr_1",
                fetchedContractId: "ctr_DIFFERENT"
            });
        expect(subscriptionService.activateManualSubscription).not.toHaveBeenCalled();
    });
});

// ─── 4. Double-payment idempotency (Section 9) ───────────────────────────────

describe("handlePaymentSuccess — double-payment idempotency", () => {
    test("short-circuits when contract.lastPaymentId === event.paymentId", async () => {
        OrgContract.findById.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({
                _id: "ctr_1",
                lastPaymentId: "pay_already" // already applied
            })
        });

        const result = await handlePaymentSuccess(validEvent({ paymentId: "pay_already" }));

        expect(result).toEqual({
            handled: false,
            reason: "duplicate_payment",
            duplicate: true
        });
        expect(subscriptionService.activateManualSubscription).not.toHaveBeenCalled();
        expect(PlatformInvoice.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("proceeds when lastPaymentId is null or different", async () => {
        mockContract({ lastPaymentId: "different_pay" });
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_1", subscription: {}
        });
        mockInvoiceOpen();

        const result = await handlePaymentSuccess(validEvent({ paymentId: "pay_new" }));
        expect(result.handled).toBe(true);
    });
});

// ─── 5. Provider dispatch ────────────────────────────────────────────────────

describe("handlePaymentSuccess — provider dispatch", () => {
    test("kashier → activateManualSubscription with contractId + paymentId", async () => {
        mockContract();
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_1",
            subscription: { currentPeriodEnd: new Date("2026-12-01") }
        });
        mockInvoiceOpen();

        const result = await handlePaymentSuccess(validEvent({ provider: "kashier" }));

        expect(subscriptionService.activateManualSubscription).toHaveBeenCalledWith({
            orgId: "org_1",
            contractId: "ctr_1",
            planVersionId: "plan_v1",
            interval: "monthly",
            paymentId: "pay_1"
        });
        expect(result.handled).toBe(true);
        expect(result.result.provider).toBe("kashier");
    });

    test("stripe → activateProviderSubscription with contractId + provider:'stripe'", async () => {
        mockContract();
        subscriptionService.activateProviderSubscription.mockResolvedValueOnce({
            _id: "org_s", subscription: {}
        });
        mockInvoiceOpen();

        await handlePaymentSuccess(validEvent({ provider: "stripe", externalId: "cs_1", paymentId: "cs_1" }));

        expect(subscriptionService.activateProviderSubscription).toHaveBeenCalledWith({
            orgId: "org_1",
            contractId: "ctr_1",
            planVersionId: "plan_v1",
            interval: "monthly",
            paymentId: "cs_1",
            provider: "stripe"
        });
    });

    test("unknown provider → UNKNOWN_PROVIDER (after metadata + contract checks pass)", async () => {
        mockContract();
        await expect(
            handlePaymentSuccess(validEvent({ provider: "bitcoin" }))
        ).rejects.toMatchObject({ code: "UNKNOWN_PROVIDER" });
    });
});

// ─── 6. Invoice reconciliation ───────────────────────────────────────────────

describe("handlePaymentSuccess — invoice reconciliation", () => {
    test("marks invoice paid (status + paymentStatus + providerPaymentId)", async () => {
        mockContract();
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_1", subscription: {}
        });
        mockInvoiceOpen();

        await handlePaymentSuccess(validEvent({ paymentId: "pay_new" }));

        expect(PlatformInvoice.findByIdAndUpdate).toHaveBeenCalledWith(
            "inv_1",
            expect.objectContaining({
                status: "paid",
                paymentStatus: "captured",
                providerPaymentId: "pay_new",
                paidAt: expect.any(Date)
            })
        );
    });

    test("invoice already paid → idempotent no-op (no update)", async () => {
        mockContract();
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_1", subscription: {}
        });
        PlatformInvoice.findById.mockResolvedValueOnce({
            _id: "inv_1",
            status: "paid"
        });

        const result = await handlePaymentSuccess(validEvent());

        expect(result.handled).toBe(true);
        expect(PlatformInvoice.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("invoice missing → logged but activation still succeeds", async () => {
        mockContract();
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_1", subscription: {}
        });
        PlatformInvoice.findById.mockResolvedValueOnce(null);

        const result = await handlePaymentSuccess(validEvent());

        expect(result.handled).toBe(true);
        expect(PlatformInvoice.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("missing invoiceId → markInvoicePaid is a no-op", async () => {
        mockContract();
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_1", subscription: {}
        });

        const result = await handlePaymentSuccess(validEvent({ invoiceId: null }));
        expect(result.handled).toBe(true);
        expect(PlatformInvoice.findById).not.toHaveBeenCalled();
        expect(PlatformInvoice.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    test("invoice update error → activation still succeeds (drift logged)", async () => {
        mockContract();
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_1", subscription: {}
        });
        PlatformInvoice.findById.mockResolvedValueOnce({ _id: "inv_1", status: "open" });
        PlatformInvoice.findByIdAndUpdate.mockRejectedValueOnce(new Error("db blew up"));

        const result = await handlePaymentSuccess(validEvent());
        expect(result.handled).toBe(true);
    });
});

// ─── 7. Payment ID resolution ────────────────────────────────────────────────

describe("handlePaymentSuccess — paymentId resolution", () => {
    test("event.paymentId (explicit) is preferred over externalId", async () => {
        mockContract();
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_1", subscription: {}
        });
        mockInvoiceOpen();

        await handlePaymentSuccess(validEvent({
            externalId: "legacy_ext",
            paymentId: "canonical_pay"
        }));

        expect(subscriptionService.activateManualSubscription).toHaveBeenCalledWith(
            expect.objectContaining({ paymentId: "canonical_pay" })
        );
        expect(PlatformInvoice.findByIdAndUpdate).toHaveBeenCalledWith(
            "inv_1",
            expect.objectContaining({ providerPaymentId: "canonical_pay" })
        );
    });

    test("falls back to externalId when paymentId absent", async () => {
        mockContract();
        subscriptionService.activateManualSubscription.mockResolvedValueOnce({
            _id: "org_1", subscription: {}
        });
        mockInvoiceOpen();

        await handlePaymentSuccess(validEvent({
            externalId: "ext_only",
            paymentId: undefined
        }));

        expect(subscriptionService.activateManualSubscription).toHaveBeenCalledWith(
            expect.objectContaining({ paymentId: "ext_only" })
        );
    });
});
