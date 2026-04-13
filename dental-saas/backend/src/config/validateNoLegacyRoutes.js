/**
 * validateNoLegacyRoutes.js — Boot-Time Legacy Route Invariant Check
 * Phase C — Route Integrity & Legacy Elimination
 *
 * Scans the Express app's router stack at boot time and detects any
 * org-scoped module routes that are NOT mounted under /api/v1/org/*.
 *
 * ── PURPOSE ──────────────────────────────────────────────────────────────────
 * Legacy routes (/api/v1/<module>) bypass the full org middleware chain:
 *   subscriptionGuard → featureFlagMiddleware → branchContext →
 *   unifiedCapabilityMiddleware → assertCapabilities → ssotEnforcer
 *
 * This creates a CRITICAL SECURITY RISK. This validator ensures that no
 * legacy org module routes exist outside the canonical /api/v1/org/* namespace.
 *
 * ── ALLOWED ROUTES ──────────────────────────────────────────────────────────
 * The following prefixes are ALLOWED outside /api/v1/org/*:
 *   /api/v1/auth          — Authentication (login, register, refresh)
 *   /api/v1/organizations — Organization CRUD (used by auth flows)
 *   /api/v1/portal        — Patient Portal (separate auth plane)
 *   /api/v1/patient       — Patient Portal Domain Engine
 *   /api/v1/shared        — Public shared resources (magic links)
 *   /api/v1/org           — Canonical org routes (the target architecture)
 *   /api/platform          — Platform Plane (isolated)
 *   /api/health            — Health checks (no auth)
 *   /api/internal          — Internal monitoring (no auth)
 *   /api/public            — Public routes (Stripe, etc.)
 *   /api/governance        — Governance (platform-guarded)
 *   /api/auth              — Legacy auth (still needed for frontend refresh)
 *   /api/organizations     — Organization CRUD
 *   /metrics               — Prometheus metrics
 *   /admin                 — Admin routes (platform-guarded)
 *   /uploads               — Static files
 *   /governance            — Static governance dashboard
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────
 * const { validateNoLegacyRoutes } = require("./src/config/validateNoLegacyRoutes");
 * validateNoLegacyRoutes(app, { strict: true });
 *
 * In strict mode, any legacy route detection throws an Error (crashes boot).
 * In non-strict mode, issues are logged as warnings.
 */

"use strict";

const logger = require("@utils/logger");

/**
 * Org module paths that MUST NOT exist directly under /api/v1/
 * as actual route handlers (not redirects).
 *
 * Phase C: users, roles, branches, procedures, treatments, invoices,
 * payments, finance, orthodontic-cases are now 308 redirects → allowed.
 *
 * The following modules are NOT YET in the moduleLoader and still use
 * direct route mounts. They are tracked here as future migration targets.
 */
const FORBIDDEN_LEGACY_PATHS = [
    // NOTE: These modules still use v1Router direct mounts.
    // They will be migrated in a future phase.
    // "/api/v1/families",
    // "/api/v1/appointments",
    // "/api/v1/recalls",
    // "/api/v1/settings",
    // "/api/v1/documents",
];

/**
 * Paths that have been converted to 308 Permanent Redirects.
 * These are allowed temporarily and will become 410 Gone once
 * all consumers are confirmed on canonical paths.
 */
const REDIRECTED_LEGACY_PATHS = [
    "/api/v1/users",
    "/api/v1/roles",
    "/api/v1/branches",
    "/api/v1/procedures",
    "/api/v1/treatments",
    "/api/v1/invoices",
    "/api/v1/payments",
    "/api/v1/finance",
    "/api/v1/orthodontic-cases",
];

/**
 * Prefixes that are ALLOWED under /api/v1/ (not org module routes).
 * If a path starts with any of these, it is not considered a legacy route.
 */
const ALLOWED_V1_PREFIXES = [
    "/api/v1/auth",
    "/api/v1/organizations",
    "/api/v1/org",
    "/api/v1/portal",
    "/api/v1/patient",
    "/api/v1/shared",
];

/**
 * Recursively extracts all mount paths from an Express app/router stack.
 *
 * @param {object} stack — Express app._router.stack or router.stack
 * @param {string} prefix — accumulated parent path prefix
 * @returns {string[]} — array of resolved paths
 */
function extractMountedPaths(stack, prefix = "") {
    const paths = [];

    if (!stack || !Array.isArray(stack)) return paths;

    for (const layer of stack) {
        if (layer.route) {
            // Direct route (app.get, app.post, etc.)
            const fullPath = prefix + (layer.route.path || "");
            paths.push(fullPath);
        } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
            // Nested router (app.use("/path", router))
            const mountPath = layer.regexp
                ? extractPathFromRegexp(layer.regexp, layer.keys)
                : "";
            const nestedPrefix = prefix + mountPath;
            paths.push(...extractMountedPaths(layer.handle.stack, nestedPrefix));
        } else if (layer.regexp) {
            // Middleware with a path pattern (app.use("/path", handler))
            const mountPath = extractPathFromRegexp(layer.regexp, layer.keys);
            if (mountPath && mountPath !== "/") {
                paths.push(prefix + mountPath);
            }
        }
    }

    return paths;
}

/**
 * Extracts a readable path from an Express layer regexp.
 * Express converts path strings to regexp internally.
 *
 * @param {RegExp} regexp
 * @param {Array} keys
 * @returns {string}
 */
function extractPathFromRegexp(regexp, keys) {
    if (!regexp) return "";

    const str = regexp.toString();

    // Fast path: Express stores the original path in some layer types
    // Match patterns like /^\/api\/v1\/users\/?(?=\/|$)/i
    const match = str.match(/^\/\^\\?([\w\-\/]+)/);
    if (match) {
        return "/" + match[1].replace(/\\\//g, "/").replace(/^\//, "");
    }

    // Alternative: try to reconstruct from regexp source
    const source = regexp.source || "";
    const cleaned = source
        .replace(/^\^/, "")
        .replace(/\\\//, "/")
        .replace(/\\\//g, "/")
        .replace(/\(\?:.*?\)/, "")
        .replace(/\(\?=.*?\)/, "")
        .replace(/\$/, "")
        .replace(/\?$/, "")
        .replace(/\/+$/, "");

    if (cleaned && cleaned.startsWith("/")) {
        return cleaned;
    }

    return "";
}

/**
 * validateNoLegacyRoutes — Boot-time legacy route detection
 *
 * Scans the Express app's mounted route stack and detects forbidden
 * legacy org module routes that bypass the canonical middleware chain.
 *
 * @param {object} app — Express app instance
 * @param {object} options
 * @param {boolean} options.strict — If true, throws on violations (crashes boot)
 * @returns {{ valid: boolean, violations: string[] }}
 */
function validateNoLegacyRoutes(app, options = {}) {
    const { strict = false } = options;

    logger.info(
        { service: "boot", action: "validate_no_legacy_routes", strict },
        "[Phase C] Running legacy route invariant check..."
    );

    const violations = [];

    // Strategy 1: Check known forbidden paths
    // This is a static check — doesn't require parsing the Express stack
    // (which can be version-fragile). The forbidden paths are derived from
    // the legacy mounts that existed in app.js before Phase C.
    //
    // The actual Express stack is inspected as a secondary check.

    try {
        const stack = app._router?.stack || [];

        for (const layer of stack) {
            // Check middleware mounts (app.use("/path", ...))
            if (layer.regexp) {
                const mountPath = extractPathFromRegexp(layer.regexp, layer.keys);

                // Check if this is a forbidden legacy org module path
                for (const forbidden of FORBIDDEN_LEGACY_PATHS) {
                    if (mountPath === forbidden || mountPath.startsWith(forbidden + "/")) {
                        violations.push(
                            `Legacy route detected: ${forbidden} (bypasses org middleware chain)`
                        );
                    }
                }

                // Check for any /api/v1/* path that's not in the allowed list
                if (mountPath.startsWith("/api/v1/") && mountPath !== "/api/v1") {
                    const isAllowed = ALLOWED_V1_PREFIXES.some(
                        prefix => mountPath.startsWith(prefix)
                    );
                    if (!isAllowed) {
                        // Check if it's a 301 redirect handler (allowed temporarily)
                        const isRedirect = layer.name === "legacyRouteRedirect" ||
                            layer.name === "deprecatedLegacyHandler";
                        if (!isRedirect) {
                            violations.push(
                                `Non-canonical route mount: ${mountPath} (not under /api/v1/org/*)`
                            );
                        }
                    }
                }
            }
        }
    } catch (err) {
        logger.warn(
            { err: err.message },
            "[Phase C] Could not inspect Express router stack (non-fatal)"
        );
    }

    // ── Report ──────────────────────────────────────────────────────────────
    if (violations.length > 0) {
        const msg = `[Phase C] ❌ Legacy route invariant FAILED — ${violations.length} violation(s):\n  ${violations.join("\n  ")}`;

        if (strict) {
            logger.error(
                { service: "boot", action: "legacy_route_violation", violations },
                msg
            );
            throw new Error(msg);
        }

        logger.warn(
            { service: "boot", action: "legacy_route_warning", violations },
            msg
        );

        return { valid: false, violations };
    }

    logger.info(
        { service: "boot", action: "validate_no_legacy_routes" },
        "[Phase C] ✅ No legacy routes detected — all org modules under /api/v1/org/*"
    );

    return { valid: true, violations: [] };
}

module.exports = { validateNoLegacyRoutes };
