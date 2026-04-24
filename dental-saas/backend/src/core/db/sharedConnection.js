/**
 * sharedConnection.js
 * Core Infrastructure — Dedicated Shared-Infra Connection
 *
 * Owns the sibling Mongoose connection for the Shared Infrastructure cluster.
 * This layer stores PURE INFRA ONLY — cross-org logs, retry queues, rate
 * limiter state. It MUST NEVER hold business data (no patients, no financial
 * records, no billing, no audit trails tied to users/orgs/contracts — those
 * remain on the platform cluster).
 *
 * Day-1 collections:
 *   - communicationLogs, communicationMetrics, communicationRetryLog
 *   - emailEvents
 *   - domainEventOutbox, sideEffectOutbox, coreOutbox
 *   - idempotencyKeys
 *   - rateLimitEntries (if persisted)
 *
 * This module is ADDITIVE (Step 1 of the 3-layer rollout). It opens a new
 * sibling connection. Day-1 it may point at the same URI as the platform
 * cluster — no behavior change until Step 5 flips call sites.
 *
 * ENV RESOLUTION (in order):
 *   MONGO_URI_DEV_SINGLE   — dev convenience: one URI for all three layers
 *   MONGO_URI_SHARED       — production source of truth (REQUIRED)
 *   (Legacy MONGO_URI fallback removed in v9.4 — 3-layer env contract.)
 *
 * POOL:
 *   maxPoolSize defaults to 30 (MONGO_POOL_SHARED_MAX overrides).
 *   Higher than platform (20) because log write patterns are bursty.
 *
 * PLANE: Core Infrastructure
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");

let conn = null;
let initPromise = null;

function resolveUri() {
    const devSingle = process.env.MONGO_URI_DEV_SINGLE;
    if (devSingle) return devSingle;

    return process.env.MONGO_URI_SHARED || null;
}

async function init() {
    if (conn) return conn;
    if (initPromise) return initPromise;

    const uri = resolveUri();
    if (!uri) {
        throw new Error(
            "[sharedConnection] No URI configured — set MONGO_URI_SHARED " +
            "(or MONGO_URI_DEV_SINGLE for dev)"
        );
    }

    const maxPoolSize = Number(process.env.MONGO_POOL_SHARED_MAX) || 30;

    initPromise = (async () => {
        const newConn = mongoose.createConnection(uri, { maxPoolSize });

        newConn.on("error", (err) => {
            logger.error(
                { service: "sharedConnection", err: err.message },
                "[sharedConnection] Connection error"
            );
        });
        newConn.on("disconnected", () => {
            logger.warn(
                { service: "sharedConnection" },
                "[sharedConnection] Disconnected"
            );
        });
        newConn.on("reconnected", () => {
            logger.info(
                { service: "sharedConnection" },
                "[sharedConnection] Reconnected"
            );
        });

        await newConn.asPromise();

        logger.info(
            { service: "sharedConnection", action: "connected", maxPoolSize },
            "[sharedConnection] Connected"
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

function get() {
    if (!conn) {
        throw new Error(
            "[sharedConnection] Not initialized. Call init() during boot before use."
        );
    }
    return conn;
}

function isReady() {
    return !!conn && conn.readyState === 1;
}

async function close() {
    if (!conn) return;
    try {
        await conn.close();
    } finally {
        conn = null;
    }
}

module.exports = { init, get, isReady, close };
