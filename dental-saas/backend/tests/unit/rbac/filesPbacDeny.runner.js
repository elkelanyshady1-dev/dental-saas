/**
 * filesPbacDeny.runner.js
 *
 * Standalone Node runner that exercises policyMiddleware for files.create
 * with three scenarios (ALLOW control, DENY, DENY payload shape). Bypasses
 * Jest because the project-wide Jest bootstrap currently fails on unrelated
 * integration setup (see tests/bootstrapCollections.js). The assertions
 * here mirror the Jest unit test and produce PASS/FAIL on stdout.
 *
 * Run with:
 *   node tests/unit/rbac/filesPbacDeny.runner.js
 */

"use strict";

require("module-alias/register");

const Module = require("module");
const path = require("path");
const assert = require("assert");

// ─── Pre-stub @services/auditService in the require cache ───────────────────
// policyMiddleware requires this at load time; we inject a capturing stub
// before loading the middleware so every createAuditRecord call is recorded.

const auditCalls = [];
const stubPath = require.resolve("@services/auditService");
require.cache[stubPath] = {
    id: stubPath,
    filename: stubPath,
    loaded: true,
    exports: {
        createAuditRecord: (arg) => {
            auditCalls.push(arg);
            return Promise.resolve();
        },
    },
};

// Stub logger so the runner stays quiet.
const loggerPath = require.resolve("@utils/logger");
require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: {
        info:  () => {},
        warn:  () => {},
        error: () => {},
        debug: () => {},
    },
};

// Force enforcement mode regardless of .env
process.env.POLICY_SHADOW_MODE = "false";

const policyMiddleware = require("@rbac/policyMiddleware");
const { P } = require("@rbac/orgPermissions");

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const ORG_ID   = "aaaaaaaaaaaaaaaaaaaaaaaa";
const USER_ID  = "bbbbbbbbbbbbbbbbbbbbbbbb";
const BRANCH_A = "cccccccccccccccccccccccc";
const BRANCH_B = "dddddddddddddddddddddddd";

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
        headers: { "user-agent": "runner" },
        requestId: "req-test-0001",
        _authTraces: [],
        addAuthTrace(entry) { this._authTraces.push(entry); },
    };
}

function makeRes() {
    const res = { _status: null, _json: null };
    res.status = function(code) { this._status = code; return this; };
    res.json   = function(body) { this._json = body; return this; };
    return res;
}

function resetAudit() { auditCalls.length = 0; }

// ─── Runner ─────────────────────────────────────────────────────────────────

const results = [];
function record(name, fn) {
    return (async () => {
        try {
            await fn();
            results.push({ name, status: "PASS" });
            console.log(`  ✓ ${name}`);
        } catch (err) {
            results.push({ name, status: "FAIL", error: err });
            console.log(`  ✗ ${name}`);
            console.log(`      ${err.message}`);
            if (err.expected !== undefined) {
                console.log(`      expected: ${JSON.stringify(err.expected)}`);
                console.log(`      actual:   ${JSON.stringify(err.actual)}`);
            }
        }
    })();
}

(async () => {
    console.log("PBAC Deny — POST /api/org/files/upload (files.create)");

    // ── CONTROL: doctor with hasFullBranchAccess:true is ALLOWED ────────────
    await record("CONTROL allow — doctor with hasFullBranchAccess:true", async () => {
        resetAudit();
        const req  = makeReq({
            user: makeDoctor({ hasFullBranchAccess: true }),
            branchId: BRANCH_A,
        });
        const res  = makeRes();
        let nextCalled = 0;
        const next = () => { nextCalled++; };

        await policyMiddleware(P.FILES_CREATE)(req, res, next);

        assert.strictEqual(nextCalled, 1, "next() should be called exactly once");
        assert.strictEqual(res._status, null, "res.status should not be called");
        assert.strictEqual(res._json, null, "res.json should not be called");
        assert.ok(req.policyDecision, "req.policyDecision should be set");
        assert.strictEqual(req.policyDecision.allowed, true);
        assert.strictEqual(req.policyDecision.effect, "allow");

        const denies = auditCalls.filter(c => c.action === "POLICY_ACCESS_DENIED");
        assert.strictEqual(denies.length, 0, "no deny audit should be written");
    });

    // ── DENY: doctor with hasFullBranchAccess:false → 403 ────────────────────
    await record("DENY — doctor with hasFullBranchAccess:false on foreign branch → 403 POLICY_ACCESS_DENIED", async () => {
        resetAudit();
        const req  = makeReq({
            user: makeDoctor({ hasFullBranchAccess: false }),
            branchId: BRANCH_B,
        });
        const res  = makeRes();
        let nextCalled = 0;
        const next = () => { nextCalled++; };

        await policyMiddleware(P.FILES_CREATE)(req, res, next);

        assert.strictEqual(nextCalled, 0, "next() must NOT be called");
        assert.strictEqual(res._status, 403, "HTTP 403 expected");
        assert.ok(res._json, "res.json should be called");
        assert.strictEqual(res._json.success, false);
        assert.strictEqual(res._json.error.code, "POLICY_ACCESS_DENIED");
        assert.strictEqual(typeof res._json.error.message, "string");

        const denies = auditCalls.filter(c => c.action === "POLICY_ACCESS_DENIED");
        assert.strictEqual(denies.length, 1, "exactly one POLICY_ACCESS_DENIED audit");
        const a = denies[0];
        assert.strictEqual(a.actorType, "tenant_user");
        assert.strictEqual(String(a.actorId), USER_ID);
        assert.strictEqual(String(a.organizationId), ORG_ID);
        assert.strictEqual(a.success, false);
        assert.strictEqual(a.details.permission, "files.create");
        assert.strictEqual(a.details.role, "doctor");

        const shadow = auditCalls.filter(c => c.action === "POLICY_SHADOW_DENY");
        assert.strictEqual(shadow.length, 0, "no shadow audit in enforcement mode");

        const trace = req._authTraces[0];
        assert.ok(trace, "auth trace should be recorded");
        assert.strictEqual(trace.layer, "PBAC");
        assert.strictEqual(trace.permission, "files.create");
        assert.strictEqual(trace.result, "DENY");
    });

    // ── Controller output must not leak into DENY payload ───────────────────
    await record("DENY payload has no fileId/url/storageKey", async () => {
        resetAudit();
        const req  = makeReq({
            user: makeDoctor({ hasFullBranchAccess: false }),
            branchId: BRANCH_B,
        });
        const res  = makeRes();
        let nextCalled = 0;
        await policyMiddleware(P.FILES_CREATE)(req, res, () => { nextCalled++; });

        assert.strictEqual(nextCalled, 0);
        const body = res._json || {};
        const data = body.data || {};
        assert.strictEqual(data.fileId, undefined, "no fileId in deny payload");
        assert.strictEqual(data.url, undefined, "no url in deny payload");
        assert.strictEqual(data.storageKey, undefined, "no storageKey in deny payload");
    });

    // ── Report ──────────────────────────────────────────────────────────────
    const passed = results.filter(r => r.status === "PASS").length;
    const failed = results.filter(r => r.status === "FAIL").length;
    console.log("");
    console.log(`Results: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        process.exitCode = 1;
    }
})();
