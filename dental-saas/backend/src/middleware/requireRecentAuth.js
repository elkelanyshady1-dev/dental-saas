/**
 * requireRecentAuth.js — Recent-Authentication Guard (P3)
 *
 * Blocks high-risk actions unless the user authenticated with credentials
 * within the last `maxAgeMs` window. Defends against the ~15-min access-token
 * replay window that exists between token rotation and natural expiry.
 *
 * The `authTime` claim is stamped on the JWT at the real credential check
 * (login, change-password, smartLogin/selectOrg) and is preserved verbatim
 * across refresh-token rotation — so a rotated access token does NOT reset
 * the timer. A stolen access token replayed >maxAgeMs after the original
 * login fails this gate even though `tokenVersion` and signature are intact.
 *
 * USAGE
 *   const requireRecentAuth = require("../../middleware/requireRecentAuth");
 *
 *   router.post("/users/:id/role",
 *     ...orgProtect,
 *     requireOrgPermission(P.STAFF_MANAGE),
 *     requireRecentAuth(5 * 60 * 1000),   // 5 minutes
 *     assignRole
 *   );
 *
 * PLANE: Org. Safe to apply on Platform too — reads decoded.authTime only.
 */

"use strict";

const logger = require("../utils/logger");

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

function requireRecentAuth(maxAgeMs = DEFAULT_MAX_AGE_MS) {
    if (typeof maxAgeMs !== "number" || maxAgeMs <= 0) {
        throw new Error(`[requireRecentAuth] Invalid maxAgeMs: ${maxAgeMs}`);
    }

    return function recentAuthGuard(req, res, next) {
        const authTime = req.user?.authTime ?? req.context?.authTime ?? null;

        if (!authTime || typeof authTime !== "number") {
            logger.warn({
                event: "REAUTH_REQUIRED",
                reason: "missing_auth_time",
                userId: req.user?._id,
                requestId: req.requestId,
                path: req.originalUrl,
            }, "[requireRecentAuth] No authTime on token — forcing re-auth");

            return res.status(401).json({
                success: false,
                error: {
                    code: "REAUTH_REQUIRED",
                    message: "Please re-authenticate for this action.",
                },
            });
        }

        const age = Date.now() - authTime;
        if (age > maxAgeMs) {
            logger.info({
                event: "REAUTH_REQUIRED",
                reason: "stale_auth_time",
                userId: req.user?._id,
                ageMs: age,
                maxAgeMs,
                requestId: req.requestId,
                path: req.originalUrl,
            }, "[requireRecentAuth] Auth older than maxAgeMs — forcing re-auth");

            return res.status(401).json({
                success: false,
                error: {
                    code: "REAUTH_REQUIRED",
                    message: "Please re-authenticate for this action.",
                },
            });
        }

        next();
    };
}

module.exports = requireRecentAuth;
