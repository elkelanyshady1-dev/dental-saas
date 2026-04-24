/**
 * tests/unit/billing/controllers/kashier.webhook.controller.unit.test.js
 * Phase 2 Hardening — Task 9 coverage.
 *
 * Verifies every refusal path in the hardened webhook pipeline:
 *   - rawBody missing → 400 RAW_BODY_REQUIRED
 *   - bad signature → 401
 *   - non-success event → 200 with reason
 *   - missing metadata → 400 INVALID_EVENT_METADATA
 *   - duplicate → 200 duplicate:true
 *   - contract not found → 404
 *   - amount / currency mismatch → 409
 *   - happy path → 200 handled:true
 */

"use strict";

// ─── Mock the provider, models, validators, dispatcher ──────────────────────

jest.mock("@billing/providers/paymentProviderFactory", () => ({
    getProvider: jest.fn()
}));

jest.mock("@billing/services/paymentSuccessHandler", () => ({
    handlePaymentSuccess: jest.fn()
}));

jest.mock("@billing/services/billingValidation.service", () => ({
    assertPaymentMatchesContract: jest.fn()
}));

jest.mock("@billing/models/OrgContract.model", () => ({
    __esModule: true,
    default: { findById: jest.fn() }
}));

jest.mock("@shared/models/KashierEvent", () => ({
    __esModule: true,
    default: {
        findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
        create: jest.fn().mockResolvedValue({})
    }
}));

const { getProvider } = require("@billing/providers/paymentProviderFactory");
const { handlePaymentSuccess } = require("@billing/services/paymentSuccessHandler");
const { assertPaymentMatchesContract } = require("@billing/services/billingValidation.service");
const OrgContract = require("@billing/models/OrgContract.model").default;
const KashierEvent = require("@shared/models/KashierEvent").default;
const { handleKashierWebhook } = require("@billing/controllers/kashier.webhook.controller");

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
}

function makeProvider(overrides = {}) {
    return {
        verifyWebhook: overrides.verifyWebhook || jest.fn().mockResolvedValue(true),
        parseEvent: overrides.parseEvent || jest.fn().mockResolvedValue({
            provider: "kashier",
            type: "payment_success",
            externalId: "evt_1",
            amountMinor: 245000,
            currency: "EGP",
            orgId: "org_1",
            planVersionId: "plan_v1",
            contractId: "ctr_1",
            invoiceId: null,
            interval: "monthly",
            metadata: {},
            raw: {}
        })
    };
}

beforeEach(() => {
    getProvider.mockReset();
    handlePaymentSuccess.mockReset();
    assertPaymentMatchesContract.mockReset();
    OrgContract.findById.mockReset();
    KashierEvent.findOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    KashierEvent.create.mockResolvedValue({});
});

// ─── 1. Raw body missing ────────────────────────────────────────────────────

describe("handleKashierWebhook — rawBody guard", () => {
    test("returns 400 RAW_BODY_REQUIRED when req.rawBody is absent", async () => {
        const req = { headers: {}, body: {} };
        const res = makeRes();
        await handleKashierWebhook(req, res);
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "RAW_BODY_REQUIRED" }));
        expect(getProvider).not.toHaveBeenCalled();
    });
});

// ─── 2. Signature paths ─────────────────────────────────────────────────────

describe("handleKashierWebhook — signature", () => {
    test("returns 401 when verifyWebhook returns false", async () => {
        getProvider.mockReturnValue(makeProvider({
            verifyWebhook: jest.fn().mockResolvedValue(false)
        }));
        const res = makeRes();
        await handleKashierWebhook(
            { headers: { "x-kashier-signature": "x" }, body: {}, rawBody: Buffer.from("{}") },
            res
        );
        expect(res.status).toHaveBeenCalledWith(401);
    });
});

// ─── 3. Non-success events ──────────────────────────────────────────────────

describe("handleKashierWebhook — non-success events", () => {
    test("200 with reason 'not_a_success_event' and no handler call", async () => {
        getProvider.mockReturnValue(makeProvider({
            parseEvent: jest.fn().mockResolvedValue({
                type: "payment_failed",
                externalId: "evt_fail",
                orgId: "o",
                planVersionId: "p"
            })
        }));
        const res = makeRes();
        await handleKashierWebhook(
            { headers: { "x-kashier-signature": "x" }, body: {}, rawBody: Buffer.from("{}") },
            res
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            handled: false,
            reason: "not_a_success_event"
        }));
        expect(handlePaymentSuccess).not.toHaveBeenCalled();
    });
});

// ─── 4. Metadata guard ──────────────────────────────────────────────────────

describe("handleKashierWebhook — metadata guard", () => {
    test.each([
        [{ externalId: "e", type: "payment_success", planVersionId: "p", contractId: "c", interval: "monthly" }, "orgId missing"],
        [{ externalId: "e", type: "payment_success", orgId: "o", contractId: "c", interval: "monthly" }, "planVersionId missing"],
        [{ externalId: "e", type: "payment_success", orgId: "o", planVersionId: "p", interval: "monthly" }, "contractId missing"],
        [{ externalId: "e", type: "payment_success", orgId: "o", planVersionId: "p", contractId: "c" }, "interval missing"]
    ])("400 INVALID_EVENT_METADATA when %j (%s)", async (event) => {
        getProvider.mockReturnValue(makeProvider({
            parseEvent: jest.fn().mockResolvedValue({
                ...event,
                provider: "kashier",
                amountMinor: 100,
                currency: "EGP"
            })
        }));
        const res = makeRes();
        await handleKashierWebhook(
            { headers: { "x-kashier-signature": "x" }, body: {}, rawBody: Buffer.from("{}") },
            res
        );
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: "INVALID_EVENT_METADATA"
        }));
        expect(handlePaymentSuccess).not.toHaveBeenCalled();
        // Phase 3: webhook should not reach OrgContract when metadata is incomplete.
        expect(OrgContract.findById).not.toHaveBeenCalled();
    });
});

// ─── 5. Duplicate webhook ───────────────────────────────────────────────────

describe("handleKashierWebhook — duplicate", () => {
    test("returns 200 duplicate:true when KashierEvent already exists", async () => {
        KashierEvent.findOne.mockReturnValueOnce({
            lean: jest.fn().mockResolvedValue({ eventId: "evt_1" })
        });
        getProvider.mockReturnValue(makeProvider());
        const res = makeRes();
        await handleKashierWebhook(
            { headers: { "x-kashier-signature": "x" }, body: {}, rawBody: Buffer.from("{}") },
            res
        );
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
        expect(handlePaymentSuccess).not.toHaveBeenCalled();
        expect(OrgContract.findById).not.toHaveBeenCalled();
    });
});

// ─── 6. Contract existence ──────────────────────────────────────────────────

describe("handleKashierWebhook — contract lookup", () => {
    test("returns 404 CONTRACT_NOT_FOUND when OrgContract missing", async () => {
        getProvider.mockReturnValue(makeProvider());
        OrgContract.findById.mockResolvedValueOnce(null);
        const res = makeRes();
        await handleKashierWebhook(
            { headers: { "x-kashier-signature": "x" }, body: {}, rawBody: Buffer.from("{}") },
            res
        );
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: "CONTRACT_NOT_FOUND"
        }));
        expect(handlePaymentSuccess).not.toHaveBeenCalled();
    });
});

// ─── 7. Amount / currency mismatch ──────────────────────────────────────────

describe("handleKashierWebhook — payment/contract mismatch", () => {
    test("returns 409 AMOUNT_MISMATCH when validator throws", async () => {
        getProvider.mockReturnValue(makeProvider());
        OrgContract.findById.mockResolvedValueOnce({
            _id: "ctr_1", amountMinor: 4900, currency: "USD"
        });
        assertPaymentMatchesContract.mockImplementation(() => {
            throw Object.assign(new Error("AMOUNT_MISMATCH: payment=245000, contract=4900"), {
                code: "AMOUNT_MISMATCH",
                expected: 4900,
                actual: 245000
            });
        });
        const res = makeRes();
        await handleKashierWebhook(
            { headers: { "x-kashier-signature": "x" }, body: {}, rawBody: Buffer.from("{}") },
            res
        );
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: "AMOUNT_MISMATCH"
        }));
        expect(handlePaymentSuccess).not.toHaveBeenCalled();
    });

    test("returns 409 CURRENCY_MISMATCH when currencies differ", async () => {
        getProvider.mockReturnValue(makeProvider());
        OrgContract.findById.mockResolvedValueOnce({
            _id: "ctr_1", amountMinor: 245000, currency: "USD"
        });
        assertPaymentMatchesContract.mockImplementation(() => {
            throw Object.assign(new Error("CURRENCY_MISMATCH"), {
                code: "CURRENCY_MISMATCH"
            });
        });
        const res = makeRes();
        await handleKashierWebhook(
            { headers: { "x-kashier-signature": "x" }, body: {}, rawBody: Buffer.from("{}") },
            res
        );
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            error: "CURRENCY_MISMATCH"
        }));
    });
});

// ─── 8. Happy path ──────────────────────────────────────────────────────────

describe("handleKashierWebhook — happy path", () => {
    test("returns 200 handled:true and calls handlePaymentSuccess once", async () => {
        getProvider.mockReturnValue(makeProvider());
        OrgContract.findById.mockResolvedValueOnce({
            _id: "ctr_1", amountMinor: 245000, currency: "EGP"
        });
        assertPaymentMatchesContract.mockReturnValueOnce(undefined); // passes
        handlePaymentSuccess.mockResolvedValueOnce({
            handled: true, result: { orgId: "org_1", provider: "kashier" }
        });

        const res = makeRes();
        await handleKashierWebhook(
            { headers: { "x-kashier-signature": "x" }, body: {}, rawBody: Buffer.from("{}") },
            res
        );

        expect(handlePaymentSuccess).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            received: true,
            handled: true
        }));
    });
});
