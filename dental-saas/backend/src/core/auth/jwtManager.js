/**
 * jwtManager.js — Centralized JWT Signing & Verification
 * ═══════════════════════════════════════════════════════════════
 *
 * SINGLE AUTHORITY for all JWT operations.
 *
 * This module enforces plane isolation:
 *   - Organization tokens are signed/verified with JWT_ORG_SECRET
 *   - Platform tokens are signed/verified with JWT_PLATFORM_SECRET
 *   - Tokens are NEVER interchangeable across planes
 *
 * All services and controllers MUST use this module instead of
 * calling jwt.sign() or jwt.verify() directly.
 *
 * Migration support:
 *   - Falls back to JWT_SECRET if plane-specific secret is not set
 *   - This allows gradual migration without breaking existing tokens
 *   - Once both JWT_ORG_SECRET and JWT_PLATFORM_SECRET are set,
 *     tokens become fully isolated
 *
 * PLANE: Shared (used by both planes).
 *
 * @module core/auth/jwtManager
 */

"use strict";

const jwt = require("jsonwebtoken");
const logger = require("@utils/logger");
const { metrics } = require("@infra/metrics/metrics");

// ─── Security: Algorithm Whitelist ────────────────────────────────────────────
// Enforce HS256 only — prevents algorithm confusion attacks (CVE-2015-9235).
// An attacker who obtains the public key cannot craft tokens with alg:RS256→HS256.
const JWT_ALGORITHMS = ["HS256"];

// ─── Secret Resolution ───────────────────────────────────────────────────────
// Each plane uses its own secret. Fallback to JWT_SECRET for backward compat.

function _getOrgSecret() {
    return process.env.JWT_ORG_SECRET || process.env.JWT_SECRET;
}

function _getPlatformSecret() {
    return process.env.JWT_PLATFORM_SECRET || process.env.JWT_SECRET;
}

// ─── Access Token TTL ────────────────────────────────────────────────────────
const ACCESS_TOKEN_TTL = "15m";

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Sign an organization-plane access token.
 *
 * Payload MUST include:
 *   - userId             (ObjectId → string)
 *   - organizationId     (ObjectId → string)
 *   - roleId             (ObjectId → string)
 *   - regionCode         (ISO string, e.g. "EG")
 *   - permissions        (string[], flat permission keys embedded in token)
 *   - permissionVersion  (REMOVED — Phase 5 time-bounded RBAC consistency)
 *
 * The `type: "organization"` field is injected automatically.
 *
 * @param {Object} payload — Token payload (without `type`)
 * @param {Object} [options] — jwt.sign options override (e.g. custom expiresIn)
 * @returns {string} Signed JWT
 */
function signOrgToken(payload, options = {}) {
    if (!payload.userId) throw new Error("[jwtManager] signOrgToken requires payload.userId");
    if (!payload.organizationId) throw new Error("[jwtManager] signOrgToken requires payload.organizationId");
    if (!payload.regionCode) throw new Error("[jwtManager] signOrgToken requires payload.regionCode");

    const tokenPayload = {
        type: "organization",
        userId: payload.userId,
        roleId: payload.roleId,
        organizationId: payload.organizationId,
        regionCode: payload.regionCode,
        tokenVersion: payload.tokenVersion,
    };

    // Phase 5b: Embed permissions in JWT for token-driven RBAC.
    if (Array.isArray(payload.permissions)) {
        tokenPayload.permissions = payload.permissions;
    }

    // Phase 8: Embed roleName for logging/debugging (avoids populate)
    if (payload.roleName) {
        tokenPayload.roleName = payload.roleName;
    }

    return jwt.sign(tokenPayload, _getOrgSecret(), {
        algorithm: "HS256",
        expiresIn: ACCESS_TOKEN_TTL,
        ...options,
    });
}

/**
 * Sign a platform-plane access token.
 *
 * Payload MUST include:
 *   - id              (ObjectId → string)
 *   - role            (string, e.g. "superadmin")
 *   - tokenVersion    (Number)
 *
 * The `type: "platform"` field is injected automatically.
 *
 * @param {Object} payload — Token payload (without `type`)
 * @param {Object} [options] — jwt.sign options override
 * @returns {string} Signed JWT
 */
function signPlatformToken(payload, options = {}) {
    if (!payload.id) throw new Error("[jwtManager] signPlatformToken requires payload.id");
    if (!payload.role) throw new Error("[jwtManager] signPlatformToken requires payload.role");

    const tokenPayload = {
        type: "platform",
        id: payload.id,
        role: payload.role,
        regionCode: payload.regionCode || "GLOBAL",
        tokenVersion: payload.tokenVersion,
    };

    // Optional fields
    if (payload.capabilityHash) {
        tokenPayload.capabilityHash = payload.capabilityHash;
    }

    return jwt.sign(tokenPayload, _getPlatformSecret(), {
        algorithm: "HS256",
        expiresIn: ACCESS_TOKEN_TTL,
        ...options,
    });
}

// ─── Verification ────────────────────────────────────────────────────────────

/**
 * Verify an organization-plane token.
 *
 * @param {string} token — Raw JWT string
 * @returns {Object} Decoded token payload
 * @throws {jwt.JsonWebTokenError} If token is invalid or signed with wrong secret
 */
function verifyOrgToken(token) {
    return jwt.verify(token, _getOrgSecret(), { algorithms: JWT_ALGORITHMS });
}

/**
 * Verify a platform-plane token.
 *
 * @param {string} token — Raw JWT string
 * @returns {Object} Decoded token payload
 * @throws {jwt.JsonWebTokenError} If token is invalid or signed with wrong secret
 */
function verifyPlatformToken(token) {
    return jwt.verify(token, _getPlatformSecret(), { algorithms: JWT_ALGORITHMS });
}

/**
 * Verify a token by its type field.
 *
 * Steps:
 *   1. Decode — read the header + payload WITHOUT signature verification
 *   2. Route — use decoded.type to select the correct secret
 *   3. Verify — fully verify with the correct plane-specific secret
 *
 * This ensures:
 *   - An org token CANNOT verify against the platform secret
 *   - A platform token CANNOT verify against the org secret
 *   - Tokens without a valid type are REJECTED
 *
 * Migration fallback:
 *   If strict verification fails AND JWT_SECRET is set (shared legacy key),
 *   a fallback attempt is made with JWT_SECRET. This supports tokens that
 *   were issued before plane-isolated secrets were deployed.
 *   The fallback is logged for observability.
 *
 * @param {string} token — Raw JWT string
 * @returns {Object} Decoded + verified token payload
 * @throws {Error} If token is invalid, expired, or type is unrecognized
 */
function verifyByType(token) {
    // Step 1: Decode without verification to read the type
    const unverified = jwt.decode(token, { complete: true });

    if (!unverified || !unverified.payload) {
        throw new jwt.JsonWebTokenError("Token cannot be decoded");
    }

    const { type } = unverified.payload;

    // Step 2: Route to correct verifier
    try {
        if (type === "organization") {
            return verifyOrgToken(token);
        }

        if (type === "platform") {
            return verifyPlatformToken(token);
        }
    } catch (primaryErr) {
        // Step 3: Migration fallback — try shared JWT_SECRET
        const fallbackSecret = process.env.JWT_SECRET;
        const orgSecret = process.env.JWT_ORG_SECRET;
        const platformSecret = process.env.JWT_PLATFORM_SECRET;

        // Only attempt fallback if:
        //   - JWT_SECRET exists
        //   - JWT_SECRET is different from the plane-specific secret that just failed
        const planeSecret = type === "organization" ? orgSecret : platformSecret;

        if (fallbackSecret && fallbackSecret !== planeSecret) {
            try {
                const decoded = jwt.verify(token, fallbackSecret, { algorithms: JWT_ALGORITHMS });
                // Track legacy fallback usage for migration monitoring
                metrics.jwt_legacy_fallback_total?.inc({ tokenType: type });
                logger.warn({
                    event: "JWT_LEGACY_FALLBACK_USED",
                    tokenType: type,
                    userId: decoded.userId || decoded.id,
                }, "[jwtManager] Token verified via legacy JWT_SECRET fallback. Re-issue is required.");
                return decoded;
            } catch {
                // Fallback also failed — throw original error
                throw primaryErr;
            }
        }

        throw primaryErr;
    }

    // No valid type found
    const err = new jwt.JsonWebTokenError(`Unknown token type: "${type}"`);
    err.code = "INVALID_TOKEN_TYPE";
    throw err;
}

module.exports = {
    signOrgToken,
    signPlatformToken,
    verifyOrgToken,
    verifyPlatformToken,
    verifyByType,

    // Expose for testing only
    _getOrgSecret,
    _getPlatformSecret,
};
