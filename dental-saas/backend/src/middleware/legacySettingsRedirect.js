/**
 * legacySettingsRedirect.js — Legacy Settings Domain Route Redirector
 *
 * Phase H.3 — Settings Hub Canonicalization
 *
 * REDIRECT TABLE:
 *   /api/v1/org/security/*       → /api/v1/org/settings/security/*   (307)
 *   /api/v1/org/features-control/* → /api/v1/org/settings/features/*  (307)
 *
 * WHY 307 (not 308):
 *   307 Temporary Redirect preserves the HTTP method (safe for GET, POST, PATCH).
 *   Use 308 Permanent only after confirming all API consumers have migrated.
 *   This matches the project's existing pattern in app.js (legacyRouteRedirect uses 308).
 *   Settings redirects remain 307 until Phase H.4 confirms full API client migration.
 *
 * PLACEMENT:
 *   Must be mounted on v1Router BEFORE the /org route mount order allows moduleLoader
 *   to serve /org/security. In Express, router.use() is FIFO — the redirect must
 *   come before v1Router.use('/org', ..., orgV1Routes).
 *
 *   ACTUAL placement: mounted in app.js as v1Router.use('/org/security', ...) and
 *   v1Router.use('/org/features-control', ...) using the legacyRouteRedirect pattern
 *   that already exists in the codebase.
 *
 * SECURITY:
 *   - No auth bypass — redirect is transparent (client re-sends with full headers)
 *   - No business logic — purely routing
 *   - Logged at WARN level for observability
 *
 * PLANE: Org only (URLs are /org/*)
 */

"use strict";

const logger = require("../utils/logger");

/**
 * legacySettingsRedirect
 *
 * Express middleware that intercepts requests to old settings paths
 * and issues 307 redirects to the canonical /settings/* counterparts.
 *
 * Mount order in app.js:
 *   v1Router.use('/org/security', legacySettingsRedirect);         // BEFORE orgV1Routes
 *   v1Router.use('/org/features-control', legacySettingsRedirect); // BEFORE orgV1Routes
 *
 * @param {string} canonicalBase — The canonical target base (e.g. '/api/v1/org/settings/security')
 * @returns {Function} Express middleware
 */
function createLegacySettingsRedirect(canonicalBase) {
    return function legacySettingsRedirect(req, res) {
        const suffix = req.url === "/" ? "" : (req.url || "");
        const target = canonicalBase + suffix;

        logger.warn({
            event: "LEGACY_SETTINGS_REDIRECT",
            from: req.originalUrl,
            to: target,
            method: req.method,
            ip: req.ip,
            phase: "H.3",
        }, `[H.3] Legacy settings route redirected: ${req.originalUrl} → ${target}`);

        // 307 preserves HTTP method across redirect (safe for GET, POST, PATCH)
        res.redirect(307, target);
    };
}

module.exports = { createLegacySettingsRedirect };
