/**
 * dtoEnforcer.js — Runtime DTO Contract Enforcer
 * Phase 9.1 — Self-Defending Architecture
 *
 * Intercepts all JSON responses on patient-domain routes and validates
 * that the DTO contract is honoured (displayName present on every patient item).
 *
 * Behaviour:
 *   ALL → logs structured error (runtime enforcement = detection only)
 *   DEV → ADDITIONALLY prints to stderr for max visibility
 *   Blocking belongs in CI (contract tests), not runtime.
 *
 * Scope:
 *   Only applies to /patient/domain and /org/command/search routes.
 *   Non-patient endpoints are passed through untouched.
 *
 * Mount: AFTER responseFormatter in app.js
 */
"use strict";

const logger = require("../utils/logger");

/**
 * Routes whose JSON response bodies should be DTO-validated.
 * Uses substring matching on req.originalUrl.
 */
const ENFORCED_ROUTES = [
    "/patient/domain",
    "/command/search",
];

/**
 * Fields that MUST be present on every patient item returned by the API.
 * If any field is `undefined`, the enforcer fires.
 */
const REQUIRED_DTO_FIELDS = ["displayName"];

/**
 * @param {object} item — A single patient-like object from the response body
 * @param {string} path — req.originalUrl (for logging)
 * @param {string} method — req.method (for logging)
 * @returns {string[]} — Array of missing field names (empty = OK)
 */
function validateItem(item, path, method) {
    if (!item || typeof item !== "object") return [];

    const missing = [];
    for (const field of REQUIRED_DTO_FIELDS) {
        if (item[field] === undefined) {
            missing.push(field);
        }
    }

    if (missing.length > 0) {
        const violation = {
            event: "DTO_ENFORCER_VIOLATION",
            path,
            method,
            missingFields: missing,
            itemId: item._id || item.id || "unknown",
            hint: "This response bypassed the DTO layer. All patient data MUST go through patient.dto.js builders.",
        };

        logger.error(violation, `[DTO_ENFORCER] Contract violation on ${path}`);
    }

    return missing;
}

/**
 * Determines if a response body contains patient data that should be validated.
 *
 * Handles the response envelope shapes used by this system:
 *   1. { success: true, data: [...] }         — list response
 *   2. { success: true, data: { core: {...} } } — aggregate response
 *   3. { success: true, data: {...} }         — single item
 *   4. { patients: [...] }                    — command search (legacy shape)
 *
 * @param {object} body — The JSON response body
 * @returns {{ items: object[], shape: string }} — Extracted patient items + shape identifier
 */
function extractPatientItems(body) {
    if (!body || typeof body !== "object") return { items: [], shape: "none" };

    // Shape 1/3: Standard envelope
    if (body.success && body.data) {
        const data = body.data;

        // Aggregate response: { data: { core: { displayName, ... } } }
        if (data.core && typeof data.core === "object" && !Array.isArray(data.core)) {
            return { items: [data.core], shape: "aggregate" };
        }

        // List response: { data: [...] }
        if (Array.isArray(data)) {
            return { items: data, shape: "list" };
        }

        // Paginated list: { data: { patients: [...] } }
        if (Array.isArray(data.patients)) {
            return { items: data.patients, shape: "paginated" };
        }

        // Search results: { data: { data: { results: [...] } } }
        if (data.data && Array.isArray(data.data.results)) {
            return { items: data.data.results, shape: "search" };
        }

        // Single item with _id (likely a patient)
        if (data._id) {
            return { items: [data], shape: "single" };
        }
    }

    // Shape 4: Command search (non-standard envelope)
    if (Array.isArray(body.patients)) {
        return { items: body.patients, shape: "command" };
    }

    return { items: [], shape: "unknown" };
}

/**
 * Express middleware factory.
 * @returns {Function} Express middleware
 */
function dtoEnforcer(req, res, next) {
    // Only intercept routes in the enforced list
    const shouldEnforce = ENFORCED_ROUTES.some(prefix =>
        req.originalUrl.includes(prefix)
    );

    if (!shouldEnforce) return next();

    // Monkey-patch res.json to validate before sending
    const originalJson = res.json.bind(res);

    res.json = function dtoEnforcedJson(body) {
        const { items, shape } = extractPatientItems(body);

        if (items.length > 0) {
            let totalViolations = 0;

            for (const item of items) {
                const missing = validateItem(item, req.originalUrl, req.method);
                totalViolations += missing.length;
            }

            if (totalViolations > 0) {
                // Log aggressively but NEVER crash API responses.
                // Enforcement belongs in CI (contract tests), not runtime.
                const msg = `[DTO_ENFORCER] ${totalViolations} contract violation(s) on ${req.originalUrl} (shape: ${shape}). ` +
                    `Missing required DTO fields. All patient data MUST go through patient.dto.js builders.`;
                logger.error({ event: "DTO_ENFORCER_HARD_VIOLATION", path: req.originalUrl, shape, totalViolations }, msg);

                // DEV-only: stderr for max visibility
                if (process.env.NODE_ENV !== "production" && process.stderr?.write) {
                    process.stderr.write(`\n\x1b[31m[DTO_ENFORCER]\x1b[0m ${msg}\n`);
                }
            }
        }

        return originalJson(body);
    };

    next();
}

module.exports = dtoEnforcer;
