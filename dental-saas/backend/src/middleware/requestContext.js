const logger = require("../utils/logger");
const { metrics } = require("@infra/metrics/metrics");
const { getRequestContext } = require("../platform/context/requestContextStore");

/**
 * requestContext.js — v2.0
 *
 * Creates a structured logger child on `req.logger` enriched with the
 * requestId, correlationId, and (when present) traceparent from the
 * AsyncLocalStorage context established by requestIdMiddleware.
 *
 * HTTP_REQUEST_COMPLETED timing is now emitted by requestIdMiddleware itself,
 * so this middleware only emits the activeHttpRequests metric dec and nothing
 * else — avoiding a duplicate log on every request.
 */
const requestContext = (req, res, next) => {
    // Read from the AsyncLocalStorage store when available.
    // Falls back to req.requestId for any path that bypasses the middleware
    // (e.g. direct test calls, health-check routes).
    const asyncCtx = getRequestContext();
    const requestId = asyncCtx?.requestId ?? req.requestId ?? null;
    const correlationId = asyncCtx?.requestId ?? req.correlationId ?? null;
    const traceparent = asyncCtx?.traceparent ?? req.context?.traceparent ?? null;

    metrics.activeHttpRequests.inc();

    // Build a structured logger child so every log line in any downstream
    // handler/service automatically carries the full trace context.
    req.logger = logger.child({
        requestId,
        correlationId,
        ...(traceparent && { traceparent }),
    });

    res.on("finish", () => {
        metrics.activeHttpRequests.dec();
        // NOTE: HTTP_REQUEST_COMPLETED event is logged by requestIdMiddleware
        // with accurate timing. No duplicate log here.
    });

    next();
};

module.exports = requestContext;

