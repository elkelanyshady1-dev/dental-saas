/**
 * requestContextStore.js
 * Platform — AsyncLocalStorage Request Context Store
 *
 * PURPOSE
 *   Provides a zero-dependency, propagation-safe way to access the current
 *   request's correlation context (requestId, startTime, traceparent) from
 *   anywhere in the call stack — services, repositories, audit helpers —
 *   without threading `req` through function signatures.
 *
 * USAGE (consumer)
 *   const { getRequestId, getRequestContext } = require("./requestContextStore");
 *
 *   // In a service called from an Express handler:
 *   const requestId = getRequestId();   // "550e8400-e29b-..."
 *
 * USAGE (middleware — see requestIdMiddleware.js)
 *   requestContextStore.run({ requestId, startTime, traceparent }, next);
 *
 * COMPATIBILITY
 *   Node.js ≥ 16.  AsyncLocalStorage is stable since v16.4.0.
 *   No external dependencies.
 *
 * DISTRIBUTED TRACING
 *   `traceparent` stores the W3C Trace Context header when present.
 *   Future OpenTelemetry integration can read it here without touching
 *   any existing middleware.
 *
 * PLANE: Global infra — used by both Platform and Org planes.
 */

"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");

// ── Singleton store ───────────────────────────────────────────────────────────
// One store instance for the entire process.  Each request gets its own
// storage context via requestContextStore.run({...}, next).
const requestContextStore = new AsyncLocalStorage();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the full context object for the current async execution context,
 * or null if called outside an active request lifecycle.
 *
 * @returns {{ requestId: string, startTime: number, traceparent: string|null }|null}
 */
function getRequestContext() {
    return requestContextStore.getStore() ?? null;
}

/**
 * Returns the requestId for the current request, or null if not in a request.
 * This is the primary accessor for services and audit helpers.
 *
 * @returns {string|null}
 */
function getRequestId() {
    return requestContextStore.getStore()?.requestId ?? null;
}

/**
 * Returns the W3C traceparent header value if present, or null.
 * Used by future OpenTelemetry integration.
 *
 * @returns {string|null}
 */
function getTraceparent() {
    return requestContextStore.getStore()?.traceparent ?? null;
}

/**
 * Returns elapsed time in milliseconds since the request started.
 * Returns null if called outside a request context.
 *
 * @returns {number|null}
 */
function getRequestDurationMs() {
    const ctx = requestContextStore.getStore();
    if (!ctx?.startTime) return null;
    return Date.now() - ctx.startTime;
}

module.exports = {
    requestContextStore,   // The raw store — only requestIdMiddleware should call .run()
    getRequestContext,
    getRequestId,
    getTraceparent,
    getRequestDurationMs,
};
