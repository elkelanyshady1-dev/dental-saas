/**
 * requestTimeout.js — request-level timeout guard (S8)
 *
 * Long-running handlers (slow upstream, runaway query, deadlock) must not
 * hold a connection open indefinitely — that's how connection pools
 * exhaust under load and one slow endpoint takes down the whole server.
 *
 * This middleware:
 *   - starts a timer when the request arrives
 *   - if the response has not started by `timeoutMs`, sends 503
 *     REQUEST_TIMEOUT and logs a structured event
 *   - always clears the timer on 'finish' / 'close'
 *
 * It does NOT forcibly kill the downstream handler (Node can't safely
 * cancel in-flight Promises). The handler will continue running; we just
 * ensure the client gets a prompt response and the metric is recorded.
 *
 * Defaults to 30 s. Long-lived endpoints (SSE, streaming, file uploads)
 * should opt out via `req.skipTimeout = true` set before this middleware
 * runs, or mount a path-specific limit.
 *
 * PLANE: Global (mounted in app.js).
 */

"use strict";

const { metrics } = require("@infra/metrics/metrics");
const logger = require("../utils/logger");

const DEFAULT_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || "30000", 10);

function requestTimeout({ timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    return function requestTimeoutMiddleware(req, res, next) {
        if (req.skipTimeout === true) return next();

        const timer = setTimeout(() => {
            if (res.headersSent) return;

            // Grab the matched route (set by Express once the router runs).
            const route = req.route?.path || req.path || "unknown";

            try {
                metrics.http_request_timeout_total?.inc({ method: req.method, route });
            } catch { /* never break */ }

            (req.logger || logger).warn(
                {
                    event: "HTTP_REQUEST_TIMEOUT",
                    method: req.method,
                    route,
                    url: req.originalUrl,
                    timeoutMs,
                },
                "[RequestTimeout] Handler exceeded deadline — responding 503"
            );

            res.status(503).json({
                success: false,
                code: "REQUEST_TIMEOUT",
                errorCode: "REQUEST_TIMEOUT",
                message: "Request exceeded maximum processing time",
                requestId: req.requestId || null,
            });
        }, timeoutMs);

        // Node's default timer keeps the event loop alive; unref so the timer
        // itself never blocks graceful shutdown.
        if (typeof timer.unref === "function") timer.unref();

        const cleanup = () => clearTimeout(timer);
        res.on("finish", cleanup);
        res.on("close", cleanup);

        next();
    };
}

module.exports = requestTimeout;
