/**
 * tests/unit/billing/jobs/subscriptionLifecycle.job.unit.test.js
 * Phase 3 — lifecycle engine coverage.
 *
 * Strategy: mock Organization.find so the test stays pure (no DB bootstrap).
 * Each mocked org has a `.save` jest.fn() so we can assert both the state
 * transition and the persistence call.
 */

"use strict";

jest.mock("@shared/models/Organization", () => {
    const findMock = jest.fn();
    return {
        __esModule: true,
        default: { find: findMock },
        _makeOrg: (id, subscription) => ({
            _id: id,
            subscription,
            save: jest.fn().mockImplementation(async function () { return this; })
        })
    };
});

const Organization = require("@shared/models/Organization");
const {
    runSubscriptionLifecycle,
    expireManualSubscription,
    markPastDue
} = require("@billing/jobs/subscriptionLifecycle.job");

beforeEach(() => {
    Organization.default.find.mockReset();
});

// ─── Transition helpers ──────────────────────────────────────────────────────

describe("expireManualSubscription", () => {
    test("sets status to 'expired' and persists", async () => {
        const org = Organization._makeOrg("org_1", {
            status: "active",
            renewalStrategy: "internal",
            currentPeriodEnd: new Date("2020-01-01"),
            provider: "kashier"
        });
        await expireManualSubscription(org);
        expect(org.subscription.status).toBe("expired");
        expect(org.save).toHaveBeenCalledTimes(1);
    });
});

describe("markPastDue", () => {
    test("sets status to 'past_due' and persists", async () => {
        const org = Organization._makeOrg("org_2", {
            status: "active",
            renewalStrategy: "provider",
            currentPeriodEnd: new Date("2020-01-01"),
            provider: "stripe"
        });
        await markPastDue(org);
        expect(org.subscription.status).toBe("past_due");
        expect(org.save).toHaveBeenCalledTimes(1);
    });
});

// ─── runSubscriptionLifecycle ────────────────────────────────────────────────

describe("runSubscriptionLifecycle", () => {
    test("expires internal-renewal orgs, flags provider-renewal orgs past_due", async () => {
        const kashierOrg = Organization._makeOrg("o_kshr", {
            status: "active",
            renewalStrategy: "internal",
            currentPeriodEnd: new Date("2020-01-01"),
            provider: "kashier"
        });
        const stripeOrg = Organization._makeOrg("o_stripe", {
            status: "active",
            renewalStrategy: "provider",
            currentPeriodEnd: new Date("2020-01-01"),
            provider: "stripe"
        });

        Organization.default.find.mockResolvedValueOnce([kashierOrg, stripeOrg]);

        const summary = await runSubscriptionLifecycle({ now: new Date("2026-04-21") });

        expect(summary).toEqual({
            scanned: 2,
            expired: 1,
            pastDue: 1,
            errors: 0
        });
        expect(kashierOrg.subscription.status).toBe("expired");
        expect(stripeOrg.subscription.status).toBe("past_due");
    });

    test("no-op when no active subscriptions are expired", async () => {
        Organization.default.find.mockResolvedValueOnce([]);
        const summary = await runSubscriptionLifecycle();
        expect(summary).toEqual({ scanned: 0, expired: 0, pastDue: 0, errors: 0 });
    });

    test("issues correct Mongo query (status=active, currentPeriodEnd<=now)", async () => {
        const now = new Date("2026-06-01T00:00:00Z");
        Organization.default.find.mockResolvedValueOnce([]);
        await runSubscriptionLifecycle({ now });
        expect(Organization.default.find).toHaveBeenCalledWith({
            "subscription.status": "active",
            "subscription.currentPeriodEnd": { $lte: now }
        });
    });

    test("per-org errors are isolated — one failure does not abort the batch", async () => {
        const orgOk = Organization._makeOrg("o_ok", {
            status: "active",
            renewalStrategy: "internal",
            currentPeriodEnd: new Date("2020-01-01"),
            provider: "kashier"
        });
        const orgFail = Organization._makeOrg("o_fail", {
            status: "active",
            renewalStrategy: "provider",
            currentPeriodEnd: new Date("2020-01-01"),
            provider: "stripe"
        });
        orgFail.save.mockRejectedValueOnce(new Error("db blew up"));

        Organization.default.find.mockResolvedValueOnce([orgFail, orgOk]);

        const summary = await runSubscriptionLifecycle();

        expect(summary.scanned).toBe(2);
        expect(summary.errors).toBe(1);
        // The good org still transitioned despite the earlier failure.
        expect(orgOk.subscription.status).toBe("expired");
        expect(summary.expired).toBe(1);
    });

    test("is idempotent against already-transitioned orgs (query scope)", async () => {
        // A previously-expired org would not match the find filter
        // (status: "active"), so the function never touches it.
        Organization.default.find.mockResolvedValueOnce([]);
        const summary = await runSubscriptionLifecycle();
        expect(summary.expired).toBe(0);
        expect(summary.pastDue).toBe(0);
    });
});
