/**
 * platformFlagStreamController.js
 * v19.0 — Real-Time Feature Flag Server-Sent Events (Enterprise mode only)
 *
 * Maintains a process-level connection registry. When flags change, all
 * active SSE clients are notified without requiring a page reload.
 *
 * ENTERPRISE ONLY — never load this in LEAN mode.
 * Registered conditionally in platformRoutes.js via isEnterprise() gate.
 */
const { PLATFORM_FEATURE_FLAGS } = require("../config/platformFeatureFlags");

// In-process SSE connection registry
const activeConnections = new Set();

/**
 * broadcastFlagUpdate
 * Call this whenever flags change (admin toggle, plan override, etc.)
 * Safe to call even with zero active connections.
 */
function broadcastFlagUpdate(flags) {
    const payload = `data: ${JSON.stringify(flags)}\n\n`;
    for (const res of activeConnections) {
        try {
            res.write(payload);
        } catch (_) {
            // Client already disconnected — remove stale reference
            activeConnections.delete(res);
        }
    }
}

/**
 * GET /api/platform/feature-flags/stream
 * Establishes a persistent SSE connection for live flag updates.
 */
exports.streamFeatureFlags = (req, res) => {
    // SSE response headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-store");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx buffering
    res.flushHeaders();

    // Add to registry
    activeConnections.add(res);

    // Immediately send current flag state so client doesn't wait
    res.write(`data: ${JSON.stringify(PLATFORM_FEATURE_FLAGS)}\n\n`);

    // ⚠️ CRITICAL: Remove connection on close to prevent memory leak
    req.on("close", () => {
        activeConnections.delete(res);
    });

    req.on("error", () => {
        activeConnections.delete(res);
    });
};

exports.broadcastFlagUpdate = broadcastFlagUpdate;
exports.activeConnections = activeConnections; // Exposed for health monitoring
