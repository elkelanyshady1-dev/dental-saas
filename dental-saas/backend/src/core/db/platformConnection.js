/**
 * platformConnection.js
 * Core Infrastructure — Dedicated Platform-Plane Connection
 *
 * Owns the sibling Mongoose connection for the Platform cluster (control plane):
 * organizations, platformUsers, tokens, plans, billing, audit trails tied to
 * contracts/users, and related platform-side metadata.
 *
 * This module is ADDITIVE (Step 1 of the 3-layer rollout). It opens a new
 * sibling connection alongside the existing global `mongoose.connection`
 * — both initially point at the same URI, so no behavior changes on Day-1.
 * Later steps flip call sites off the global root onto `get()`.
 *
 * ENV RESOLUTION (in order):
 *   MONGO_URI_DEV_SINGLE   — dev convenience: one URI for all three layers
 *   MONGO_URI_PLATFORM     — production source of truth
 *   MONGO_URI              — legacy fallback so existing dev setups keep booting
 *
 * POOL:
 *   maxPoolSize defaults to 20 (MONGO_POOL_PLATFORM_MAX overrides).
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");

let conn = null;
let initPromise = null;

/**
 * Resolve which URI this layer should use.
 * Dev-single mode wins when set (non-production only — enforced at boot).
 */
function resolveUri() {
    const devSingle = process.env.MONGO_URI_DEV_SINGLE;
    if (devSingle) return devSingle;

    return (
        process.env.MONGO_URI_PLATFORM ||
        process.env.MONGO_URI ||
        null
    );
}

/**
 * init
 * Opens the platform connection. Safe to call once at boot.
 * Subsequent calls return the already-initialized connection.
 *
 * @returns {Promise<mongoose.Connection>}
 */
async function init() {
    if (conn) return conn;
    if (initPromise) return initPromise;

    const uri = resolveUri();
    if (!uri) {
        throw new Error(
            "[platformConnection] No URI configured — set MONGO_URI_PLATFORM " +
            "(or MONGO_URI_DEV_SINGLE for dev, or MONGO_URI as legacy fallback)"
        );
    }

    const maxPoolSize = Number(process.env.MONGO_POOL_PLATFORM_MAX) || 20;

    initPromise = (async () => {
        const newConn = mongoose.createConnection(uri, { maxPoolSize });

        newConn.on("error", (err) => {
            logger.error(
                { service: "platformConnection", err: err.message },
                "[platformConnection] Connection error"
            );
        });
        newConn.on("disconnected", () => {
            logger.warn(
                { service: "platformConnection" },
                "[platformConnection] Disconnected"
            );
        });
        newConn.on("reconnected", () => {
            logger.info(
                { service: "platformConnection" },
                "[platformConnection] Reconnected"
            );
        });

        await newConn.asPromise();

        logger.info(
            { service: "platformConnection", action: "connected", maxPoolSize },
            "[platformConnection] Connected"
        );

        conn = newConn;
        return conn;
    })();

    try {
        return await initPromise;
    } finally {
        initPromise = null;
    }
}

/**
 * get
 * Returns the initialized platform connection.
 * Throws if called before init().
 */
function get() {
    if (!conn) {
        throw new Error(
            "[platformConnection] Not initialized. Call init() during boot before use."
        );
    }
    return conn;
}

/**
 * isReady
 * True when readyState === 1 (connected and usable).
 * Used by /api/health/db.
 */
function isReady() {
    return !!conn && conn.readyState === 1;
}

/**
 * close
 * Graceful shutdown hook. Closes the connection and resets state.
 */
async function close() {
    if (!conn) return;
    try {
        await conn.close();
    } finally {
        conn = null;
    }
}

module.exports = { init, get, isReady, close };
