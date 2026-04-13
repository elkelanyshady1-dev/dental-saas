/**
 * requestIdMiddleware.js
 * Platform — Request Correlation ID Middleware  v2.0
 *
 * PURPOSE
 *   Every HTTP request carries a unique, traceable identifier propagated
 *   through the Express lifecycle, backend logs, audit records, and API
 *   responses.
 *
 * HEADER CONTRACT
 *   Inbound:  X-Request-ID | x-correlation-id (client-provided, optional)
 *   Outbound: X-Request-ID + x-correlation-id (always echoed)
 *
 * BEHAVIOUR
 *   1. Accept X-Request-ID / x-request-id / x-correlation-id from client.
 *   2. Validate: /^[A-Za-z0-9\-_]{1,128}$/  ← prevents header injection.
 *   3. Generate UUID v4 if missing or invalid.
 *   4. req.requestId    — canonical field for all downstream use.
 *   5. req.correlationId — backwards-compat alias (auditService, logger).
 *   6. AsyncLocalStorage.run() — wraps the full async call tree so any
 *      service can call getRequestId() without threading `req` everywhere.
 *   7. Echo X-Request-ID + x-correlation-id in every response.
 *   8. Capture W3C `traceparent` header for future OpenTelemetry support.
 *   9. Log HTTP_REQUEST_COMPLETED with full timing on response finish.
 *
 * PLACEMENT
 *   Must be mounted BEFORE requestContext.js so that req.requestId
 *   is available when the logger child is created.
 *
 * PLANE: Global infra — Platform + Org
 */

"use strict";

const { v4: uuidv4 } = require("uuid");
const { requestContextStore } = require("../context/requestContextStore");
const logger = require("@utils/logger");

// ── Validation patterns ───────────────────────────────────────────────────────

/** Max 128 chars, alphanumeric + hyphen + underscore only. */
const SAFE_ID_PATTERN = /^[a-zA-Z0-9\-_]{1,128}$/;

/** W3C Trace Context: {ver}-{traceId:32}-{parentId:16}-{flags:2} */
const TRACEPARENT_PATTERN = /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/i;

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidClientId(value) {
    return typeof value === "string" && SAFE_ID_PATTERN.test(value);
}

function isValidTraceparent(value) {
    return typeof value === "string" && TRACEPARENT_PATTERN.test(value.trim());
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * requestIdMiddleware
 *
 * @param {import("express").Request}    req
 * @param {import("express").Response}   res
 * @param {import("express").NextFunction} next
 */
function requestIdMiddleware(req, res, next) {
    // ── Step 1: Resolve request ID ────────────────────────────────────────────
    const clientId = req.get("X-Request-ID")
        || req.get("x-request-id")
        || req.get("x-correlation-id");

    const requestId = isValidClientId(clientId) ? clientId : uuidv4();

    // ── Step 2: W3C Distributed Trace Context ─────────────────────────────────
    // Stored in context store — future OpenTelemetry integration reads it
    // via getTraceparent() without touching existing middleware.
    const rawTraceparent = req.get("traceparent");
    const traceparent = isValidTraceparent(rawTraceparent)
        ? rawTraceparent.trim()
        : null;

    // ── Step 3: Attach to req ─────────────────────────────────────────────────
    req.requestId = requestId;
    req.correlationId = requestId;          // backwards-compat alias

    if (!req.context) req.context = {};
    req.context.requestId = requestId;
    req.context.correlationId = requestId;  // compat
    if (traceparent) req.context.traceparent = traceparent;

    // ── Step 4: Echo in response headers ─────────────────────────────────────
    res.set("X-Request-ID", requestId);
    res.set("x-correlation-id", requestId); // legacy compat

    // ── Step 5: Request timing — log on finish ────────────────────────────────
    const startTime = Date.now();

    res.on("finish", () => {
        const durationMs = Date.now() - startTime;
        logger.info({
            event: "HTTP_REQUEST_COMPLETED",
            requestId,
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            durationMs,
            ...(traceparent && { traceparent }),
        });
    });

    // ── Step 6: Run the entire request in the AsyncLocalStorage context ───────
    // Any code awaited from next() — controllers, services, audit helpers —
    // can call getRequestId() without needing the `req` object.
    const ctx = { requestId, startTime, traceparent };
    requestContextStore.run(ctx, next);
}

module.exports = requestIdMiddleware;
