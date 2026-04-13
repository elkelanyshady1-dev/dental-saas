/**
 * mongoSanitize.middleware.js
 * Express 5-Compatible NoSQL Injection Prevention
 * ═══════════════════════════════════════════════════════════════
 *
 * Replaces `express-mongo-sanitize` which is **incompatible** with Express 5.
 * Express 5 made `req.query` a getter-only property backed by `querystring.parse()`,
 * so any middleware that tries `req.query = sanitized(req.query)` throws:
 *   "Cannot set property query of #<IncomingMessage> which has only a getter"
 *
 * This middleware is fully self-contained (ZERO external dependencies) and sanitizes:
 *   - req.body   (mutable — safe to overwrite)
 *   - req.params (mutable — safe to overwrite)
 *   - req.query  (GETTER in Express 5 — sanitized IN-PLACE via deep key deletion)
 *
 * Sanitization removes keys starting with `$` to prevent
 * MongoDB operator injection ($gt, $ne, $regex, $where, etc.)
 *
 * PLANE: Shared (runs for all requests)
 * MOUNT: After express.json(), before routes.
 *
 * @module middleware/mongoSanitize
 */

"use strict";

const logger = require("@utils/logger");

/**
 * Recursively strip any key starting with `$` from an object.
 * Mutates the target in-place — required for Express 5's getter-backed req.query.
 *
 * @param {*} target — The value to sanitize
 * @returns {boolean} — true if any malicious key was found and removed
 */
function sanitizeInPlace(target) {
    if (!target || typeof target !== "object") return false;

    let hasThreat = false;

    // Handle arrays
    if (Array.isArray(target)) {
        for (let i = 0; i < target.length; i++) {
            if (typeof target[i] === "object" && target[i] !== null) {
                if (sanitizeInPlace(target[i])) {
                    hasThreat = true;
                }
            }
            // If array element itself is a string starting with $, keep it —
            // only object KEYS are dangerous in MongoDB context.
        }
        return hasThreat;
    }

    // Handle objects
    for (const key of Object.keys(target)) {
        if (key.startsWith("$")) {
            delete target[key];
            hasThreat = true;
            continue;
        }

        // Recurse into nested objects/arrays
        if (typeof target[key] === "object" && target[key] !== null) {
            if (sanitizeInPlace(target[key])) {
                hasThreat = true;
            }
        }
    }

    return hasThreat;
}

/**
 * Express middleware: sanitizes req.body, req.params, and req.query
 * to prevent NoSQL injection attacks.
 *
 * Express 5 compatibility: req.query is sanitized in-place (not reassigned).
 */
function mongoSanitizeMiddleware(req, res, next) {
    let detected = false;

    // 1. req.body — mutable, sanitize in-place
    if (req.body && typeof req.body === "object") {
        if (sanitizeInPlace(req.body)) {
            detected = true;
        }
    }

    // 2. req.params — mutable, sanitize in-place
    if (req.params && typeof req.params === "object") {
        if (sanitizeInPlace(req.params)) {
            detected = true;
        }
    }

    // 3. req.query — Express 5 GETTER: must sanitize in-place (cannot reassign)
    if (req.query && typeof req.query === "object") {
        if (sanitizeInPlace(req.query)) {
            detected = true;
        }
    }

    // Log injection attempts for observability
    if (detected) {
        logger.warn({
            event: "NOSQL_INJECTION_BLOCKED",
            ip: req.ip,
            path: req.path,
            method: req.method,
            correlationId: req.correlationId || req.headers["x-request-id"],
        }, "[Security] NoSQL injection operators stripped from request");
    }

    next();
}

module.exports = mongoSanitizeMiddleware;
