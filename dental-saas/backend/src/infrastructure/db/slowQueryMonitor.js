/**
 * slowQueryMonitor.js — structured slow-query logging (S8)
 *
 * Hooks into every live MongoClient (platform + shared + each open tenant
 * cluster) and records any DB command whose execution exceeds
 * SLOW_QUERY_THRESHOLD_MS. Output is:
 *   1. a pino log line with a stable shape (SLOW_QUERY event)
 *   2. a Prometheus counter increment (slow_query_total)
 *
 * The monitor is enabled by default in production and disabled in
 * development (where verbose logging is more useful). Override via
 * SLOW_QUERY_MONITOR=true|false.
 *
 * v9.4.1 (H6): attaches per-connection rather than to global
 * `mongoose.connection` (which no longer exists since Step 5d).
 *
 * Implementation notes
 * --------------------
 * - MongoDB client command-monitoring API exposes succeeded/failed events
 *   with `duration` / `durationMicros`. We attach a shared handler to
 *   each live client. Each client is marked `_slowQueryInstalled` so
 *   re-installing on a given connection is a no-op.
 *
 * PLANE: Global infrastructure.
 */

"use strict";

const logger = require("../../utils/logger");
const { metrics } = require("../metrics/metrics");

const SLOW_QUERY_THRESHOLD_MS = parseInt(
    process.env.SLOW_QUERY_THRESHOLD_MS || "500",
    10
);

// Pino redaction won't strip command bodies — filter system collections and
// auth commands so we never log passwords, token material, or PII-bearing
// find() filters.
const _IGNORED_COMMANDS = new Set([
    "ismaster",
    "hello",
    "ping",
    "saslStart",
    "saslContinue",
    "authenticate",
    "getnonce",
    "getLog",
    "buildInfo",
    "listCollections",
    "listIndexes",
    "endSessions",
]);

function _buildHandler(label) {
    return function handler(evt) {
        if (!evt || typeof evt.duration !== "number") {
            // Some driver versions name the field differently; derive from micros.
            const ms = evt?.durationMicros ? Math.round(evt.durationMicros / 1000) : null;
            if (ms == null) return;
            evt.duration = ms;
        }
        if (evt.duration < SLOW_QUERY_THRESHOLD_MS) return;
        if (_IGNORED_COMMANDS.has(evt.commandName)) return;

        const collection =
            evt.command?.[evt.commandName] ||
            evt.command?.collection ||
            "unknown";

        try {
            metrics.slow_query_total?.inc({
                commandName: evt.commandName,
                collection: String(collection),
                layer: label,
            });
        } catch { /* never break */ }

        logger.warn(
            {
                event: "SLOW_QUERY",
                layer: label,
                commandName: evt.commandName,
                collection,
                durationMs: evt.duration,
                thresholdMs: SLOW_QUERY_THRESHOLD_MS,
                // Do NOT log evt.command — it may contain PII filters.
            },
            `[SlowQueryMonitor:${label}] ${evt.commandName} ${collection} took ${evt.duration}ms`
        );
    };
}

function _attachToConnection(conn, label) {
    const client = conn?.getClient?.();
    if (!client) return false;
    if (client._slowQueryInstalled) return false;
    try {
        const handler = _buildHandler(label);
        client.on("commandSucceeded", handler);
        client.on("commandFailed", handler);
        client._slowQueryInstalled = true;
        return true;
    } catch (err) {
        logger.warn(
            { service: "slowQueryMonitor", layer: label, err: err.message },
            `[SlowQueryMonitor:${label}] Failed to attach command listeners`
        );
        return false;
    }
}

let _installed = false;

/**
 * Install the slow-query listener across every live connection
 * (platform + shared + each open tenant cluster). Safe to call multiple
 * times — each client is marked so re-attaches are no-ops.
 *
 * v9.4.1 (H6): previously attached to mongoose.connection (global root);
 * that connection no longer exists since Step 5d.
 */
function installSlowQueryMonitor() {
    if (_installed) return;

    const enabled = process.env.SLOW_QUERY_MONITOR
        ? process.env.SLOW_QUERY_MONITOR === "true"
        : process.env.NODE_ENV === "production";

    if (!enabled) return;

    const platformConnection = require("@core/db/platformConnection");
    const sharedConnection = require("@core/db/sharedConnection");
    const clusterConnections = require("@core/db/clusterConnections");

    let attached = 0;

    // Platform + shared are singletons opened at boot.
    try {
        if (_attachToConnection(platformConnection.get(), "platform")) attached++;
    } catch { /* platform not ready — skip */ }
    try {
        if (_attachToConnection(sharedConnection.get(), "shared")) attached++;
    } catch { /* shared not ready — skip */ }

    // Cluster roots open lazily; attach to every one live right now, and
    // keep the API idempotent so new clusters can be re-attached by a
    // subsequent install call (e.g., from clusterConnections.ensureCluster).
    for (const conn of clusterConnections.getAllLiveConnections()) {
        if (_attachToConnection(conn, "tenant-cluster")) attached++;
    }

    _installed = true;

    logger.info(
        { service: "slowQueryMonitor", thresholdMs: SLOW_QUERY_THRESHOLD_MS, attached },
        `[SlowQueryMonitor] installed on ${attached} connection(s)`
    );
}

module.exports = { installSlowQueryMonitor, SLOW_QUERY_THRESHOLD_MS };
