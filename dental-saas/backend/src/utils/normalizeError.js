/**
 * normalizeError.js — Standardized Error Response Builder
 *
 * Ensures all API error responses follow a consistent shape:
 *   { success: false, error: { code, message, details? } }
 *
 * Usage in controllers:
 *   const { normalizeError, errorResponse } = require("@utils/normalizeError");
 *
 *   catch (err) {
 *     return errorResponse(res, err);
 *   }
 *
 * Handles:
 *   - Domain errors with statusCode + code (e.g., OWNERSHIP_DENIED, VERSION_CONFLICT)
 *   - Mongoose validation errors (extracts field-level messages)
 *   - MongoDB duplicate key errors (E11000)
 *   - Generic/unexpected errors (500, no internal details leaked)
 */

"use strict";

/**
 * Normalizes any error into a consistent API response shape.
 *
 * @param {Error} err — The caught error
 * @returns {{ statusCode: number, body: { success: false, error: { code: string, message: string, details?: object } } }}
 */
function normalizeError(err) {
    // ── Domain errors (thrown with explicit statusCode + code) ────────────
    if (err.statusCode && err.code) {
        return {
            statusCode: err.statusCode,
            body: {
                success: false,
                error: {
                    code: err.code,
                    message: err.message,
                    ...(err.currentVersion !== undefined && { currentVersion: err.currentVersion }),
                    ...(err.details && { details: err.details }),
                },
            },
        };
    }

    // ── Mongoose ValidationError ─────────────────────────────────────────
    if (err.name === "ValidationError" && err.errors) {
        const fields = {};
        for (const [field, detail] of Object.entries(err.errors)) {
            fields[field] = detail.message;
        }
        return {
            statusCode: 400,
            body: {
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Validation failed",
                    details: fields,
                },
            },
        };
    }

    // ── MongoDB Duplicate Key (E11000) ──────────────────────────────────
    if (err.code === 11000 || err.code === "E11000") {
        const keyMatch = err.message?.match(/index: (\S+)/);
        return {
            statusCode: 409,
            body: {
                success: false,
                error: {
                    code: "DUPLICATE_KEY",
                    message: "A record with this key already exists",
                    ...(keyMatch && { details: { index: keyMatch[1] } }),
                },
            },
        };
    }

    // ── Domain errors with statusCode but no code ────────────────────────
    if (err.statusCode) {
        return {
            statusCode: err.statusCode,
            body: {
                success: false,
                error: {
                    code: "DOMAIN_ERROR",
                    message: err.message,
                },
            },
        };
    }

    // ── Zod v4 internal crash (_zod TypeError) ───────────────────────
    // Zod v4 can throw internally when .strict() + .refine() on z.record()
    // encounters missing required fields. Treat as a 400 validation error.
    if (err instanceof TypeError && err.message?.includes("_zod")) {
        return {
            statusCode: 400,
            body: {
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Request body has an invalid shape — check required fields",
                },
            },
        };
    }

    // ── Unexpected errors — never leak internals ────────────────────────
    return {
        statusCode: 500,
        body: {
            success: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "An unexpected error occurred",
            },
        },
    };
}

/**
 * Shorthand: normalizes error and sends response.
 *
 * @param {import("express").Response} res
 * @param {Error} err
 */
function errorResponse(res, err) {
    const { statusCode, body } = normalizeError(err);
    return res.status(statusCode).json(body);
}

module.exports = { normalizeError, errorResponse };
