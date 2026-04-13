/**
 * correlationId.js
 * v11.0 Hardening — Standardized Tracing Middleware
 */
"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * correlationId
 * Ensures every request/job has a unique traceable ID.
 */
module.exports = (req, res, next) => {
    // 1. Reuse existing header if present (upstream/client)
    const correlationId = req.get("x-correlation-id") || uuidv4();

    // 2. Attach to request object for downstream use
    req.correlationId = correlationId;

    // 3. Attach to context for structured logging if available
    if (!req.context) req.context = {};
    req.context.correlationId = correlationId;

    // 4. Return in response headers
    if (res && res.set) {
        res.set("x-correlation-id", correlationId);
    }

    if (next) next();
};
