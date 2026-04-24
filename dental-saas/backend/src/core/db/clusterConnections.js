/**
 * clusterConnections.js
 * Core Infrastructure — Tenant Cluster Connection Pool
 *
 * Manages one Mongoose root connection PER tenant cluster key. Opens lazily
 * on first use; each cluster conn then serves N org DBs via `useDb()` (which
 * is handled by dbManager one layer above).
 *
 * Day-1: wired but not yet consumed by dbManager — the cluster layer ships
 * ready, Step 3 flips the patients module through it first, then Step 5
 * flips the rest.
 *
 * LIFECYCLE:
 *   - ensureCluster(key) creates + awaits a connection the first time.
 *   - get(key, { fallback }) is the read path. Fallback support is a seam
 *     for the Phase 8 multi-cluster era; Day-1 fallback is always null.
 *   - closeIdleConnections() sweeps cluster-level connections that have been
 *     idle longer than the threshold (default 30 min). Runs every 10 min
 *     in the background. Prevents connection leaks when a cluster is
 *     drained and stops receiving traffic.
 *
 * HEALTH TRACKING (DEFERRED — seam ready):
 *   Every ensureCluster failure increments a counter in clusterHealth. The
 *   auto-DOWN flip (failures > 5 in 60s) is documented in the plan but not
 *   activated until cluster #2 exists. trackFailure() is called unconditionally
 *   so the data is available when the policy lands.
 *
 * POOL:
 *   maxPoolSize defaults to 100 (MONGO_POOL_CLUSTER_MAX overrides).
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");
const clusterRegistry = require("./clusterRegistry");

const IDLE_CUTOFF_MS = parseInt(process.env.CLUSTER_CONN_IDLE_MS, 10) || 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = parseInt(process.env.CLUSTER_CONN_SWEEP_MS, 10) || 10 * 60 * 1000;
const MAX_POOL_SIZE = parseInt(process.env.MONGO_POOL_CLUSTER_MAX, 10) || 100;

// Map<clusterKey, { conn, lastUsed, openedAt }>
const connections = new Map();

// Map<clusterKey, { failures, lastFailure, windowStart }> — rolling 60s window.
const clusterHealth = new Map();

let sweepTimer = null;
let isShutdown = false;

// Redact credentials from a URI before logging.
function redact(uri) {
    if (!uri) return uri;
    return uri.replace(/:\/\/[^:]+:[^@]+@/, "://***:***@");
}

function trackFailure(key) {
    const now = Date.now();
    const entry = clusterHealth.get(key) || { failures: 0, lastFailure: null, windowStart: now };
    if (now - entry.windowStart > 60 * 1000) {
        entry.failures = 0;
        entry.windowStart = now;
    }
    entry.failures += 1;
    entry.lastFailure = now;
    clusterHealth.set(key, entry);
    // Auto-DOWN policy deferred until cluster #2 exists — see plan.
}

/**
 * ensureCluster
 * Opens (or reuses) a root connection to the named cluster.
 * Throws if the key is unknown or the connection cannot be established.
 */
async function ensureCluster(key) {
    if (isShutdown) {
        throw new Error("[clusterConnections] shut down — cannot open new connections");
    }

    const existing = connections.get(key);
    if (existing && existing.conn.readyState === 1) {
        existing.lastUsed = Date.now();
        return existing.conn;
    }
    if (existing) {
        // Stale (connecting/disconnecting/disconnected). Evict and retry.
        try {
            await existing.conn.close();
        } catch (_) { /* swallow */ }
        connections.delete(key);
    }

    const entry = clusterRegistry.get(key);
    if (!entry) {
        throw new Error(`[clusterConnections] Unknown cluster key: "${key}"`);
    }
    if (!entry.uri) {
        throw new Error(`[clusterConnections] Cluster "${key}" has no URI configured`);
    }

    try {
        const conn = mongoose.createConnection(entry.uri, { maxPoolSize: MAX_POOL_SIZE });

        conn.on("error", (err) => {
            logger.error(
                { service: "clusterConnections", key, err: err.message },
                "[clusterConnections] Connection error"
            );
        });
        conn.on("disconnected", () => {
            logger.warn(
                { service: "clusterConnections", key },
                "[clusterConnections] Disconnected"
            );
        });
        conn.on("reconnected", () => {
            logger.info(
                { service: "clusterConnections", key },
                "[clusterConnections] Reconnected"
            );
        });

        await conn.asPromise();

        connections.set(key, {
            conn,
            lastUsed: Date.now(),
            openedAt: Date.now(),
        });

        logger.info(
            {
                service: "clusterConnections",
                key,
                region: entry.region,
                uri: redact(entry.uri),
                maxPoolSize: MAX_POOL_SIZE,
            },
            "[clusterConnections] Opened cluster connection"
        );

        return conn;
    } catch (err) {
        trackFailure(key);
        throw err;
    }
}

/**
 * get
 * Public read path. Attempts the primary key; falls back to the supplied
 * cluster only on connection-creation failure (not on read errors once
 * connected). Day-1 callers pass fallback=null.
 */
async function get(key, { fallback = null } = {}) {
    try {
        return await ensureCluster(key);
    } catch (err) {
        if (!fallback) throw err;
        logger.warn(
            {
                service: "clusterConnections",
                key,
                fallback,
                err: err.message,
            },
            "[clusterConnections] Primary cluster failed — trying fallback"
        );
        return ensureCluster(fallback);
    }
}

/**
 * closeIdleConnections
 * Closes cluster-level connections that have been unused longer than the
 * threshold. Runs on the sweep timer; also callable directly for tests
 * or emergency cleanup.
 */
async function closeIdleConnections(maxIdleMs = IDLE_CUTOFF_MS) {
    const now = Date.now();
    const toClose = [];

    for (const [key, entry] of connections) {
        if (now - entry.lastUsed > maxIdleMs) {
            toClose.push(key);
        }
    }

    for (const key of toClose) {
        const entry = connections.get(key);
        try {
            await entry.conn.close();
        } catch (err) {
            logger.warn(
                { service: "clusterConnections", key, err: err.message },
                "[clusterConnections] Error closing idle connection (non-fatal)"
            );
        } finally {
            connections.delete(key);
            logger.info(
                { service: "clusterConnections", key, idleMs: now - entry.lastUsed },
                "[clusterConnections] Closed idle cluster connection"
            );
        }
    }
}

/**
 * getSync
 * Synchronous access to an already-opened cluster connection. Throws if the
 * connection is not yet opened or has dropped.
 *
 * Used by the hot path (authMiddleware / dbContext) during `DB_USE_CLUSTER_LAYER`
 * rollout where the tenant DB is derived with `clusterConn.useDb(dbName)` —
 * `useDb()` is synchronous and works against any open root connection, so the
 * caller needs a fast sync accessor.
 *
 * Requires upstream pre-warming at boot — see `config/db.js` which calls
 * `ensureCluster(key)` for every ENV-declared cluster when the flag is on.
 *
 * @param {string} key
 * @returns {mongoose.Connection}
 */
function getSync(key) {
    const entry = connections.get(key);
    if (!entry || entry.conn.readyState !== 1) {
        throw new Error(
            `[clusterConnections] Cluster "${key}" is not pre-warmed or not connected. ` +
            `Call ensureCluster("${key}") during boot when DB_USE_CLUSTER_LAYER=true.`
        );
    }
    entry.lastUsed = Date.now();
    return entry.conn;
}

async function close(key) {
    const entry = connections.get(key);
    if (!entry) return;
    try {
        await entry.conn.close();
    } finally {
        connections.delete(key);
    }
}

async function closeAll() {
    isShutdown = true;
    if (sweepTimer) {
        clearInterval(sweepTimer);
        sweepTimer = null;
    }
    const keys = Array.from(connections.keys());
    await Promise.allSettled(keys.map((k) => close(k)));
}

function getStats() {
    const now = Date.now();
    const entries = Array.from(connections.entries()).map(([key, e]) => ({
        key,
        readyState: e.conn.readyState,
        ageMs: now - e.openedAt,
        idleMs: now - e.lastUsed,
    }));
    return {
        openClusters: connections.size,
        clusters: entries,
        health: Object.fromEntries(clusterHealth),
        idleCutoffMs: IDLE_CUTOFF_MS,
        sweepIntervalMs: SWEEP_INTERVAL_MS,
        maxPoolSize: MAX_POOL_SIZE,
        isShutdown,
    };
}

/**
 * getAllLiveConnections
 * Returns an array of raw Mongoose Connection objects for every cluster
 * root currently open. Used by the slow-query monitor (H6) to attach
 * command listeners to each underlying MongoClient. Does NOT open any
 * new connections; just enumerates what's live right now.
 *
 * @returns {import("mongoose").Connection[]}
 */
function getAllLiveConnections() {
    return Array.from(connections.values()).map((e) => e.conn);
}

// ─── Sweep Timer ────────────────────────────────────────────────────────────
// Starts on first require. .unref() so it doesn't hold the process open.

function startSweep() {
    if (sweepTimer) return;
    // ALLOWED_POLLING: CLEANUP
    sweepTimer = setInterval(() => {
        closeIdleConnections().catch((err) => {
            logger.warn(
                { service: "clusterConnections", err: err.message },
                "[clusterConnections] Idle sweep error"
            );
        });
    }, SWEEP_INTERVAL_MS);
    if (sweepTimer.unref) sweepTimer.unref();
}

startSweep();

module.exports = {
    ensureCluster,
    get,
    getSync,
    close,
    closeAll,
    closeIdleConnections,
    getStats,
    getAllLiveConnections,
    // test-only internals
    _connections: () => connections,
    _health: () => clusterHealth,
};
