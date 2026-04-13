/**
 * debugDb.js
 * Middleware — Database Context Debug Logger (DEV ONLY)
 *
 * Logs per-request database context information when ENABLE_DB_DEBUG is true.
 * Zero-cost in production — the flag check exits immediately.
 *
 * Position in middleware chain:
 *   ... → dbContext → debugDb → [route handlers]
 *
 * Requires:
 *   req.organizationId (set by orgProtect)
 *   req.dbConnection (set by dbContext)
 *
 * PLANE: Organization (development tooling)
 */

"use strict";

const ENABLE_DEBUG = process.env.ENABLE_DB_DEBUG === "true";

function debugDb(req, res, next) {
    if (!ENABLE_DEBUG) return next();

    console.log("[DB][REQ]", {
        method: req.method,
        path: req.originalUrl,
        org: req.organizationId || "(none)",
        hasConnection: !!req.dbConnection,
        dbName: req.dbConnection?.name || "(shared)",
    });

    next();
}

module.exports = debugDb;
