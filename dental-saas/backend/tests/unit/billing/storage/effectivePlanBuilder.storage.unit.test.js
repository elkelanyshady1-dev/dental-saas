/**
 * effectivePlanBuilder.storage.unit.test.js
 * v6 — Storage Add-on System (Task B2)
 *
 * Covers the STORAGE add-on aggregation path in buildEffectivePlan:
 *   Case 8 — Base plan only (no STORAGE add-ons)
 *   Case 9 — Base plan + 1 STORAGE add-on → total = base + addon
 *   Case 10 — Base plan + multiple STORAGE add-ons → summed
 *   Case 10b — Unlimited base (-1) stays unlimited even with STORAGE add-on
 */

"use strict";

// Mock the DB + resolver layer BEFORE requiring the SUT
const mockActiveAddOns = [];

jest.mock("@core/db/dbResolver", () => ({
    getPlatformConnection: jest.fn(() => ({ __mock: "platformConn" }))
}));

jest.mock("@core/db/getModel", () => jest.fn(() => ({
    find: jest.fn(() => ({
        populate: jest.fn(() => Promise.resolve(mockActiveAddOns))
    }))
})));

jest.mock(
    "../../../../src/organization/billing/models/orgAddOn.model",
    () => ({ modelName: "OrgAddOn", schema: {}, default: {} }),
    { virtual: true }
);

jest.mock("../../../../src/core/subscription/planResolver", () => ({
    resolvePlan: jest.fn()
}));

const { resolvePlan } = require("../../../../src/core/subscription/planResolver");
const { buildEffectivePlan } = require("@core/subscription/effectivePlanBuilder");

function makePlan({ storageMB = 1000, modules = {}, limits = {} } = {}) {
    return {
        name: "test-plan",
        quotas: { storageMB },
        limits: { maxUsers: 5, ...limits },
        modules: { communication: { smsQuota: 100 }, ...modules }
    };
}

function storageAddOn(quotaMB, code = "STORAGE_10GB") {
    return {
        addOnId: {
            _id: code,
            code,
            type: "STORAGE",
            isActive: true,
            benefits: {},
            storageConfig: { quotaMB, overageAllowed: false, overagePricePerGB: 0 }
        }
    };
}

beforeEach(() => {
    mockActiveAddOns.length = 0;
    resolvePlan.mockReset();
});

describe("buildEffectivePlan — STORAGE aggregation", () => {
    test("Case 8: base plan only returns base quota", async () => {
        resolvePlan.mockResolvedValueOnce(makePlan({ storageMB: 1000 }));
        const plan = await buildEffectivePlan("org-1");
        expect(plan.quotas.storageMB).toBe(1000);
        expect(plan.activeAddOnCodes).toEqual([]);
    });

    test("Case 9: single STORAGE add-on increases quota", async () => {
        resolvePlan.mockResolvedValueOnce(makePlan({ storageMB: 1000 }));
        mockActiveAddOns.push(storageAddOn(10240, "STORAGE_10GB"));

        const plan = await buildEffectivePlan("org-1");
        expect(plan.quotas.storageMB).toBe(1000 + 10240);
        expect(plan.activeAddOnCodes).toContain("STORAGE_10GB");
    });

    test("Case 10: multiple STORAGE add-ons are summed", async () => {
        resolvePlan.mockResolvedValueOnce(makePlan({ storageMB: 500 }));
        mockActiveAddOns.push(
            storageAddOn(10240, "STORAGE_10GB"),
            storageAddOn(51200, "STORAGE_50GB"),
            storageAddOn(1024, "STORAGE_1GB")
        );

        const plan = await buildEffectivePlan("org-1");
        expect(plan.quotas.storageMB).toBe(500 + 10240 + 51200 + 1024);
        expect(plan.activeAddOnCodes).toHaveLength(3);
    });

    test("Case 10b: unlimited base (-1) remains unlimited with STORAGE add-on", async () => {
        resolvePlan.mockResolvedValueOnce(makePlan({ storageMB: -1 }));
        mockActiveAddOns.push(storageAddOn(10240));
        const plan = await buildEffectivePlan("org-1");
        expect(plan.quotas.storageMB).toBe(-1);
    });

    test("STORAGE add-ons with 0 quotaMB are no-ops", async () => {
        resolvePlan.mockResolvedValueOnce(makePlan({ storageMB: 1000 }));
        mockActiveAddOns.push(storageAddOn(0));
        const plan = await buildEffectivePlan("org-1");
        expect(plan.quotas.storageMB).toBe(1000);
    });
});
