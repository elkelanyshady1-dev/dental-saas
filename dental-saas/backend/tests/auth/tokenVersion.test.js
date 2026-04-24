/**
 * tokenVersion.test.js — H2 token invalidation contract
 *
 * The invariant: any code path that mutates a user's credentials (password
 * reset, password change), revokes all sessions (logoutAll), or detects a
 * refresh-token reuse attack MUST bump `tokenVersion` AND revoke refresh
 * tokens. Both actions are what makes outstanding access tokens and refresh
 * tokens unusable before their natural expiry.
 *
 * These are structural tests against authService.js — they verify the code
 * CONTAINS the mandated sequence of calls. A full integration test would
 * require a live per-org Mongo, which is out of scope for unit tests.
 * Structural assertions still catch regressions (e.g., someone removing the
 * revoke step during a refactor).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const AUTH_SERVICE_PATH = path.join(__dirname, "../../src/services/authService.js");
const authServiceSrc = fs.readFileSync(AUTH_SERVICE_PATH, "utf-8");
const authService = require("../../src/services/authService");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sliceBody(exportName) {
    // Crude but sufficient: grab text between `exports.<name> =` and the
    // next `exports.` or EOF. Enough to assert the required calls are
    // within the function body.
    const startRe = new RegExp(`exports\\.${exportName}\\s*=\\s*async?\\s*\\(`, "g");
    const startMatch = startRe.exec(authServiceSrc);
    if (!startMatch) return null;
    const body = authServiceSrc.slice(startMatch.index);
    const nextExport = body.indexOf("\nexports.", 1);
    return nextExport === -1 ? body : body.slice(0, nextExport);
}

// ─── changePassword ──────────────────────────────────────────────────────────

describe("authService.changePassword — H2", () => {
    it("exists and is async", () => {
        expect(typeof authService.changePassword).toBe("function");
    });

    it("bumps tokenVersion", () => {
        const body = sliceBody("changePassword");
        expect(body).toBeTruthy();
        expect(body).toMatch(/user\.tokenVersion\s*\+=\s*1/);
    });

    it("revokes outstanding refresh tokens", () => {
        const body = sliceBody("changePassword");
        // Existing contract uses updateMany({ ...userId }, { revoked: true })
        expect(body).toMatch(/RefreshToken\.updateMany[\s\S]*revoked:\s*true/);
    });
});

// ─── resetPassword ───────────────────────────────────────────────────────────

describe("authService.resetPassword — H2", () => {
    it("exists and is async", () => {
        expect(typeof authService.resetPassword).toBe("function");
    });

    it("bumps tokenVersion", () => {
        const body = sliceBody("resetPassword");
        expect(body).toBeTruthy();
        expect(body).toMatch(/user\.tokenVersion\s*\+=\s*1/);
    });

    it("revokes refresh tokens (H2 fix — previously only bumped tokenVersion)", () => {
        const body = sliceBody("resetPassword");
        expect(body).toMatch(/RefreshToken[\s\S]*updateMany[\s\S]*revoked:\s*true/i);
    });
});

// ─── logoutAll ───────────────────────────────────────────────────────────────

describe("authService.logoutAll — H2", () => {
    it("exists", () => {
        expect(typeof authService.logoutAll).toBe("function");
    });

    it("bumps tokenVersion", () => {
        const body = sliceBody("logoutAll");
        expect(body).toBeTruthy();
        expect(body).toMatch(/tokenVersion\s*=\s*\([^)]*tokenVersion[^)]*\)\s*\+\s*1|tokenVersion\s*\+=\s*1/);
    });

    it("revokes ALL refresh tokens for the user", () => {
        const body = sliceBody("logoutAll");
        expect(body).toMatch(/RefreshToken\.updateMany/);
        expect(body).toMatch(/revoked:\s*true/);
    });

    it("rejects calls missing userId or organizationId", async () => {
        await expect(authService.logoutAll(null, "o1")).rejects.toThrow(/userId and organizationId/i);
        await expect(authService.logoutAll("u1", null)).rejects.toThrow(/userId and organizationId/i);
    });
});

// ─── refreshToken reuse attack path ──────────────────────────────────────────

describe("authService.refreshToken — reuse attack hardening (pre-existing, verified)", () => {
    it("bumps tokenVersion when a revoked non-rotated refresh token is re-used", () => {
        const body = sliceBody("refreshToken");
        // The attack detection block is the existing hardening and must
        // continue bumping tokenVersion + revoking all siblings.
        expect(body).toMatch(/tokenVersion\s*\+=\s*1/);
        expect(body).toMatch(/RefreshToken\.updateMany/);
    });
});

// ─── capabilityHash embed in all signOrgToken sites ──────────────────────────

describe("authService — H1 capabilityHash embedding coverage", () => {
    it("every signOrgToken call site includes capabilityHash in the payload", () => {
        // Find every `signOrgToken({...})` block and make sure it contains
        // `capabilityHash`. This protects against someone adding a new sign
        // site later without embedding the hash.
        const re = /signOrgToken\s*\(\s*{([^}]*)}/g;
        const blocks = [];
        let m;
        while ((m = re.exec(authServiceSrc)) !== null) {
            blocks.push(m[1]);
        }
        expect(blocks.length).toBeGreaterThanOrEqual(5);
        for (const b of blocks) {
            expect(b).toMatch(/capabilityHash/);
        }
    });
});
