/**
 * DomainError.js — Normalized Domain Error Base Class
 * Layer: Core > Errors
 *
 * Hardening 10: Provides a structured error class that replaces scattered
 * `Object.assign(new Error(...), { statusCode, code })` patterns across
 * the orthodontic domain services.
 *
 * Features:
 *   - Consistent `name`, `statusCode`, `code` on every instance
 *   - Optional `details` bag for extra context (caseId, visitId, etc.)
 *   - Instanceof-checkable: `err instanceof DomainError`
 *   - JSON-serializable: `toJSON()` for structured logging
 *   - Compatible with the global error handler (reads `err.statusCode`)
 *
 * Usage:
 *   throw new DomainError("Case not found", 404, "CASE_NOT_FOUND", { caseId });
 *
 *   // Or subclass:
 *   class VisitNotFoundError extends DomainError {
 *       constructor(visitId) {
 *           super(`Visit ${visitId} not found`, 404, "VISIT_NOT_FOUND", { visitId });
 *       }
 *   }
 */

"use strict";

class DomainError extends Error {
    /**
     * @param {string}  message    — Human-readable error message
     * @param {number}  statusCode — HTTP status code (default 500)
     * @param {string}  code       — Machine-readable error code (e.g. "CASE_NOT_FOUND")
     * @param {Object}  [details]  — Optional context bag (caseId, visitId, etc.)
     */
    constructor(message, statusCode = 500, code = "DOMAIN_ERROR", details = {}) {
        super(message);
        this.name       = this.constructor.name;
        this.statusCode = statusCode;
        this.code       = code;
        this.details    = details;

        // Maintains proper stack trace in V8 (Node.js)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * JSON-serializable representation for structured logging.
     * Excludes stack trace — that's for internal logs, not API responses.
     */
    toJSON() {
        return {
            name:       this.name,
            message:    this.message,
            statusCode: this.statusCode,
            code:       this.code,
            details:    this.details,
        };
    }
}

module.exports = DomainError;
