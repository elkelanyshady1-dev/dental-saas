/**
 * responseNormalizer.js — Response Sanitization for Tenant Context
 * Phase 5 — Runtime Enforcement Layer (Tenant Isolation Hardening)
 *
 * PURPOSE:
 * Ensures that API responses never leak internal tenant identifiers
 * (organizationId, _tenant metadata) in contexts where they shouldn't
 * appear, and that responses for org-plane requests are consistent.
 *
 * This is a safety net — DTOs should already strip internal fields.
 * The normalizer catches cases where raw documents leak through.
 *
 * PLACEMENT:
 *   Applied as response interceptor on org-plane routes.
 *   Hooks into res.json() to inspect outgoing payloads.
 *
 * @module shared/security/responseNormalizer
 */

"use strict";

const logger = require("@utils/logger");

/**
 * Fields that should NEVER appear in org-plane API responses.
 * These are internal platform/infrastructure fields that leak
 * cross-tenant information if exposed.
 */
const REDACTED_FIELDS = [
    "_tenant",
    "__v",
    "tokenHash",
    "refreshTokenHash",
];

/**
 * Recursively strip redacted fields from an object.
 * Operates on plain objects and arrays. Does not mutate the original.
 *
 * @param {*} obj - The value to sanitize
 * @param {string[]} fields - Fields to strip
 * @param {number} [depth=0] - Current recursion depth
 * @returns {*} Sanitized copy
 */
function stripFields(obj, fields, depth = 0) {
    if (depth > 10) return obj;
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
        return obj.map((item) => stripFields(item, fields, depth + 1));
    }

    if (typeof obj === "object" && obj.constructor === Object) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (fields.includes(key)) continue;
            result[key] = stripFields(value, fields, depth + 1);
        }
        return result;
    }

    return obj;
}

/**
 * Express middleware that intercepts res.json() to strip internal fields.
 *
 * @param {Object} [options]
 * @param {string[]} [options.additionalRedactedFields] - Extra fields to strip
 * @param {boolean} [options.logRedactions=false] - Log when fields are stripped (dev only)
 * @returns {import("express").RequestHandler}
 */
function responseNormalizer(options = {}) {
    const redactedFields = [
        ...REDACTED_FIELDS,
        ...(options.additionalRedactedFields || []),
    ];
    const logRedactions = options.logRedactions === true;

    return function responseNormalizerMiddleware(req, res, next) {
        const originalJson = res.json.bind(res);

        res.json = function normalizedJson(body) {
            if (body && typeof body === "object") {
                const sanitized = stripFields(body, redactedFields);

                if (logRedactions && JSON.stringify(sanitized) !== JSON.stringify(body)) {
                    logger.debug({
                        event: "RESPONSE_NORMALIZED",
                        path: req.originalUrl,
                        method: req.method,
                    }, "[responseNormalizer] Stripped internal fields from response");
                }

                return originalJson(sanitized);
            }
            return originalJson(body);
        };

        next();
    };
}

module.exports = { responseNormalizer, stripFields };
