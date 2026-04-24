/**
 * portalAuth.security.test.js
 *
 * C0 hardening regression tests for the patient-portal auth service.
 *
 * These are contract-level unit tests — they don't spin up a real DB.
 * We stub the per-org connection + model bindings and assert:
 *
 *   1. Every public method refuses to run without req.organizationId
 *      (prevents accidental global lookups on the shared connection).
 *
 *   2. verifyMagicLink rejects invites whose organizationId does not match
 *      the request context, even if the token hash matches — defense in
 *      depth for cross-tenant replay attacks.
 *
 *   3. logout bumps tokenVersion on the exact (organizationId, patientId)
 *      pair so other tabs / leaked tokens are invalidated.
 */

"use strict";

jest.mock("@core/db/getModel");
jest.mock("@core/db/dbManager");
jest.mock("../../src/infrastructure/communication/communication.dispatcher", () => ({
    dispatch: jest.fn().mockResolvedValue({ ok: true }),
}));

const getModel = require("@core/db/getModel");
const dbManager = require("@core/db/dbManager");
const portalAuth = require("../../src/modules/patientPortal/services/portalAuth.service");

function buildModelsStub() {
    const PatientUser = {
        findOne: jest.fn(),
        updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    };
    const PortalInvite = {
        findOne: jest.fn(),
        create: jest.fn().mockResolvedValue({}),
    };
    return { PatientUser, PortalInvite };
}

function stubConn(models) {
    const fakeConn = {};
    dbManager.getConnection.mockReturnValue(fakeConn);
    getModel.mockImplementation((conn, Def) => {
        // Route calls based on the def's modelName.
        if (Def && Def.modelName === "PortalInvite") return models.PortalInvite;
        if (Def && Def.modelName === "PatientUser") return models.PatientUser;
        return { findOne: jest.fn() };
    });
}

describe("portalAuth.service — organization-scoping guard", () => {
    beforeEach(() => jest.clearAllMocks());

    const cases = [
        { name: "loginWithPassword", call: () => portalAuth.loginWithPassword({ req: {}, email: "a@b.com", password: "x" }) },
        { name: "requestMagicLink",  call: () => portalAuth.requestMagicLink({ req: {}, email: "a@b.com" }) },
        { name: "verifyMagicLink",   call: () => portalAuth.verifyMagicLink({ req: {}, token: "abc" }) },
        { name: "requestOtp",        call: () => portalAuth.requestOtp({ req: {}, email: "a@b.com" }) },
        { name: "verifyOtp",         call: () => portalAuth.verifyOtp({ req: {}, email: "a@b.com", otp: "123456" }) },
        { name: "logout",            call: () => portalAuth.logout({ req: {}, patientId: "p1" }) },
    ];

    for (const { name, call } of cases) {
        test(`${name} rejects a request with no organizationId`, async () => {
            await expect(call()).rejects.toThrow(/organization context/i);
        });
    }
});

describe("portalAuth.service.verifyMagicLink — cross-org defense in depth", () => {
    beforeEach(() => jest.clearAllMocks());

    test("rejects when the invite belongs to a different organizationId", async () => {
        const models = buildModelsStub();
        stubConn(models);

        // Scenario: the DB query somehow returns an invite from org B
        // (e.g. an index leak or a future bug). The org-match assertion
        // must still block the JWT mint.
        models.PortalInvite.findOne.mockResolvedValue({
            organizationId: "org-B",
            patientId: "p1",
            usedAt: null,
            save: jest.fn(),
        });

        await expect(
            portalAuth.verifyMagicLink({
                req: { organizationId: "org-A" },
                token: "abc",
            }),
        ).rejects.toThrow(/invalid or expired/i);
    });

    test("rejects when the invite isn't found (normal invalid token)", async () => {
        const models = buildModelsStub();
        stubConn(models);
        models.PortalInvite.findOne.mockResolvedValue(null);

        await expect(
            portalAuth.verifyMagicLink({
                req: { organizationId: "org-A" },
                token: "abc",
            }),
        ).rejects.toThrow(/invalid or expired/i);
    });
});

describe("portalAuth.service.logout — token revocation", () => {
    beforeEach(() => jest.clearAllMocks());

    test("bumps tokenVersion filtered to (organizationId, patientId)", async () => {
        const models = buildModelsStub();
        stubConn(models);

        await portalAuth.logout({
            req: { organizationId: "org-A" },
            patientId: "p1",
        });

        expect(models.PatientUser.updateOne).toHaveBeenCalledTimes(1);
        const [filter, update] = models.PatientUser.updateOne.mock.calls[0];
        expect(filter).toEqual({ organizationId: "org-A", patientId: "p1" });
        expect(update).toEqual({ $inc: { tokenVersion: 1 } });
    });
});
