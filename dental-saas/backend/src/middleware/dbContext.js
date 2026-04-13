/**
 * dbContext.js
 * Middleware — Database Connection Context Injector
 *
 * Resolves the correct database connection for the current organization
 * and injects it as req.dbConnection.
 *
 * Position in middleware chain:
 *   authMiddleware → orgProtect → organizationContext → dbContext → rlsContext
 *
 * Requires:
 *   req.organizationId (set by orgProtect from the JWT)
 *
 * Sets:
 *   req.dbConnection — Mongoose Connection for the org's database
 *
 * Behavior by mode:
 *   DB_MODE=shared   → req.dbConnection = mongoose.connection (no-op equivalent)
 *   DB_MODE=hybrid   → req.dbConnection = org-specific or shared connection
 *   DB_MODE=per-org  → req.dbConnection = org-specific connection
 *
 * CONNECTION LIFECYCLE (Phase 3.3):
 *   1. getConnection() increments inUseCount (protects from eviction)
 *   2. res.on("finish") / res.on("close") calls releaseConnection()
 *   3. This ensures connections are released when the HTTP response completes,
 *      even if the handler throws or the client disconnects.
 *
 *   WHY: Without this, connections would stay permanently "in-use"
 *   and could never be evicted, leading to connection pool exhaustion.
 *
 * Safety (Phase 2.5):
 *   - Rejects 400 if organizationId is missing (prevents silent null-connection)
 *   - Catches resolution errors and returns 500 with structured error
 *   - Logs failures via logger for traceability
 *
 * PLANE: Organization (applied only to org routes)
 */

"use strict";

const { resolveConnection, getOrgConnection } = require("@core/db/dbResolver");
const dbManager = require("@core/db/dbManager");

const ENABLE_DEBUG = process.env.ENABLE_DB_DEBUG === "true";

/**
 * dbContext middleware
 * Injects req.dbConnection resolved from the organization's ID.
 * Automatically releases the connection when the response finishes.
 */
async function dbContext(req, res, next) {
    try {
        const orgId = req.organizationId || req.context?.organizationId;

        if (!orgId) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "ORG_CONTEXT_MISSING",
                    message: "Organization context required before DB resolution",
                },
            });
        }

        // ─── Phase P0: Reuse auth-bound connection ──────────────────────
        // If authMiddleware already resolved and bound the per-org connection
        // (via dbManager.getConnection), reuse it. The connection's inUseCount
        // was already incremented by authMiddleware, so we only need to
        // register the release handler.
        if (req._dbConnectionBoundByAuth && req.dbConnection) {
            // Still register the release handler (auth doesn't do this)
            let released = false;
            const release = () => {
                if (released) return;
                released = true;
                dbManager.releaseConnection(orgId);
            };
            res.on("finish", release);
            res.on("close", release);
            return next();
        }

        // resolveConnection delegates to dbManager.getConnection internally.
        // dbManager increments inUseCount on cache hit/creation.
        req.dbConnection = resolveConnection(orgId);

        // ─── Debug: log bound database name ─────────────────────────────
        if (ENABLE_DEBUG) {
            console.log("Using DB:", req.dbConnection.name);
        }

        // ─── Lifecycle: auto-release on response completion ─────────────
        // WHY: getConnection() increments inUseCount to protect connections
        // from eviction during request processing. We MUST decrement it when
        // the response is done, otherwise the connection leaks (stays permanently
        // marked "in-use" and can never be evicted or reused efficiently).
        //
        // We listen on BOTH "finish" and "close":
        //   - "finish" fires when the response has been fully flushed
        //   - "close" fires when the connection is terminated prematurely
        //     (e.g., client disconnect, timeout)
        // Using a flag ensures we only release once even if both events fire.
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            dbManager.releaseConnection(orgId);
        };

        res.on("finish", release);
        res.on("close", release);

        next();
    } catch (err) {
        const logger = require("@utils/logger");
        logger.error(
            { err: err.message, organizationId: req.organizationId },
            "[dbContext] Failed to resolve database connection"
        );

        return res.status(500).json({
            success: false,
            error: {
                code: "DB_CONTEXT_ERROR",
                message: "Failed to resolve database connection",
            },
        });
    }
}

module.exports = dbContext;
