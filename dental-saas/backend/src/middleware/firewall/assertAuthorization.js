/**
 * assertAuthorization.js — RBAC Firewall Guard (BLOCKING)
 *
 * Detects controllers that skip the authorize() call entirely.
 * Works in tandem with the `permissionChecked` flag set by authorize().
 *
 * Mount: As a response-interceptor (monkey-patches res.json).
 * Must be applied BEFORE orgV1Routes so it wraps all controller responses.
 *
 * Behaviour (RBAC Audit P3 — upgraded from detection-only to blocking):
 *   - Exempt routes (/health, /ready, /public/) pass through unchanged
 *   - Non-exempt routes: if authorize() was NOT called before a 2xx response,
 *     the response is BLOCKED with 500 AUTHORIZATION_NOT_EXECUTED
 *   - DEV: additionally writes to stderr for console visibility
 *
 * PLANE: Org only.
 */

"use strict";

const logger = require("@utils/logger");

// Routes that legitimately skip authorize() (health, readiness, public).
const EXEMPT_PATTERNS = [
    "/health",
    "/ready",
    "/public/",
    "/shared/",     // Public token-gated routes (ortho case sharing)
];

function assertAuthorization(req, res, next) {
    const originalJson = res.json.bind(res);

    res.json = function firewallAuthJson(body) {
        // Only flag successful responses from non-exempt org routes
        const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
        const isExempt = EXEMPT_PATTERNS.some(p => req.originalUrl.includes(p));

        if (isSuccess && !isExempt && !req.context?._permissionChecked) {
            const violation = {
                event: "FIREWALL_RBAC_BYPASS",
                path: req.originalUrl,
                method: req.method,
                userId: req.context?.userId,
                statusCode: res.statusCode,
            };

            logger.error(violation,
                `[FIREWALL] authorize() was NOT called before response on ${req.method} ${req.originalUrl}`);

            if (process.env.NODE_ENV !== "production" && process.stderr?.write) {
                process.stderr.write(
                    `\n\x1b[31m[FIREWALL:RBAC]\x1b[0m authorize() skipped on ${req.method} ${req.originalUrl}\n`
                );
            }

            // BLOCKING: Replace the original successful response with 500
            res.statusCode = 500;
            return originalJson({
                success: false,
                error: {
                    code: "AUTHORIZATION_NOT_EXECUTED",
                    message: "Internal authorization check was not performed.",
                },
            });
        }

        return originalJson(body);
    };

    next();
}

module.exports = assertAuthorization;
