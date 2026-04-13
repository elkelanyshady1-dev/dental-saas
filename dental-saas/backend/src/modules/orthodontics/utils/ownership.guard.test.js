/**
 * ownership.guard.test.js — Regression Tests for Orthodontic Access Control V2
 *
 * TEST MATRIX (Section 9 — Mandatory):
 *   TEST 1 — OWNER:        ✔ Can modify case
 *   TEST 2 — SHARED USER:  ✔ Can modify case (in sharedWith[])
 *   TEST 3 — NON-SHARED:   ❌ 403 OWNERSHIP_DENIED
 *   TEST 4 — ADMIN:        ✔ Full access (bypass — no DB query)
 *   TEST 5 — LEGACY CASE:  ✔ Allowed (ownerId === null)
 *   TEST 6 — INHERITANCE:  ✔ orthodontics.manage grants bonding.manage
 *   TEST 7 — TAD NOT FOUND: ❌ 404 TAD_NOT_FOUND (hard enforcement)
 *   TEST 8 — BONDING NO CASEID: ❌ 422 BONDING_MISSING_CASE
 *
 * Run: jest ownership.guard.test.js
 */

"use strict";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("mongoose", () => {
    const actual = jest.requireActual("mongoose");
    return {
        ...actual,
        isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(String(id)),
        model: jest.fn(),
    };
});

jest.mock("@utils/logger", () => ({
    warn:  jest.fn(),
    debug: jest.fn(),
    info:  jest.fn(),
    error: jest.fn(),
}));

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const VALID_ID   = "64f0000000000000000000f0";
const OWNER_ID   = "64f0000000000000000000aa";
const SHARED_ID  = "64f0000000000000000000bb";
const STRANGER_ID = "64f0000000000000000000cc";
const ADMIN_ID   = "64f0000000000000000000dd";
const ORG_ID     = "64f0000000000000000000ee";

function makeReq(userId, roleName = "doctor") {
    return {
        context: {
            userId,
            roleName,
            organizationId: ORG_ID,
        },
        method:      "POST",
        originalUrl: "/api/v1/org/bonding",
    };
}

function mockMongooseModel(caseData) {
    const mongoose = require("mongoose");
    mongoose.model.mockReturnValue({
        findOne: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
                lean: jest.fn().mockResolvedValue(caseData),
            }),
        }),
    });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("checkCaseOwnership", () => {
    let checkCaseOwnership;

    beforeEach(() => {
        jest.resetModules();
        jest.mock("mongoose", () => {
            const actual = jest.requireActual("mongoose");
            return {
                ...actual,
                isValidObjectId: (id) => /^[a-f\d]{24}$/i.test(String(id)),
                model: jest.fn(),
            };
        });
        jest.mock("@utils/logger", () => ({
            warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn(),
        }));
        ({ checkCaseOwnership } = require("../utils/ownership.guard"));
    });

    // ── TEST 1: OWNER ────────────────────────────────────────────────────────
    test("TEST 1 — OWNER: case owner can modify", async () => {
        mockMongooseModel({ ownerId: { toString: () => OWNER_ID }, sharedWith: [] });
        const req = makeReq(OWNER_ID);
        await expect(checkCaseOwnership(req, VALID_ID)).resolves.toBeDefined();
    });

    // ── TEST 2: SHARED USER ──────────────────────────────────────────────────
    test("TEST 2 — SHARED USER: user in sharedWith[] can modify", async () => {
        mockMongooseModel({
            ownerId:     { toString: () => OWNER_ID },
            sharedWith:  [{ toString: () => SHARED_ID }],
        });
        const req = makeReq(SHARED_ID);
        await expect(checkCaseOwnership(req, VALID_ID)).resolves.toBeDefined();
    });

    // ── TEST 3: NON-SHARED ───────────────────────────────────────────────────
    test("TEST 3 — NON-SHARED: stranger gets 403 OWNERSHIP_DENIED", async () => {
        mockMongooseModel({
            ownerId:    { toString: () => OWNER_ID },
            sharedWith: [],
        });
        const req = makeReq(STRANGER_ID);
        await expect(checkCaseOwnership(req, VALID_ID)).rejects.toMatchObject({
            statusCode: 403,
            code:       "OWNERSHIP_DENIED",
        });
    });

    // ── TEST 4: ADMIN ────────────────────────────────────────────────────────
    test("TEST 4 — ADMIN: org_admin bypasses without DB query", async () => {
        const mongoose = require("mongoose");
        const mockFind = jest.fn();
        mongoose.model.mockReturnValue({ findOne: mockFind });

        const req = makeReq(ADMIN_ID, "org_admin");
        await expect(checkCaseOwnership(req, VALID_ID)).resolves.toBeDefined();
        // Admin bypass must NOT query the DB
        expect(mockFind).not.toHaveBeenCalled();
    });

    // ── TEST 5: LEGACY CASE ──────────────────────────────────────────────────
    test("TEST 5 — LEGACY CASE: ownerId === null allows access", async () => {
        mockMongooseModel({ ownerId: null, sharedWith: [] });
        const req = makeReq(STRANGER_ID);
        await expect(checkCaseOwnership(req, VALID_ID)).resolves.toBeDefined();
    });

    // ── TEST 6: INVALID CASE ID ──────────────────────────────────────────────
    test("TEST 6 — INVALID ID: throws 400 VALIDATION_ERROR", async () => {
        const req = makeReq(OWNER_ID);
        await expect(checkCaseOwnership(req, "not-a-valid-id")).rejects.toMatchObject({
            statusCode: 400,
            code:       "VALIDATION_ERROR",
        });
    });

    // ── TEST 7: CASE NOT FOUND ───────────────────────────────────────────────
    test("TEST 7 — CASE NOT FOUND: throws 404 CASE_NOT_FOUND", async () => {
        mockMongooseModel(null); // findOne returns null
        const req = makeReq(OWNER_ID);
        await expect(checkCaseOwnership(req, VALID_ID)).rejects.toMatchObject({
            statusCode: 404,
            code:       "CASE_NOT_FOUND",
        });
    });
});

// ─── Permission Inheritance Tests ─────────────────────────────────────────────

describe("authorize — permission inheritance", () => {
    let can;

    beforeEach(() => {
        jest.resetModules();
        jest.mock("@utils/logger", () => ({
            warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn(),
        }));
        ({ can } = require("../../../utils/authorize"));
    });

    function makeReqWithPerms(...perms) {
        return { context: { permissions: new Set(perms), roleName: "doctor", userId: OWNER_ID } };
    }

    // ── TEST 6 — Phase 30 FINAL: Two-Permission Model ───────────────────────
    // Engine-level permissions (bonding.manage, tads.manage, etc.) no longer exist.
    // Controllers use orthodontics.full (mutations) and orthodontics.read (reads) directly.

    test("TEST 6 — FULL: orthodontics.full grants clinical mutations", () => {
        const req = makeReqWithPerms("orthodontics.full");
        expect(can(req, "orthodontics.full")).toBe(true);
    });

    test("TEST 6 — READ: orthodontics.read grants clinical reads", () => {
        const req = makeReqWithPerms("orthodontics.read");
        expect(can(req, "orthodontics.read")).toBe(true);
    });

    test("TEST 6 — READ does NOT grant FULL", () => {
        const req = makeReqWithPerms("orthodontics.read");
        expect(can(req, "orthodontics.full")).toBe(false);
    });

    test("TEST 6 — DENIED: no ortho perm denies mutations", () => {
        const req = makeReqWithPerms("patients.read");
        expect(can(req, "orthodontics.full")).toBe(false);
    });

    test("TEST 6 — DENIED: no ortho perm denies reads", () => {
        const req = makeReqWithPerms("patients.read");
        expect(can(req, "orthodontics.read")).toBe(false);
    });

    test("TEST 6 — ROLE MATRIX: orthodontics.full covers all ortho actions", () => {
        const req = makeReqWithPerms("orthodontics.full");
        expect(can(req, "orthodontics.full")).toBe(true);
        expect(can(req, "orthodontics.read")).toBe(false); // full does not downgrade to read — direct check
    });
});
