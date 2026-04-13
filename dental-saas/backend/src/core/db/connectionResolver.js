/**
 * connectionResolver.js
 * Core Infrastructure — Background Worker Connection Resolver
 *
 * Provides a unified API for background workers, event subscribers,
 * and async processors that need to resolve a tenant database connection
 * WITHOUT an HTTP request context (no req.dbConnection available).
 *
 * ARCHITECTURE (Phase 3.4 — Performance Optimized):
 *   Delegates to dbManager.getConnectionAsync() for background paths.
 *   This uses dedup + semaphore throttling to prevent connection storms
 *   when multiple workers/events fire for the same org simultaneously.
 *
 *   For synchronous callers (rare), falls back to getConnection().
 *
 * MODE: PER-ORG ONLY
 *   resolveOrgConnection() ALWAYS returns a real per-org connection.
 *   Never returns null. Throws if organizationId is missing or
 *   connection creation fails.
 *
 * Usage:
 *   const { resolveOrgConnection } = require("@core/db/connectionResolver");
 *   const connection = await resolveOrgConnection(organizationId);
 *   const Model = getModel(connection, ModelDef);
 *
 * PLANE: Core Infrastructure
 * Phase 3.4 — Async dedup + throttling via dbManager.
 */

"use strict";

const dbManager = require("./dbManager");
const logger = require("@utils/logger");

/**
 * resolveOrgConnection
 * Resolves the correct database connection for a given organization ID.
 *
 * Phase 3.4: Now uses getConnectionAsync() which provides:
 *   - Connection dedup (multiple callers for same org share one creation)
 *   - Semaphore throttling (prevents CPU spikes during burst)
 *   - Health checks (validates readyState before cache reuse)
 *
 * STRICT MODE: Always returns a real per-org connection.
 * Never returns null. Throws if organizationId is missing or
 * connection resolution fails.
 *
 * @param {string} organizationId — The organization ID to resolve (REQUIRED)
 * @returns {Promise<mongoose.Connection>} — The resolved per-org connection (never null)
 * @throws {Error} — If organizationId is missing or connection fails
 */
async function resolveOrgConnection(organizationId) {
    if (!organizationId) {
        const err = new Error(
            "[ConnectionResolver] resolveOrgConnection called without organizationId — " +
            "per-org mode requires an explicit organization ID"
        );
        logger.error({ source: "connectionResolver" }, err.message);
        throw err;
    }

    // Phase 3.4: Use async variant with dedup + throttling.
    // Background workers benefit most from dedup since they often
    // fire in bursts (e.g., batch events for the same org).
    return dbManager.getConnectionAsync(organizationId);
}

/**
 * resolveOrgConnectionSync
 * Synchronous variant for callers that cannot use async/await.
 *
 * Uses dbManager.getConnection() directly (no dedup, no throttle).
 * Prefer resolveOrgConnection() (async) whenever possible.
 *
 * @param {string} organizationId
 * @returns {mongoose.Connection}
 * @throws {Error}
 */
function resolveOrgConnectionSync(organizationId) {
    if (!organizationId) {
        const err = new Error(
            "[ConnectionResolver] resolveOrgConnectionSync called without organizationId"
        );
        logger.error({ source: "connectionResolver" }, err.message);
        throw err;
    }

    return dbManager.getConnection(organizationId);
}

/**
 * resolveModelForOrg
 * Convenience: resolves a connection and returns the bound model in one call.
 *
 * STRICT MODE: Always returns a connection-bound model.
 * Never falls back to modelDef.default.
 *
 * @param {string} organizationId
 * @param {Object} modelDef — Canonical model definition { modelName, schema, default }
 * @returns {Promise<mongoose.Model>} — Connection-bound model
 * @throws {Error} — If organizationId is missing or connection fails
 */
async function resolveModelForOrg(organizationId, modelDef) {
    const getModel = require("./getModel");
    const connection = await resolveOrgConnection(organizationId);
    return getModel(connection, modelDef);
}

module.exports = {
    resolveOrgConnection,
    resolveOrgConnectionSync,
    resolveModelForOrg,
};
