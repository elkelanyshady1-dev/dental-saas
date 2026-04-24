/**
 * storageUsage.quotaEvent.unit.test.js
 * v6 — Storage Add-on System (Task B6)
 *
 * Case 12 — Emits QUOTA_EXCEEDED_POST_UPLOAD via eventBus after increment()
 *           when post-upload used > totalQuotaMB.
 * Also verifies the event is NOT emitted for under-quota or unlimited cases.
 */

"use strict";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFindOneAndUpdate = jest.fn().mockResolvedValue({});
const mockUpdateOne        = jest.fn().mockResolvedValue({});
const mockFindOne          = jest.fn().mockResolvedValue(null);

jest.mock("@core/db/dbManager", () => ({
    getConnection: jest.fn(async () => ({ __mock: "conn" }))
}));

jest.mock("@core/db/getModel", () => jest.fn(() => ({
    findOneAndUpdate: mockFindOneAndUpdate,
    updateOne:        mockUpdateOne,
    findOne:          mockFindOne
})));

jest.mock("@core/storage/models/organizationStorageUsage.model", () => ({
    modelName: "OrganizationStorageUsage", schema: {}, default: {}
}), { virtual: true });

jest.mock("@core/usage/orgUsage.service", () => ({
    updateStorage: jest.fn().mockResolvedValue(undefined)
}));

// storageQuota is called post-increment via alias require in the SUT.
const mockGetQuotaStatus = jest.fn();
jest.mock("@modules/storage/services/storageQuota.service", () => ({
    getQuotaStatus: (...args) => mockGetQuotaStatus(...args)
}));

// storageAlertDispatcher is lazy-required inside the SUT.
jest.mock("@modules/storage/services/storageAlertDispatcher.service", () => ({
    maybeDispatchStorageAlert: jest.fn().mockResolvedValue(undefined)
}));

// Spy on eventBus.emit
const mockEmit = jest.fn();
jest.mock("@core/eventBus", () => ({ emit: (...args) => mockEmit(...args) }));

const Events = require("@core/domainEvents");
const storageUsage = require("@core/storage/storageUsage.service");

beforeEach(() => {
    mockEmit.mockReset();
    mockGetQuotaStatus.mockReset();
    mockFindOneAndUpdate.mockClear();
});

describe("storageUsage.increment — QUOTA_EXCEEDED_POST_UPLOAD", () => {
    test("Case 12: emits event when post-upload usedMB exceeds totalQuotaMB", async () => {
        mockGetQuotaStatus.mockResolvedValueOnce({
            isUnlimited:  false,
            usedMB:       1100,
            totalQuotaMB: 1000,
            remainingMB:  0,
            percentUsed:  110
        });

        await storageUsage.increment({
            organizationId: "org-abc",
            sizeBytes: 5 * 1024 * 1024,
            type: "photos"
        });

        const exceededCalls = mockEmit.mock.calls.filter(
            ([type]) => type === Events.QUOTA_EXCEEDED_POST_UPLOAD
        );
        expect(exceededCalls).toHaveLength(1);

        const [, payload, emitter] = exceededCalls[0];
        expect(emitter).toBe("storageUsage.service");
        expect(payload).toMatchObject({
            organizationId: "org-abc",
            usedMB:        1100,
            totalQuotaMB:  1000
        });
    });

    test("does NOT emit when still under quota", async () => {
        mockGetQuotaStatus.mockResolvedValueOnce({
            isUnlimited:  false,
            usedMB:       500,
            totalQuotaMB: 1000,
            remainingMB:  500,
            percentUsed:  50
        });

        await storageUsage.increment({
            organizationId: "org-xyz",
            sizeBytes: 1 * 1024 * 1024,
            type: "photos"
        });

        const exceededCalls = mockEmit.mock.calls.filter(
            ([type]) => type === Events.QUOTA_EXCEEDED_POST_UPLOAD
        );
        expect(exceededCalls).toHaveLength(0);
    });

    test("does NOT emit for unlimited plans", async () => {
        mockGetQuotaStatus.mockResolvedValueOnce({
            isUnlimited:  true,
            usedMB:       999999,
            totalQuotaMB: -1,
            remainingMB:  null,
            percentUsed:  0
        });

        await storageUsage.increment({
            organizationId: "org-unl",
            sizeBytes: 1024,
            type: "photos"
        });

        const exceededCalls = mockEmit.mock.calls.filter(
            ([type]) => type === Events.QUOTA_EXCEEDED_POST_UPLOAD
        );
        expect(exceededCalls).toHaveLength(0);
    });
});
