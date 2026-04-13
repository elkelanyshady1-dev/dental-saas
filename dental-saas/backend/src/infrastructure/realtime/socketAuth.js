/**
 * socketAuth.js — Socket.IO Authentication Middleware
 * ═══════════════════════════════════════════════════════════════
 *
 * SECURITY HARDENING (Production Readiness Patch)
 *
 * Validates Socket.IO connections using the centralized jwtManager.
 * Enforces:
 *   - Plane-isolated JWT verification via verifyByType()
 *   - Organization-only connections (type === "organization")
 *   - Token version check against DB (revoked sessions rejected)
 *   - Algorithm whitelist (HS256 only — via jwtManager)
 *
 * PLANE: Org only (staff real-time).
 *
 * PREVIOUS ISSUES FIXED:
 *   - CRIT-001: Used raw jwt.verify() with shared JWT_SECRET
 *   - CRIT-001: Checked decoded.type !== "org" (tokens use "organization")
 *   - CRIT-001: No algorithm whitelist — CVE-2015-9235 vulnerability
 *   - CRIT-001: No tokenVersion check — revoked sessions could connect
 */

"use strict";

const { verifyByType } = require("../../core/auth/jwtManager");
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("../../shared/models/User");
const logger = require("../../utils/logger");

const socketAuth = async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token
            || socket.handshake.headers?.authorization;

        if (!token) {
            return next(new Error("Authentication error: Token missing"));
        }

        // Strip "Bearer " prefix if present
        const tokenString = token.startsWith("Bearer ") ? token.slice(7) : token;

        // ── Plane-isolated verification via jwtManager ──────────────────
        // verifyByType() reads the token's `type` field, then uses the
        // correct plane-specific secret (JWT_ORG_SECRET / JWT_PLATFORM_SECRET).
        // Algorithm is locked to HS256 inside jwtManager.
        const decoded = verifyByType(tokenString);

        // ── Enforce organization-only connections ────────────────────────
        // Socket.IO is for staff real-time features — platform/patient tokens
        // must not connect here.
        if (decoded.type !== "organization") {
            logger.warn(
                { userId: decoded.id || decoded.userId, type: decoded.type },
                "[Socket] Connection rejected: Not an organization user"
            );
            return next(new Error("Authentication error: Only organization users allowed"));
        }

        // ── Token version check — reject revoked sessions ───────────────
        // Resolve User from per-org DB using JWT's organizationId
        const orgConn = dbManager.getConnection(String(decoded.organizationId));
        const User = getModel(orgConn, UserDef);
        const user = await User.findById(decoded.userId).select("tokenVersion organizationId isActive");

        if (!user) {
            return next(new Error("Authentication error: User not found"));
        }

        if (!user.isActive) {
            return next(new Error("Authentication error: User inactive"));
        }

        if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
            logger.warn(
                { userId: decoded.userId, event: "SOCKET_TOKEN_VERSION_MISMATCH" },
                "[Socket] Connection rejected: Token version mismatch (session revoked)"
            );
            return next(new Error("Authentication error: Session invalidated"));
        }

        // ── Attach verified context to socket ───────────────────────────
        socket.user = decoded;
        socket.organizationId = decoded.organizationId;

        logger.info(
            { userId: decoded.userId, orgId: decoded.organizationId },
            "[Socket] Authenticated"
        );

        next();
    } catch (err) {
        logger.error({ err: err.message }, "[Socket] Authentication failed");
        next(new Error("Authentication error: Invalid token"));
    }
};

module.exports = socketAuth;
