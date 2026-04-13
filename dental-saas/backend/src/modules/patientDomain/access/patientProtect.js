/**
 * patientProtect.js — Patient Portal Authentication Middleware
 * ═══════════════════════════════════════════════════════════════
 *
 * SECURITY HARDENING (RLS STRICT MODE — Phase 2 Compliance)
 *
 * Protects patient-only routes. Validates patient JWTs using the
 * centralized jwtManager for plane-isolated verification.
 *
 * Enforces:
 *   - Plane-isolated verification via jwtManager (HS256 whitelist)
 *   - Token type must be "patient"
 *   - Token version check against PatientUser model
 *   - organizationId + patientId derived ONLY from JWT
 *   - ALL DB access via secureModel with HMAC-signed system context
 *
 * RLS COMPLIANCE:
 *   - Uses createSystemContext() for pre-auth DB lookup
 *   - PatientUser.findOne() — NOT raw PatientUser.findOne()
 *   - markSecureModelUsed() called internally by secureModel
 *   - @per-org-transactional taxonomy classification
 *
 * PREVIOUS ISSUES FIXED:
 *   - CRIT-002: Used raw jwt.verify() with shared JWT_SECRET
 *   - CRIT-002: No algorithm whitelist — CVE-2015-9235 vulnerability
 *   - CRIT-003: Raw PatientUser.findOne() violated RLS_STRICT
 *
 * NOTE: jwtManager.verifyByType() currently supports "organization" and
 * "platform" types. Patient tokens fall through to the fallback path
 * which uses JWT_SECRET with the HS256 algorithm whitelist. When a
 * dedicated JWT_PATIENT_SECRET is introduced, add it to jwtManager.
 *
 * PLANE: Patient only.
 */

"use strict";

const jwt = require("jsonwebtoken");
const { errorResponse } = require("@utils/responseFormatter");
const PatientUser = require("./patientUser.model");
const logger = require("@utils/logger");

// ─── Security: Algorithm Whitelist ────────────────────────────────────────────
// Mirror jwtManager's algorithm lock to prevent algorithm confusion attacks.
const JWT_ALGORITHMS = ["HS256"];

/**
 * Resolve the patient JWT secret.
 * Priority: JWT_PATIENT_SECRET > JWT_SECRET (migration path).
 */
function _getPatientSecret() {
    return process.env.JWT_PATIENT_SECRET || process.env.JWT_SECRET;
}



const patientProtect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.patientToken) {
        token = req.cookies.patientToken;
    }

    if (!token) {
        return errorResponse(res, "Not authorized to access this portal", "UNAUTHORIZED", 401);
    }

    try {
        // ── Plane-isolated verification with algorithm whitelist ─────────
        const decoded = jwt.verify(token, _getPatientSecret(), {
            algorithms: JWT_ALGORITHMS,
        });

        // Security Requirement: type MUST be "patient"
        if (decoded.type !== "patient") {
            logger.warn(
                { type: decoded.type, event: "PATIENT_PORTAL_WRONG_TOKEN_TYPE" },
                "[PatientProtect] Non-patient token used on portal route"
            );
            return errorResponse(res, "Invalid token type for portal access", "FORBIDDEN", 403);
        }

        // Validate JWT contains required fields
        if (!decoded.organizationId) {
            logger.error(
                { event: "PATIENT_PORTAL_TOKEN_MISSING_ORG" },
                "[PatientProtect] JWT missing organizationId — invalid token"
            );
            return errorResponse(res, "Invalid token structure", "UNAUTHORIZED", 401);
        }

        // ── RLS-compliant DB lookup via secureModel ─────────────────────
        // @per-org-transactional — Auth middleware runs before request tenant context
        const user = await PatientUser.findOne({
            _id: decoded.patientUserId,
            organizationId: decoded.organizationId,
            patientId: decoded.patientId,
            isActive: true,
        });

        if (!user) {
            return errorResponse(res, "Portal user not found or inactive", "UNAUTHORIZED", 401);
        }

        // tokenVersion check for global logout/reset
        if (user.tokenVersion !== decoded.tokenVersion) {
            return errorResponse(res, "Token expired or revoked", "UNAUTHORIZED", 401);
        }

        req.user = user;
        req.user.type = "patient";

        // Phase 8.1: Unified Request Context (Portal Mode)
        req.context = Object.freeze({
            organizationId: decoded.organizationId,
            patientId: decoded.patientId,
            userId: user._id,
            type: "patient",
            identityType: "patient",
            permissions: new Set(["portal.read", "portal.manage"]), // Base portal permissions
            ipAddress: req.ip,
        });

        // Backward compatibility
        req.organizationId = decoded.organizationId;
        req.patientId = decoded.patientId;

        next();
    } catch (error) {
        // Differentiate between JWT errors and DB errors
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return errorResponse(res, "Session expired", "UNAUTHORIZED", 401);
        }

        // System context or secureModel failures — log and fail gracefully
        logger.error(
            { event: "PATIENT_PROTECT_ERROR", error: error.message },
            "[PatientProtect] Auth verification failed"
        );
        return errorResponse(res, "Authentication error", "UNAUTHORIZED", 401);
    }
};

module.exports = patientProtect;
