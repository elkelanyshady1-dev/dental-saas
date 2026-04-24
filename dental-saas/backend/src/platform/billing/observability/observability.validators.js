/**
 * observability.validators.js
 * Platform Observability — Zod Schemas + Query Validator
 *
 * The shared `@middleware/validate` helper only parses req.body. These
 * routes take their inputs from req.query, so we provide a local
 * `validateQuery(schema)` helper that mirrors `validate`'s contract
 * (parse → reassign → next(err)).
 *
 * PLANE: Platform
 */

"use strict";

const { z } = require("zod");

const feedQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
});

const dashboardQuerySchema = z.object({
    // 1 hour .. 30 days
    windowHours: z.coerce.number().int().min(1).max(24 * 30).default(24),
});

/**
 * Express middleware: parses req.query against a Zod schema, assigns
 * the parsed result back to req.query, and forwards ZodError via next().
 */
const validateQuery = (schema) => (req, res, next) => {
    try {
        req.query = schema.parse(req.query);
        next();
    } catch (err) {
        next(err);
    }
};

module.exports = {
    feedQuerySchema,
    dashboardQuerySchema,
    validateQuery,
};
