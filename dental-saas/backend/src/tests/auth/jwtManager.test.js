/**
 * jwtManager.test.js — Unit Tests for JWT Manager
 * ═══════════════════════════════════════════════════
 *
 * Tests:
 *   1. Org tokens signed and verified correctly
 *   2. Platform tokens signed and verified correctly
 *   3. Cross-plane verification is REJECTED
 *   4. verifyByType routes correctly
 *   5. Migration fallback works
 *   6. Invalid/missing type rejected
 *   7. Required payload validation
 */

"use strict";

const jwt = require("jsonwebtoken");

// ─── Save original env and restore after each test ───────────────────────────
const originalEnv = { ...process.env };

beforeEach(() => {
    // Set isolated secrets for tests
    process.env.JWT_SECRET = "shared-legacy-secret-for-testing-only-32ch";
    process.env.JWT_ORG_SECRET = "org-secret-for-testing-only-32-chars!";
    process.env.JWT_PLATFORM_SECRET = "platform-secret-for-test-only-32char";
});

afterEach(() => {
    // Restore original env
    process.env.JWT_SECRET = originalEnv.JWT_SECRET;
    process.env.JWT_ORG_SECRET = originalEnv.JWT_ORG_SECRET;
    process.env.JWT_PLATFORM_SECRET = originalEnv.JWT_PLATFORM_SECRET;
});

// Must require AFTER env setup hooks are defined
const {
    signOrgToken,
    signPlatformToken,
    verifyOrgToken,
    verifyPlatformToken,
    verifyByType,
    _getOrgSecret,
    _getPlatformSecret,
} = require("../../core/auth/jwtManager");

// ─── Test Data ───────────────────────────────────────────────────────────────

const ORG_PAYLOAD = {
    userId: "507f1f77bcf86cd799439011",
    roleId: "507f1f77bcf86cd799439022",
    organizationId: "507f1f77bcf86cd799439033",
    regionCode: "EG",
    tokenVersion: 1,
};

const PLATFORM_PAYLOAD = {
    id: "507f1f77bcf86cd799439044",
    role: "superadmin",
    regionCode: "GLOBAL",
    tokenVersion: 0,
};

// ═════════════════════════════════════════════════════════════════════════════
// 1. SECRET RESOLUTION
// ═════════════════════════════════════════════════════════════════════════════

describe("Secret Resolution", () => {
    test("_getOrgSecret returns JWT_ORG_SECRET when set", () => {
        expect(_getOrgSecret()).toBe(process.env.JWT_ORG_SECRET);
    });

    test("_getOrgSecret falls back to JWT_SECRET when JWT_ORG_SECRET is unset", () => {
        delete process.env.JWT_ORG_SECRET;
        expect(_getOrgSecret()).toBe(process.env.JWT_SECRET);
    });

    test("_getPlatformSecret returns JWT_PLATFORM_SECRET when set", () => {
        expect(_getPlatformSecret()).toBe(process.env.JWT_PLATFORM_SECRET);
    });

    test("_getPlatformSecret falls back to JWT_SECRET when JWT_PLATFORM_SECRET is unset", () => {
        delete process.env.JWT_PLATFORM_SECRET;
        expect(_getPlatformSecret()).toBe(process.env.JWT_SECRET);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. ORG TOKEN SIGNING & VERIFICATION
// ═════════════════════════════════════════════════════════════════════════════

describe("Org Token — signOrgToken / verifyOrgToken", () => {
    test("signs org token with correct payload structure", () => {
        const token = signOrgToken(ORG_PAYLOAD);
        const decoded = jwt.decode(token);

        expect(decoded.type).toBe("organization");
        expect(decoded.userId).toBe(ORG_PAYLOAD.userId);
        expect(decoded.roleId).toBe(ORG_PAYLOAD.roleId);
        expect(decoded.organizationId).toBe(ORG_PAYLOAD.organizationId);
        expect(decoded.regionCode).toBe("EG");
        expect(decoded.tokenVersion).toBe(1);
    });

    test("does NOT include platform-specific fields", () => {
        const token = signOrgToken(ORG_PAYLOAD);
        const decoded = jwt.decode(token);

        expect(decoded.id).toBeUndefined();
        expect(decoded.role).toBeUndefined();
    });

    test("verifyOrgToken successfully verifies an org token", () => {
        const token = signOrgToken(ORG_PAYLOAD);
        const decoded = verifyOrgToken(token);

        expect(decoded.type).toBe("organization");
        expect(decoded.userId).toBe(ORG_PAYLOAD.userId);
    });

    test("verifyOrgToken rejects a tampered token", () => {
        const token = signOrgToken(ORG_PAYLOAD);
        const tampered = token.slice(0, -5) + "XXXXX";

        expect(() => verifyOrgToken(tampered)).toThrow();
    });

    test("requires userId in payload", () => {
        const payload = { ...ORG_PAYLOAD };
        delete payload.userId;
        expect(() => signOrgToken(payload)).toThrow("requires payload.userId");
    });

    test("requires organizationId in payload", () => {
        const payload = { ...ORG_PAYLOAD };
        delete payload.organizationId;
        expect(() => signOrgToken(payload)).toThrow("requires payload.organizationId");
    });

    test("requires regionCode in payload", () => {
        const payload = { ...ORG_PAYLOAD };
        delete payload.regionCode;
        expect(() => signOrgToken(payload)).toThrow("requires payload.regionCode");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. PLATFORM TOKEN SIGNING & VERIFICATION
// ═════════════════════════════════════════════════════════════════════════════

describe("Platform Token — signPlatformToken / verifyPlatformToken", () => {
    test("signs platform token with correct payload structure", () => {
        const token = signPlatformToken(PLATFORM_PAYLOAD);
        const decoded = jwt.decode(token);

        expect(decoded.type).toBe("platform");
        expect(decoded.id).toBe(PLATFORM_PAYLOAD.id);
        expect(decoded.role).toBe("superadmin");
        expect(decoded.regionCode).toBe("GLOBAL");
        expect(decoded.tokenVersion).toBe(0);
    });

    test("does NOT include org-specific fields", () => {
        const token = signPlatformToken(PLATFORM_PAYLOAD);
        const decoded = jwt.decode(token);

        expect(decoded.userId).toBeUndefined();
        expect(decoded.roleId).toBeUndefined();
        expect(decoded.organizationId).toBeUndefined();
    });

    test("includes capabilityHash when provided", () => {
        const payload = { ...PLATFORM_PAYLOAD, capabilityHash: "abc123hash" };
        const token = signPlatformToken(payload);
        const decoded = jwt.decode(token);

        expect(decoded.capabilityHash).toBe("abc123hash");
    });

    test("verifyPlatformToken successfully verifies a platform token", () => {
        const token = signPlatformToken(PLATFORM_PAYLOAD);
        const decoded = verifyPlatformToken(token);

        expect(decoded.type).toBe("platform");
        expect(decoded.id).toBe(PLATFORM_PAYLOAD.id);
    });

    test("requires id in payload", () => {
        const payload = { ...PLATFORM_PAYLOAD };
        delete payload.id;
        expect(() => signPlatformToken(payload)).toThrow("requires payload.id");
    });

    test("requires role in payload", () => {
        const payload = { ...PLATFORM_PAYLOAD };
        delete payload.role;
        expect(() => signPlatformToken(payload)).toThrow("requires payload.role");
    });

    test("defaults regionCode to GLOBAL when not provided", () => {
        const payload = { ...PLATFORM_PAYLOAD };
        delete payload.regionCode;
        const token = signPlatformToken(payload);
        const decoded = jwt.decode(token);

        expect(decoded.regionCode).toBe("GLOBAL");
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. CROSS-PLANE ISOLATION (CRITICAL)
// ═════════════════════════════════════════════════════════════════════════════

describe("Cross-Plane Isolation", () => {
    test("org token CANNOT be verified with platform secret", () => {
        const token = signOrgToken(ORG_PAYLOAD);
        expect(() => verifyPlatformToken(token)).toThrow();
    });

    test("platform token CANNOT be verified with org secret", () => {
        const token = signPlatformToken(PLATFORM_PAYLOAD);
        expect(() => verifyOrgToken(token)).toThrow();
    });

    test("org token verifies ONLY with org secret", () => {
        const token = signOrgToken(ORG_PAYLOAD);

        // Should succeed
        expect(() => verifyOrgToken(token)).not.toThrow();

        // Should fail with platform secret
        expect(() => verifyPlatformToken(token)).toThrow();

        // Should fail with random secret
        expect(() => jwt.verify(token, "random-wrong-secret-32chars!!!!")).toThrow();
    });

    test("platform token verifies ONLY with platform secret", () => {
        const token = signPlatformToken(PLATFORM_PAYLOAD);

        // Should succeed
        expect(() => verifyPlatformToken(token)).not.toThrow();

        // Should fail with org secret
        expect(() => verifyOrgToken(token)).toThrow();

        // Should fail with random secret
        expect(() => jwt.verify(token, "random-wrong-secret-32chars!!!!")).toThrow();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. verifyByType — DETERMINISTIC TYPE-BASED ROUTING
// ═════════════════════════════════════════════════════════════════════════════

describe("verifyByType — Type-Based Routing", () => {
    test("routes org token to org verifier", () => {
        const token = signOrgToken(ORG_PAYLOAD);
        const decoded = verifyByType(token);

        expect(decoded.type).toBe("organization");
        expect(decoded.userId).toBe(ORG_PAYLOAD.userId);
    });

    test("routes platform token to platform verifier", () => {
        const token = signPlatformToken(PLATFORM_PAYLOAD);
        const decoded = verifyByType(token);

        expect(decoded.type).toBe("platform");
        expect(decoded.id).toBe(PLATFORM_PAYLOAD.id);
    });

    test("rejects token with unknown type", () => {
        // Manually create a token with an invalid type
        const token = jwt.sign(
            { type: "alien", userId: "123" },
            process.env.JWT_ORG_SECRET,
            { expiresIn: "15m" }
        );

        expect(() => verifyByType(token)).toThrow("Unknown token type");
    });

    test("rejects token with no type field", () => {
        const token = jwt.sign(
            { userId: "123" },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        expect(() => verifyByType(token)).toThrow();
    });

    test("rejects completely invalid token string", () => {
        expect(() => verifyByType("not.a.valid.jwt")).toThrow();
    });

    test("rejects empty string", () => {
        expect(() => verifyByType("")).toThrow();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. MIGRATION FALLBACK
// ═════════════════════════════════════════════════════════════════════════════

describe("Migration Fallback", () => {
    test("verifyByType falls back to JWT_SECRET for legacy org tokens", () => {
        // Simulate a token signed with the OLD shared secret
        const legacyToken = jwt.sign(
            {
                type: "organization",
                userId: ORG_PAYLOAD.userId,
                organizationId: ORG_PAYLOAD.organizationId,
                regionCode: "EG",
                tokenVersion: 1,
            },
            process.env.JWT_SECRET, // legacy shared secret
            { expiresIn: "15m" }
        );

        // JWT_ORG_SECRET is different from JWT_SECRET, so primary verification fails.
        // Fallback should kick in and verify with JWT_SECRET.
        const decoded = verifyByType(legacyToken);
        expect(decoded.type).toBe("organization");
        expect(decoded.userId).toBe(ORG_PAYLOAD.userId);
    });

    test("verifyByType falls back to JWT_SECRET for legacy platform tokens", () => {
        const legacyToken = jwt.sign(
            {
                type: "platform",
                id: PLATFORM_PAYLOAD.id,
                role: "superadmin",
                tokenVersion: 0,
            },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        const decoded = verifyByType(legacyToken);
        expect(decoded.type).toBe("platform");
        expect(decoded.id).toBe(PLATFORM_PAYLOAD.id);
    });

    test("fallback does NOT activate when JWT_SECRET equals the plane secret", () => {
        // Set JWT_ORG_SECRET = JWT_SECRET (no difference to fall back on)
        process.env.JWT_ORG_SECRET = process.env.JWT_SECRET;

        // Create a token signed with a WRONG secret
        const badToken = jwt.sign(
            { type: "organization", userId: "123", organizationId: "456", regionCode: "EG" },
            "completely-wrong-secret-that-should-fail!",
            { expiresIn: "15m" }
        );

        expect(() => verifyByType(badToken)).toThrow();
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. TOKEN VERSION PRESERVATION
// ═════════════════════════════════════════════════════════════════════════════

describe("tokenVersion Preservation", () => {
    test("org token preserves tokenVersion in payload", () => {
        const payload = { ...ORG_PAYLOAD, tokenVersion: 42 };
        const token = signOrgToken(payload);
        const decoded = verifyOrgToken(token);

        expect(decoded.tokenVersion).toBe(42);
    });

    test("platform token preserves tokenVersion in payload", () => {
        const payload = { ...PLATFORM_PAYLOAD, tokenVersion: 7 };
        const token = signPlatformToken(payload);
        const decoded = verifyPlatformToken(token);

        expect(decoded.tokenVersion).toBe(7);
    });
});
