/**
 * tests/unit/billing/services/subscription.service.unit.test.js
 * Phase 2 — activateManualSubscription coverage.
 *
 * Strategy: mock Organization.findById so the test is pure and does not
 * depend on the MongoMemoryReplSet bootstrap.
 */

"use strict";

jest.mock("@shared/models/Organization", () => {
    const makeOrg = (subscription) => {
        const doc = {
            _id: "org_mock_id",
            subscription: subscription || {},
            save: jest.fn().mockImplementation(async function () { return this; })
        };
        return doc;
    };
    const findById = jest.fn();
    return {
        __esModule: true,
        default: { findById },
        _makeOrg: makeOrg
    };
});

jest.mock("@billing/models/OrgContract.model", () => {
    const findById = jest.fn();
    return {
        __esModule: true,
        default: { findById },
        _makeContract: (overrides = {}) => ({
            _id: "ctr_mock",
            contractStatus: "draft",
            activatedAt: null,
            lastPaymentId: null,
            paymentProvider: null,
            save: jest.fn().mockImplementation(async function () { return this; }),
            ...overrides
        })
    };
});

const Organization = require("@shared/models/Organization");
const OrgContract = require("@billing/models/OrgContract.model");
const {
    activateManualSubscription,
    activateProviderSubscription,
    getPlanDuration,
    addDuration
} = require("@billing/services/subscription.service");

beforeEach(() => {
    Organization.default.findById.mockReset();
    OrgContract.default.findById.mockReset();
});

// ─── Duration helpers ────────────────────────────────────────────────────────

describe("getPlanDuration", () => {
    test("monthly → 1 month", () => {
        expect(getPlanDuration("monthly")).toEqual({ months: 1 });
    });
    test("yearly → 12 months", () => {
        expect(getPlanDuration("yearly")).toEqual({ months: 12 });
    });
    test("biennial → 24 months", () => {
        expect(getPlanDuration("biennial")).toEqual({ months: 24 });
    });
    test("unknown/missing → defaults to monthly", () => {
        expect(getPlanDuration(undefined)).toEqual({ months: 1 });
        expect(getPlanDuration("weekly")).toEqual({ months: 1 });
    });
});

describe("addDuration", () => {
    test("adds months in UTC", () => {
        const start = new Date("2026-01-15T00:00:00.000Z");
        const out = addDuration(start, { months: 1 });
        expect(out.toISOString()).toBe("2026-02-15T00:00:00.000Z");
    });
    test("adds 12 months for yearly", () => {
        const start = new Date("2026-01-15T00:00:00.000Z");
        const out = addDuration(start, { months: 12 });
        expect(out.toISOString()).toBe("2027-01-15T00:00:00.000Z");
    });
});

// ─── activateManualSubscription ──────────────────────────────────────────────

describe("activateManualSubscription", () => {
    test("throws ORG_ID_REQUIRED when orgId missing", async () => {
        await expect(
            activateManualSubscription({})
        ).rejects.toMatchObject({ code: "ORG_ID_REQUIRED" });
    });

    test("throws ORG_NOT_FOUND when org does not exist", async () => {
        Organization.default.findById.mockResolvedValueOnce(null);
        await expect(
            activateManualSubscription({ orgId: "missing" })
        ).rejects.toMatchObject({ code: "ORG_NOT_FOUND" });
    });

    test("new org (no prior subscription) → period starts NOW, ends NOW+1 month", async () => {
        const org = Organization._makeOrg({});
        Organization.default.findById.mockResolvedValueOnce(org);

        const before = Date.now();
        await activateManualSubscription({ orgId: "org_x", interval: "monthly" });
        const after = Date.now();

        expect(org.subscription.status).toBe("active");
        expect(org.subscription.paymentProvider).toBe("kashier");
        expect(org.subscription.billingMode).toBe("manual");
        expect(org.subscription.renewalStrategy).toBe("internal");
        expect(org.subscription.currentPeriodStart).toBeInstanceOf(Date);
        expect(org.subscription.currentPeriodEnd).toBeInstanceOf(Date);

        // currentPeriodStart should be ~now
        const startMs = org.subscription.currentPeriodStart.getTime();
        expect(startMs).toBeGreaterThanOrEqual(before);
        expect(startMs).toBeLessThanOrEqual(after);

        // currentPeriodEnd should be 1 month after start
        expect(org.subscription.currentPeriodEnd).toEqual(
            addDuration(org.subscription.currentPeriodStart, { months: 1 })
        );
        expect(org.subscription.nextBillingDate).toEqual(
            org.subscription.currentPeriodEnd
        );
        expect(org.save).toHaveBeenCalled();
    });

    test("expired subscription → period RESETS to now", async () => {
        const pastEnd = new Date("2020-01-01T00:00:00.000Z");
        const org = Organization._makeOrg({
            status: "expired",
            currentPeriodEnd: pastEnd
        });
        Organization.default.findById.mockResolvedValueOnce(org);

        const before = Date.now();
        await activateManualSubscription({ orgId: "org_y", interval: "monthly" });

        // currentPeriodStart should be ~now (NOT the past end)
        expect(org.subscription.currentPeriodStart.getTime())
            .toBeGreaterThanOrEqual(before);
        expect(org.subscription.currentPeriodStart.getTime())
            .toBeGreaterThan(pastEnd.getTime());
    });

    test("early renewal → period STARTS at previous currentPeriodEnd (no time lost)", async () => {
        // Current period ends 10 days from now → early renewal extends from that point.
        const futureEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
        const org = Organization._makeOrg({
            status: "active",
            currentPeriodEnd: futureEnd
        });
        Organization.default.findById.mockResolvedValueOnce(org);

        await activateManualSubscription({ orgId: "org_z", interval: "monthly" });

        // New period starts exactly at the old end.
        expect(org.subscription.currentPeriodStart.getTime())
            .toBe(futureEnd.getTime());
        // New end is old end + 1 month.
        expect(org.subscription.currentPeriodEnd).toEqual(
            addDuration(futureEnd, { months: 1 })
        );
    });

    test("yearly interval → +12 months", async () => {
        const org = Organization._makeOrg({});
        Organization.default.findById.mockResolvedValueOnce(org);

        await activateManualSubscription({ orgId: "org_y", interval: "yearly" });

        const expected = addDuration(org.subscription.currentPeriodStart, { months: 12 });
        expect(org.subscription.currentPeriodEnd).toEqual(expected);
    });

    test("persists paymentId (both lastPaymentId and legacy lastProviderPaymentId)", async () => {
        const org = Organization._makeOrg({});
        Organization.default.findById.mockResolvedValueOnce(org);

        await activateManualSubscription({
            orgId: "org_p",
            interval: "monthly",
            paymentId: "pay_kshr_123"
        });

        expect(org.subscription.lastPaymentId).toBe("pay_kshr_123");
        expect(org.subscription.lastProviderPaymentId).toBe("pay_kshr_123");
    });

    // ─── Phase 2 Hardening — Task 1: new canonical fields ────────────────────
    test("writes Phase-2-Hardening fields: provider, interval, planVersionId", async () => {
        const org = Organization._makeOrg({});
        Organization.default.findById.mockResolvedValueOnce(org);

        await activateManualSubscription({
            orgId: "org_h",
            planVersionId: "plan_v1",
            interval: "yearly",
            paymentId: "pay_1"
        });

        expect(org.subscription.provider).toBe("kashier");
        expect(org.subscription.paymentProvider).toBe("kashier"); // legacy mirror
        expect(org.subscription.interval).toBe("yearly");
        expect(org.subscription.planVersionId).toBe("plan_v1");
    });

    // ─── Phase 2 Hardening — Task 4: state machine ────────────────────────────
    describe("state machine", () => {
        test.each([
            ["active"],    // renewal
            ["expired"],   // reset
            ["trial"],     // first paid activation from trial
            ["past_due"]   // Phase 3: recovery path
        ])("state '%s' is allowed", async (status) => {
            const org = Organization._makeOrg({ status });
            Organization.default.findById.mockResolvedValueOnce(org);

            await expect(
                activateManualSubscription({
                    orgId: "org_s",
                    planVersionId: "plan_v1",
                    interval: "monthly"
                })
            ).resolves.toBeDefined();
        });

        test.each([
            ["suspended"],
            ["canceled"],
            ["provision_failed"]
        ])("state '%s' throws INVALID_SUBSCRIPTION_STATE", async (status) => {
            const org = Organization._makeOrg({ status });
            Organization.default.findById.mockResolvedValueOnce(org);

            await expect(
                activateManualSubscription({
                    orgId: "org_b",
                    planVersionId: "plan_v1",
                    interval: "monthly"
                })
            ).rejects.toMatchObject({
                code: "INVALID_SUBSCRIPTION_STATE",
                status
            });
        });

        test("missing subscription subdoc treated as new (allowed)", async () => {
            const org = Organization._makeOrg(null);
            org.subscription = undefined;
            Organization.default.findById.mockResolvedValueOnce(org);

            await expect(
                activateManualSubscription({
                    orgId: "org_new",
                    planVersionId: "plan_v1",
                    interval: "monthly"
                })
            ).resolves.toBeDefined();
            expect(org.subscription.status).toBe("active");
        });
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 6 — activateProviderSubscription (Stripe & friends)
// ═════════════════════════════════════════════════════════════════════════════

describe("activateProviderSubscription", () => {
    test("throws PROVIDER_REQUIRED when provider is missing", async () => {
        await expect(
            activateProviderSubscription({ orgId: "org_p", interval: "monthly" })
        ).rejects.toMatchObject({ code: "PROVIDER_REQUIRED" });
    });

    test("writes billingMode=auto and renewalStrategy=provider", async () => {
        const org = Organization._makeOrg({});
        Organization.default.findById.mockResolvedValueOnce(org);

        await activateProviderSubscription({
            orgId: "org_stripe",
            planVersionId: "plan_v1",
            interval: "monthly",
            paymentId: "cs_1",
            provider: "stripe"
        });

        expect(org.subscription.status).toBe("active");
        expect(org.subscription.billingMode).toBe("auto");
        expect(org.subscription.renewalStrategy).toBe("provider");
        expect(org.subscription.provider).toBe("stripe");
        expect(org.subscription.paymentProvider).toBe("stripe"); // legacy mirror
        expect(org.subscription.lastPaymentId).toBe("cs_1");
    });

    test("shares period math with activateManualSubscription (early renewal)", async () => {
        const futureEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
        const org = Organization._makeOrg({
            status: "active",
            currentPeriodEnd: futureEnd
        });
        Organization.default.findById.mockResolvedValueOnce(org);

        await activateProviderSubscription({
            orgId: "org_e",
            planVersionId: "plan_v1",
            interval: "monthly",
            provider: "stripe"
        });

        // Early renewal: period extends from old end, no time lost.
        expect(org.subscription.currentPeriodStart.getTime()).toBe(futureEnd.getTime());
        expect(org.subscription.currentPeriodEnd).toEqual(
            addDuration(futureEnd, { months: 1 })
        );
    });

    test.each([
        ["active"], ["expired"], ["trial"], ["past_due"]
    ])("allows state '%s'", async (status) => {
        const org = Organization._makeOrg({ status });
        Organization.default.findById.mockResolvedValueOnce(org);
        await expect(
            activateProviderSubscription({
                orgId: "x",
                planVersionId: "p",
                interval: "monthly",
                provider: "stripe"
            })
        ).resolves.toBeDefined();
    });

    test("rejects suspended / canceled / provision_failed", async () => {
        for (const status of ["suspended", "canceled", "provision_failed"]) {
            const org = Organization._makeOrg({ status });
            Organization.default.findById.mockResolvedValueOnce(org);
            await expect(
                activateProviderSubscription({
                    orgId: "x",
                    planVersionId: "p",
                    interval: "monthly",
                    provider: "stripe"
                })
            ).rejects.toMatchObject({ code: "INVALID_SUBSCRIPTION_STATE", status });
        }
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// Pre-Phase-8 Hardening — contract activation inside _doActivate
// ═════════════════════════════════════════════════════════════════════════════

describe("_doActivate — contract activation alignment", () => {
    test("contractId provided → contract.contractStatus set to 'active', activatedAt set, lastPaymentId recorded, paymentProvider mirrored", async () => {
        const org = Organization._makeOrg({});
        const contract = OrgContract._makeContract({ contractStatus: "draft" });
        Organization.default.findById.mockResolvedValueOnce(org);
        OrgContract.default.findById.mockResolvedValueOnce(contract);

        await activateManualSubscription({
            orgId: "org_c",
            contractId: "ctr_c",
            planVersionId: "plan_v1",
            interval: "monthly",
            paymentId: "pay_kshr_c"
        });

        expect(contract.contractStatus).toBe("active");
        expect(contract.activatedAt).toBeInstanceOf(Date);
        expect(contract.lastPaymentId).toBe("pay_kshr_c");
        expect(contract.paymentProvider).toBe("kashier");
        expect(contract.save).toHaveBeenCalled();
    });

    test("Stripe path also activates contract (paymentProvider=stripe)", async () => {
        const org = Organization._makeOrg({});
        const contract = OrgContract._makeContract({ contractStatus: "draft" });
        Organization.default.findById.mockResolvedValueOnce(org);
        OrgContract.default.findById.mockResolvedValueOnce(contract);

        await activateProviderSubscription({
            orgId: "org_s",
            contractId: "ctr_s",
            planVersionId: "plan_v1",
            interval: "yearly",
            paymentId: "cs_s",
            provider: "stripe"
        });

        expect(contract.contractStatus).toBe("active");
        expect(contract.paymentProvider).toBe("stripe");
        expect(contract.lastPaymentId).toBe("cs_s");
    });

    test("already-active contract → activatedAt not overwritten (audit preserved)", async () => {
        const org = Organization._makeOrg({});
        const existingActivatedAt = new Date("2026-01-01T00:00:00Z");
        const contract = OrgContract._makeContract({
            contractStatus: "active",
            activatedAt: existingActivatedAt
        });
        Organization.default.findById.mockResolvedValueOnce(org);
        OrgContract.default.findById.mockResolvedValueOnce(contract);

        await activateManualSubscription({
            orgId: "org_r",
            contractId: "ctr_r",
            planVersionId: "plan_v1",
            interval: "monthly",
            paymentId: "pay_2"
        });

        expect(contract.contractStatus).toBe("active");
        expect(contract.activatedAt).toEqual(existingActivatedAt); // preserved
        expect(contract.lastPaymentId).toBe("pay_2"); // still updated
    });

    test("no contractId → _doActivate skips OrgContract lookup entirely", async () => {
        const org = Organization._makeOrg({});
        Organization.default.findById.mockResolvedValueOnce(org);

        await activateManualSubscription({
            orgId: "org_n",
            // no contractId
            planVersionId: "plan_v1",
            interval: "monthly",
            paymentId: "pay_n"
        });

        expect(OrgContract.default.findById).not.toHaveBeenCalled();
    });

    test("contract not found → subscription still activates (logged, not thrown)", async () => {
        const org = Organization._makeOrg({});
        Organization.default.findById.mockResolvedValueOnce(org);
        OrgContract.default.findById.mockResolvedValueOnce(null);

        await expect(
            activateManualSubscription({
                orgId: "org_m",
                contractId: "ctr_missing",
                planVersionId: "plan_v1",
                interval: "monthly",
                paymentId: "pay_m"
            })
        ).resolves.toBeDefined();

        // Subscription was still activated.
        expect(org.subscription.status).toBe("active");
    });

    test("contract.save() error → subscription activation stands", async () => {
        const org = Organization._makeOrg({});
        const contract = OrgContract._makeContract({ contractStatus: "draft" });
        contract.save.mockRejectedValueOnce(new Error("db conflict"));
        Organization.default.findById.mockResolvedValueOnce(org);
        OrgContract.default.findById.mockResolvedValueOnce(contract);

        await expect(
            activateManualSubscription({
                orgId: "org_e",
                contractId: "ctr_e",
                planVersionId: "plan_v1",
                interval: "monthly",
                paymentId: "pay_e"
            })
        ).resolves.toBeDefined();

        expect(org.subscription.status).toBe("active");
    });
});
