"use strict";

/**
 * routeGuard.js — Dev-only 404 visibility shim.
 *
 * Mounted globally in non-production. Logs every response that finishes with
 * a 404 so unmatched routes (typoed prefixes, missing /v1, mismounts) are
 * surfaced loudly in dev instead of silently returning "Cannot GET ...".
 *
 * Read-only — never mutates req/res, never short-circuits the chain.
 */
module.exports = function routeGuard(req, res, next) {
    res.on("finish", () => {
        if (res.statusCode === 404) {
            console.warn("ROUTE_NOT_FOUND", {
                method: req.method,
                path: req.originalUrl,
            });
        }
    });
    next();
};
