/**
 * dbResolver.js
 * Core Database Connection Resolver — Multi-Tenancy Layer
 *
 * Resolves the correct Mongoose connection for a given organization.
 * Acts as the public API that middleware (dbContext) and services use.
 *
 * ARCHITECTURE (Phase 3.3 — Per-Org STRICT):
 *   This module DELEGATES all connection lifecycle to dbManager.js.
 *   dbManager owns the cache, eviction, concurrency, and shutdown.
 *   dbResolver remains the stable public interface for backward compat.
 *
 * MODE: PER-ORG ONLY
 *   resolveConnection() ALWAYS returns a per-org connection.
 *   Never returns null. Never falls back to mongoose.connection.
 *   Throws if orgId is missing or connection cannot be created.
 *
 * PLANE: Core Infrastructure (used by both Platform & Org)
 */

"use strict";

const mongoose = require("mongoose");
const dbManager = require("./dbManager");
const { buildDbName } = require("./connectionFactory");

const DB_MODE = dbManager.DB_MODE;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * resolveConnection
 * Returns the per-org Mongoose connection for the given organization.
 *
 * STRICT MODE: Always returns a real per-org connection.
 * Never returns null. Never falls back to mongoose.connection.
 * Throws if orgId is missing or connection resolution fails.
 *
 * @param {string} orgId - Organization _id (REQUIRED)
 * @returns {mongoose.Connection} — per-org connection (never null)
 * @throws {Error} — If orgId is missing or connection creation fails
 */
function resolveConnection(orgId) {
    // Delegate to dbManager — it handles caching, metrics, concurrency
    // In per-org mode, getConnection() always returns a real connection or throws
    return dbManager.getConnection(orgId);
}

/**
 * getPlatformConnection
 * Returns the platform Mongoose connection.
 *
 * 3-Layer Rollout (Step 5a):
 *   Returns the dedicated `platformConnection` sibling (from platformConnection.js)
 *   when initialized. Falls back to the legacy `mongoose.connection` root while
 *   the sibling is still booting. Day-1 both resolve to the same Mongo URI so
 *   there is no behavioral change; the swap lets us move platform collections
 *   off the global root progressively.
 *
 * Platform-plane code (Guardian, billing, provisioning) must ALWAYS
 * use this function — never mongoose.connection directly in new code.
 *
 * @returns {mongoose.Connection}
 */
function getPlatformConnection() {
    try {
        const platformConnection = require("./platformConnection");
        if (platformConnection.isReady()) {
            return platformConnection.get();
        }
    } catch (_) {
        // Fall through to legacy if sibling not yet initialized at require time.
    }
    return mongoose.connection;
}

/**
 * resolveOrgDbName
 * Returns the per-org database name for a given organization.
 * Convention: dental_org_<orgId>
 *
 * This is a pure function — no side effects, no connections.
 * Used by provisioning, migrations, and diagnostic tooling
 * that need to know the DB name without opening a connection.
 *
 * @param {string} orgId — Organization _id
 * @returns {string} — Database name (e.g., "dental_org_abc123")
 */
function resolveOrgDbName(orgId) {
    if (!orgId) {
        throw new Error("[dbResolver] orgId is required for DB name resolution");
    }
    return buildDbName(orgId);
}

/**
 * getOrgConnection
 * High-level convenience alias for resolveConnection.
 *
 * Returns the per-org Mongoose connection for the given organization.
 * The connection is created lazily on first use (via mongoose.connection.useDb)
 * and cached by dbManager with LRU eviction, health checks, and circuit breakers.
 *
 * MongoDB auto-creates the database on first write — no explicit create needed.
 *
 * @param {string} orgId — Organization _id (REQUIRED)
 * @returns {mongoose.Connection} — org-specific connection (never null)
 * @throws {Error} — If orgId is missing or connection creation fails
 */
function getOrgConnection(orgId) {
    return resolveConnection(orgId);
}

/**
 * getConnectionMetrics
 * Returns a snapshot of connection resolver metrics.
 * Delegates to dbManager.getStats() for connection pool data
 * and queryPerformance.getQueryStats() for query-level metrics.
 *
 * @returns {Object} — Unified connection + query statistics
 */
function getConnectionMetrics() {
    const connStats = dbManager.getStats();

    // Phase 3.4: Include query performance stats if available
    try {
        const { getQueryStats } = require("./queryPerformance");
        return { ...connStats, query: getQueryStats() };
    } catch (_) {
        return connStats;
    }
}

/**
 * pingConnection
 * Sends a MongoDB admin ping to a connection to verify liveness.
 *
 * Only intended for debug/health-check tooling — NOT for request-path usage.
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 *
 * @param {mongoose.Connection} conn
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function pingConnection(conn) {
    try {
        await conn.db.admin().ping();
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

module.exports = {
    resolveConnection,
    resolveOrgDbName,
    getOrgConnection,
    getPlatformConnection,
    getConnectionMetrics,
    pingConnection,
    DB_MODE,
};
