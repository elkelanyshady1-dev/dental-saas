/**
 * safeValidate.js — Defense-in-depth Zod validation wrapper
 *
 * Wraps schema.safeParse() to catch Zod v4 internal crashes (e.g., the
 * _zod TypeError when .strict() + .refine() on z.record() encounters
 * missing fields). Returns a consistent safeParse-shaped result even
 * when Zod itself throws.
 *
 * Usage:
 *   const { safeValidate, assertZod } = require("@utils/safeValidate");
 *
 *   const parsed = safeValidate(mySchema, req.body);
 *   if (!parsed.success) return res.status(400).json({ ... });
 */

"use strict";

/**
 * Validates that a schema is a valid Zod schema with a safeParse method.
 * Throws immediately at module load time if wiring is broken.
 *
 * @param {object} schema — Expected Zod schema
 * @param {string} name  — Schema name for error messages
 */
function assertZod(schema, name) {
    if (!schema || typeof schema.safeParse !== "function") {
        throw new Error(
            `[assertZod] "${name}" is not a valid Zod schema (got ${typeof schema}). ` +
            `Check imports in the validator file.`
        );
    }
}

/**
 * Safe wrapper around schema.safeParse() that catches Zod internal errors.
 *
 * @param {import("zod").ZodSchema} schema
 * @param {unknown} data
 * @returns {{ success: true, data: any } | { success: false, error: { errors: Array<{ message: string }> } }}
 */
function safeValidate(schema, data) {
    try {
        return schema.safeParse(data);
    } catch (err) {
        // Zod v4 internal crash (e.g., _zod TypeError)
        const message = err?.message?.includes("_zod")
            ? "Request body has an invalid shape — check required fields"
            : (err?.message || "Schema validation failed unexpectedly");

        return {
            success: false,
            error: {
                errors: [{ message, path: [], code: "custom" }],
                // Mimic ZodError shape so callers work unchanged
                issues: [{ message, path: [], code: "custom" }],
            },
        };
    }
}

module.exports = { safeValidate, assertZod };
