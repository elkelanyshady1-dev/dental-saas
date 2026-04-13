/**
 * supervisorProtect.js — Supervisor Plane Authentication Guard
 *
 * Verifies supervisor JWT, hydrates supervisor user from DB,
 * and attaches `req.supervisor` for downstream use.
 *
 * This middleware is the ENTRY GATE for the supervisor plane.
 * It ensures complete plane isolation — only supervisor tokens are accepted.
 *
 * PLANE: Supervisor only.
 * SENTINEL: No org context is loaded. No organizationId is set.
 */

"use strict";

const SupervisorUserDef = require("../models/SupervisorUser");
const getModel = require("../../../core/db/getModel");
const { getPlatformConnection } = require("../../../core/db/dbResolver");
const { verifySupervisorToken } = require("../utils/supervisorAuth.utils");
const logger = require("@utils/logger");

/**
 * supervisorProtect middleware
 *
 * 1. Extract Bearer token from Authorization header
 * 2. Verify JWT with supervisor-specific secret
 * 3. Validate token type === "supervisor"
 * 4. Hydrate supervisor user from DB
 * 5. Validate token version (logout-all support)
 * 6. Attach req.supervisor
 */
async function supervisorProtect(req, res, next) {
    try {
        // ─── Extract Token ──────────────────────────────────────────────
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                error: "Authentication required",
                code: "SUPERVISOR_AUTH_MISSING",
            });
        }

        const token = authHeader.split(" ")[1];
        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Invalid authorization header",
                code: "SUPERVISOR_TOKEN_MISSING",
            });
        }

        // ─── Verify JWT ─────────────────────────────────────────────────
        let decoded;
        try {
            decoded = verifySupervisorToken(token);
        } catch (jwtError) {
            const code = jwtError.name === "TokenExpiredError"
                ? "SUPERVISOR_TOKEN_EXPIRED"
                : "SUPERVISOR_TOKEN_INVALID";

            logger.warn({
                event: "SUPERVISOR_AUTH_FAILED",
                reason: jwtError.message,
                code,
            });

            return res.status(401).json({
                success: false,
                error: jwtError.name === "TokenExpiredError"
                    ? "Token expired"
                    : "Invalid token",
                code,
            });
        }

        // ─── Plane Isolation Check ──────────────────────────────────────
        if (decoded.type !== "supervisor") {
            logger.warn({
                event: "SUPERVISOR_PLANE_VIOLATION",
                tokenType: decoded.type,
                supervisorId: decoded.supervisorId,
            });

            return res.status(403).json({
                success: false,
                error: "Invalid token type for supervisor plane",
                code: "SUPERVISOR_PLANE_MISMATCH",
            });
        }

        // ─── Hydrate Supervisor ─────────────────────────────────────────
        const SupervisorUser = getModel(getPlatformConnection(), SupervisorUserDef);
        // @rls-supervisor-plane — separate auth model, no org-scoped req context
        const supervisor = await SupervisorUser.findById(decoded.supervisorId)
            .select("+password")
            .lean();

        if (!supervisor) {
            return res.status(401).json({
                success: false,
                error: "Supervisor account not found",
                code: "SUPERVISOR_NOT_FOUND",
            });
        }

        if (!supervisor.isActive) {
            return res.status(403).json({
                success: false,
                error: "Supervisor account deactivated",
                code: "SUPERVISOR_DEACTIVATED",
            });
        }

        // ─── Account Lock Check ─────────────────────────────────────────
        if (supervisor.accountLockedUntil && supervisor.accountLockedUntil > new Date()) {
            return res.status(423).json({
                success: false,
                error: "Account temporarily locked",
                code: "SUPERVISOR_ACCOUNT_LOCKED",
            });
        }

        // ─── Token Version Check ────────────────────────────────────────
        if (typeof decoded.tokenVersion === "number" &&
            decoded.tokenVersion !== supervisor.tokenVersion) {
            logger.warn({
                event: "SUPERVISOR_TOKEN_VERSION_STALE",
                supervisorId: supervisor._id,
                tokenVersion: decoded.tokenVersion,
                currentVersion: supervisor.tokenVersion,
            });

            return res.status(401).json({
                success: false,
                error: "Token invalidated — please re-authenticate",
                code: "SUPERVISOR_TOKEN_STALE",
            });
        }

        // ─── Attach to Request ──────────────────────────────────────────
        // Remove password from attached object
        const { password, ...supervisorSafe } = supervisor;
        req.supervisor = {
            ...supervisorSafe,
            supervisorId: supervisor._id.toString(),
        };

        next();
    } catch (error) {
        logger.error({
            event: "SUPERVISOR_AUTH_ERROR",
            error: error.message,
        });

        return res.status(500).json({
            success: false,
            error: "Authentication error",
            code: "SUPERVISOR_AUTH_ERROR",
        });
    }
}

module.exports = supervisorProtect;
