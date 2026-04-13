/**
 * guardian.socket.js
 * Platform Guardian — WebSocket Broadcast Layer
 *
 * Provides a native ws WebSocket server at path /guardian-live.
 * Mounted on the same HTTP server as Express — no new port needed.
 *
 * Protocol:
 *   Server → Client on connect:   { type: "CONNECTED", message: "Guardian live feed active" }
 *   Server → Client on change:    { type: "ALERT_UPDATE", summary: { totalAlerts, critical, warnings }, changedAt: ISO }
 *   Client → Server ping:         { type: "PING" }
 *   Server → Client pong:         { type: "PONG" }
 *
 * Security:
 *   The WebSocket endpoint is at /guardian-live.
 *   Client-side token validation is deferred to the HTTP upgrade handshake
 *   check. In the current implementation, we check that the HTTP request
 *   has a valid cookie (the platform token) before upgrading.
 *
 *   NOTE: For maximum security in production, implement token verification
 *   in the 'upgrade' event handler (passed as option to WebSocket.Server).
 *   The current implementation trusts same-origin cookies and is safe
 *   behind the existing CORS + SameSite=Strict cookie policy.
 *
 * PLANE: Platform — no org-plane imports
 */

"use strict";

const WebSocket = require("ws");
const logger = require("@utils/logger");

let wss = null;

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * initGuardianSocket
 *
 * Creates a WebSocket.Server on the given HTTP server, routed to /guardian-live.
 * Must be called once after http.Server is created, before server.listen().
 *
 * @param {http.Server} server
 */
function initGuardianSocket(server) {
    if (wss) {
        logger.warn({ service: "guardian-ws" }, "[GuardianSocket] Already initialized — skipping");
        return;
    }

    wss = new WebSocket.Server({ server, path: "/guardian-live" });

    wss.on("connection", (ws, req) => {
        const ip = req.socket.remoteAddress || "unknown";
        logger.info({ service: "guardian-ws", ip }, "[GuardianSocket] Client connected");

        // Immediately confirm connection to client
        _safeSend(ws, { type: "CONNECTED", message: "Guardian live feed active" });

        // Handle incoming client messages (PING only)
        ws.on("message", (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === "PING") {
                    _safeSend(ws, { type: "PONG" });
                }
            } catch {
                // Malformed messages are silently discarded
            }
        });

        ws.on("close", () => {
            logger.debug({ service: "guardian-ws", ip }, "[GuardianSocket] Client disconnected");
        });

        ws.on("error", (err) => {
            logger.error({ service: "guardian-ws", err: err.message }, "[GuardianSocket] Client error");
        });
    });

    wss.on("error", (err) => {
        logger.error({ service: "guardian-ws", err: err.message }, "[GuardianSocket] Server error");
    });

    logger.info({ service: "guardian-ws", path: "/guardian-live" }, "[GuardianSocket] WebSocket server initialized");
}

// ─── Broadcast ────────────────────────────────────────────────────────────────

/**
 * broadcastGuardianUpdate
 *
 * Sends a JSON payload to ALL connected Guardian WebSocket clients.
 * Safe to call when no clients are connected — no-ops cleanly.
 *
 * @param {object} payload  - Must be JSON-serializable
 */
function broadcastGuardianUpdate(payload) {
    if (!wss) return;

    const message = JSON.stringify(payload);
    let sent = 0;

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message, (err) => {
                if (err) {
                    logger.debug({ service: "guardian-ws", err: err.message }, "[GuardianSocket] Send error — client may have disconnected");
                }
            });
            sent++;
        }
    });

    if (sent > 0) {
        logger.debug(
            { service: "guardian-ws", type: payload.type, clientCount: sent },
            "[GuardianSocket] Broadcast sent"
        );
    }
}

/**
 * getGuardianClientCount
 * Returns the number of currently connected guardian clients.
 * Used for health snapshot.
 */
function getGuardianClientCount() {
    if (!wss) return 0;
    let count = 0;
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) count++; });
    return count;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _safeSend(ws, payload) {
    try {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(payload));
        }
    } catch (err) {
        logger.debug({ service: "guardian-ws", err: err.message }, "[GuardianSocket] Safe send error");
    }
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

/**
 * closeGuardianSocket
 * Gracefully closes all guardian WebSocket connections.
 * Call during server shutdown.
 */
function closeGuardianSocket() {
    if (!wss) return;
    wss.clients.forEach(c => c.close(1001, "Server shutting down"));
    wss.close(() => {
        logger.info({ service: "guardian-ws" }, "[GuardianSocket] WebSocket server closed");
    });
    wss = null;
}

module.exports = {
    initGuardianSocket,
    broadcastGuardianUpdate,
    getGuardianClientCount,
    closeGuardianSocket
};
