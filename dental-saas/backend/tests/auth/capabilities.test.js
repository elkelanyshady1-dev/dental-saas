/**
 * capabilities.test.js — C1/C3/H1 fail-closed chain
 *
 * Covers:
 *   - assertCapabilities     : rejects null/undefined req.capabilities with 500
 *   - validateCapabilityHash : rejects stale JWT snapshot with 401, legacy-passes
 *                              when claim absent, fails closed when live hash missing
 *
 * Pure unit tests — Express-style (req, res, next) harness, no DB.
 */

"use strict";

const assertCapabilities = require("../../src/middleware/assertCapabilities");
const validateCapabilityHash = require("../../src/middleware/validateCapabilityHash");

// ─── Harness ──────────────────────────────────────────────────────────────────

function mockReq(overrides = {}) {
    return {
        originalUrl: "/api/v1/org/patients",
        method: "GET",
        context: { userId: "u1", organizationId: "o1" },
        user: { _id: "u1" },
        ...overrides,
    };
}

function mockRes() {
    const res = {
        statusCode: null,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    return res;
}

// ─── assertCapabilities (C1) ─────────────────────────────────────────────────

describe("assertCapabilities (C1)", () => {
    it("500s with CAPABILITIES_NOT_RESOLVED when req.capabilities is undefined", () => {
        const req = mockReq(); // no capabilities
        const res = mockRes();
        let nextCalled = false;

        assertCapabilities(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(500);
        expect(res.body?.success).toBe(false);
        expect(res.body?.error?.code).toBe("CAPABILITIES_NOT_RESOLVED");
    });

    it("500s with CAPABILITIES_NOT_RESOLVED when req.capabilities is explicitly null (fail-closed from resolver catch)", () => {
        const req = mockReq({ capabilities: null });
        const res = mockRes();
        let nextCalled = false;

        assertCapabilities(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(500);
        expect(res.body?.error?.code).toBe("CAPABILITIES_NOT_RESOLVED");
    });

    it("calls next() when req.capabilities is an object (even if empty)", () => {
        const req = mockReq({ capabilities: {} });
        const res = mockRes();
        let nextCalled = false;

        assertCapabilities(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBeNull();
    });

    it("calls next() when req.capabilities is populated", () => {
        const req = mockReq({ capabilities: { modules: { patients: true } } });
        const res = mockRes();
        let nextCalled = false;

        assertCapabilities(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(true);
    });
});

// ─── validateCapabilityHash (H1) ─────────────────────────────────────────────

describe("validateCapabilityHash (H1)", () => {
    it("500s CAPABILITIES_NOT_RESOLVED when live hash is missing (defense-in-depth behind assertCapabilities)", () => {
        const req = mockReq({ jwtClaims: { capabilityHash: "abc" }, capabilityHash: undefined });
        const res = mockRes();
        let nextCalled = false;

        validateCapabilityHash(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(500);
        expect(res.body?.error?.code).toBe("CAPABILITIES_NOT_RESOLVED");
    });

    it("passes (legacy path) when JWT has no capabilityHash claim", () => {
        const req = mockReq({ jwtClaims: { /* no hash */ }, capabilityHash: "live-abc" });
        const res = mockRes();
        let nextCalled = false;

        validateCapabilityHash(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(true);
        expect(res.statusCode).toBeNull();
    });

    it("passes when JWT hash matches live hash", () => {
        const req = mockReq({ jwtClaims: { capabilityHash: "same-hash" }, capabilityHash: "same-hash" });
        const res = mockRes();
        let nextCalled = false;

        validateCapabilityHash(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(true);
    });

    it("401s CAPABILITY_SNAPSHOT_STALE when JWT hash differs from live hash", () => {
        const req = mockReq({ jwtClaims: { capabilityHash: "stale" }, capabilityHash: "fresh" });
        const res = mockRes();
        let nextCalled = false;

        validateCapabilityHash(req, res, () => { nextCalled = true; });

        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
        expect(res.body?.error?.code).toBe("CAPABILITY_SNAPSHOT_STALE");
    });

    it("401s without leaking the real hashes in the response body", () => {
        const req = mockReq({ jwtClaims: { capabilityHash: "stale-secret" }, capabilityHash: "fresh-secret" });
        const res = mockRes();

        validateCapabilityHash(req, res, () => {});

        const serialized = JSON.stringify(res.body);
        expect(serialized).not.toContain("stale-secret");
        expect(serialized).not.toContain("fresh-secret");
    });
});
