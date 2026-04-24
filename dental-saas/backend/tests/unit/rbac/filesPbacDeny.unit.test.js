/**
 * filesPbacDeny.test.js — PBAC Deny Test for POST /api/org/files/upload
 *
 * GOAL:
 *   Prove the policy layer (PBAC) — not RBAC — blocks a user whose role
 *   still carries `files.create` but whose branch context fails
 *   `hasBranchAccess(ctx)`.
 *
 * WHY NOT RBAC:
 *   Removing `files.create` from the role would be denied by
 *   requireOrgPermission BEFORE policyMiddleware ever runs. To exercise
 *   PBAC specifically we must keep the permission and break the policy
 *   condition. For `files.create` on an upload (no resource fetched),
 *   the allow rules for doctor/assistant require:
 *
 *     hasBranchAccess(ctx) = hasFullBranchAccess(ctx) || isSameBranch(ctx)
 *
 *   With no resource on an upload call, `isSameBranch` always returns
 *   false (policyConditions.js:90), so the only way to pass is
 *   `user.hasFullBranchAccess === true`. Flipping that flag off while
 *   keeping the doctor role gives a clean PBAC deny.
 *
 * WHAT THIS TEST VERIFIES:
 *   1. ALLOW path (control)  — doctor with hasFullBranchAccess:true
 *      → next() is called, no 403, no audit deny.
 *   2. DENY path             — same doctor, hasFullBranchAccess:false,
 *      branchId set to a branch NOT in user's assigned branches
 *      → res.status(403) with code "POLICY_ACCESS_DENIED"
 *      → next() NOT called (controller would never run)
 *      → auditService.createAuditRecord called with
 *        action:"POLICY_ACCESS_DENIED", success:false
 *   3. POLICY_SHADOW_MODE is explicitly forced OFF for this test so the
 *      enforcement branch is exercised regardless of .env state.
 *
 * SCOPE:
 *   Middleware-level unit test. We do not spin up Express, supertest, or
 *   a Mongo instance — the bug in question lives inside policyMiddleware
 *   + policyEvaluator, and testing them in isolation is both faster and
 *   more precise than an HTTP round trip.
 *
 * PLANE: Org only.
 */

"use strict";

require("module-alias/register");

// ─── Mock auditService BEFORE requiring the middleware ──────────────────────
// policyMiddleware pulls auditService at require time via
//   const auditService = require("@services/auditService");
// so the mock must be registered first.
jest.mock("@services/auditService", () => ({
    createAuditRecord: jest.fn().mockResolvedValue(undefined),
}));

// Silence shadow-mode warn logs so test output stays clean.
jest.mock("@utils/logger", () => ({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
}));

const auditService = require("@services/auditService");
const policyMiddleware = require("@rbac/policyMiddleware");
const { P } = require("@rbac/orgPermissions");

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const ORG_ID    = "aaaaaaaaaaaaaaaaaaaaaaaa";
const USER_ID   = "bbbbbbbbbbbbbbbbbbbbbbbb";
const BRANCH_A  = "cccccccccccccccccccccccc"; // user's assigned branch
const BRANCH_B  = "dddddddddddddddddddddddd"; // foreign branch (deny target)

/**
 * Build a doctor user object. `hasFullBranchAccess` controls whether the
 * PBAC `hasBranchAccess` condition passes in the absence of a resource.
 */
function makeDoctor({ hasFullBranchAccess }) {
    return {
        _id: USER_ID,
        organizationId: ORG_ID,
        role: "doctor",
        roleId: { name: "doctor" },
        assignedBranches: [BRANCH_A],
        hasFullBranchAccess,
    };
}

/**
 * Minimal Express request matching the shape policyMiddleware expects
 * for the POST /api/org/files/upload route. No `getResource` is supplied
 * — that matches the real route, which does not pass a resource fetcher
 * to policyMiddleware (see backend/src/modules/files/routes/file.routes.js).
 */
function makeReq({ user, branchId }) {
    return {
        user,
        organizationId: ORG_ID,
        branchId,
        activeBranchId: branchId,
        method: "POST",
        originalUrl: "/api/org/files/upload",
        route: { path: "/upload" },
        ip: "127.0.0.1",
        headers: { "user-agent": "jest" },
        requestId: "req-test-0001",
        addAuthTrace: jest.fn(),
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json   = jest.fn().mockReturnValue(res);
    return res;
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

let originalShadowMode;

beforeAll(() => {
    originalShadowMode = process.env.POLICY_SHADOW_MODE;
    // Force enforcement mode regardless of ambient .env value.
    process.env.POLICY_SHADOW_MODE = "false";
});

afterAll(() => {
    if (originalShadowMode === undefined) {
        delete process.env.POLICY_SHADOW_MODE;
    } else {
        process.env.POLICY_SHADOW_MODE = originalShadowMode;
    }
});

beforeEach(() => {
    auditService.createAuditRecord.mockClear();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("PBAC Deny — POST /api/org/files/upload (files.create)", () => {

    test("CONTROL: doctor with hasFullBranchAccess:true is ALLOWED", async () => {
        const req  = makeReq({
            user: makeDoctor({ hasFullBranchAccess: true }),
            branchId: BRANCH_A,
        });
        const res  = makeRes();
        const next = jest.fn();

        const mw = policyMiddleware(P.FILES_CREATE);
        await mw(req, res, next);

        // next() called → controller would be reached
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();

        // Policy decision attached for observability
        expect(req.policyDecision).toBeDefined();
        expect(req.policyDecision.allowed).toBe(true);
        expect(req.policyDecision.effect).toBe("allow");

        // No deny audit
        const denyCalls = auditService.createAuditRecord.mock.calls.filter(
            ([arg]) => arg.action === "POLICY_ACCESS_DENIED"
        );
        expect(denyCalls).toHaveLength(0);
    });

    test("DENY: doctor with hasFullBranchAccess:false on foreign branch → 403 POLICY_ACCESS_DENIED", async () => {
        const req  = makeReq({
            user: makeDoctor({ hasFullBranchAccess: false }),
            branchId: BRANCH_B, // branch NOT in user.assignedBranches
        });
        const res  = makeRes();
        const next = jest.fn();

        const mw = policyMiddleware(P.FILES_CREATE);
        await mw(req, res, next);

        // 1. Controller must NOT be reached
        expect(next).not.toHaveBeenCalled();

        // 2. HTTP 403 with POLICY_ACCESS_DENIED payload
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledTimes(1);
        const payload = res.json.mock.calls[0][0];
        expect(payload).toMatchObject({
            success: false,
            error: { code: "POLICY_ACCESS_DENIED" },
        });
        expect(typeof payload.error.message).toBe("string");

        // 3. Audit entry written with the enforced-deny action
        const denyCalls = auditService.createAuditRecord.mock.calls.filter(
            ([arg]) => arg.action === "POLICY_ACCESS_DENIED"
        );
        expect(denyCalls).toHaveLength(1);
        const auditArg = denyCalls[0][0];
        expect(auditArg).toMatchObject({
            action: "POLICY_ACCESS_DENIED",
            actorType: "tenant_user",
            actorId: USER_ID,
            organizationId: ORG_ID,
            success: false,
        });
        expect(auditArg.details).toMatchObject({
            permission: "files.create",
            role: "doctor",
        });

        // 4. NO shadow audit — this must be the enforcement path
        const shadowCalls = auditService.createAuditRecord.mock.calls.filter(
            ([arg]) => arg.action === "POLICY_SHADOW_DENY"
        );
        expect(shadowCalls).toHaveLength(0);

        // 5. Auth trace annotated as PBAC DENY (not SHADOW_DENY)
        expect(req.addAuthTrace).toHaveBeenCalled();
        const traceArg = req.addAuthTrace.mock.calls[0][0];
        expect(traceArg).toMatchObject({
            layer: "PBAC",
            permission: "files.create",
            result: "DENY",
        });
    });

    test("DENY payload does NOT include fileId, url, or any controller output", async () => {
        // Defensive check: ensures the controller genuinely never runs.
        // If something downstream were to populate res.json with upload data,
        // the payload would have fileId/url — this test would fail.
        const req  = makeReq({
            user: makeDoctor({ hasFullBranchAccess: false }),
            branchId: BRANCH_B,
        });
        const res  = makeRes();
        const next = jest.fn();

        await policyMiddleware(P.FILES_CREATE)(req, res, next);

        expect(next).not.toHaveBeenCalled();
        const payload = res.json.mock.calls[0][0];
        expect(payload).not.toHaveProperty("data.fileId");
        expect(payload).not.toHaveProperty("data.url");
        expect(payload).not.toHaveProperty("data.storageKey");
    });
});
