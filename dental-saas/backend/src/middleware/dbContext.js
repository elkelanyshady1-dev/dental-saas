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
 *   req.dbConnection — Mongoose Connection for the org's tenant database
 *
 * Step 5d — cluster layer is the ONLY tenant resolution path. Flow:
 *   orgId → clusterForOrg (cached, platform-DB-backed on miss)
 *         → clusterConnections.getSync(clusterKey)
 *         → clusterRoot.useDb("dental_org_<orgId>")
 * authMiddleware usually binds this connection earlier in the chain; this
 * middleware handles the remaining routes that enter without full auth
 * (e.g., tests, internal probes).
 *
 * PLANE: Organization (applied only to org routes)
 */

"use strict";

const ENABLE_DEBUG = process.env.ENABLE_DB_DEBUG === "true";

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

        // authMiddleware already bound the connection — reuse.
        if (req._dbConnectionBoundByAuth && req.dbConnection) {
            return next();
        }

        // Cluster-aware resolution (Step 5d default).
        const { clusterForOrg } = require("@core/db/clusterForOrg");
        const clusterConnections = require("@core/db/clusterConnections");
        const clusterKey = await clusterForOrg(String(orgId));
        const clusterRoot = clusterConnections.getSync(clusterKey);
        req.dbConnection = clusterRoot.useDb(`dental_org_${orgId}`, {
            useCache: true,
            noListener: true,
        });
        req._clusterKey = clusterKey;
        req._dbViaCluster = true;

        if (ENABLE_DEBUG) {
            console.log("Using DB:", req.dbConnection.name, "via cluster:", clusterKey);
        }

        return next();
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
