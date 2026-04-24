/**
 * parseSafe.js
 * ────────────
 * Thin wrapper around `schema.safeParse()` that:
 *   1. Asserts the schema is a real Zod schema BEFORE parsing.
 *   2. Catches internal Zod parser crashes (e.g. malformed schema reaching
 *      runtime) and re-throws with a useful label instead of leaking
 *      `Cannot read properties of undefined (reading '_zod')` to the caller.
 *
 * Drop-in replacement for `schema.safeParse(data)`:
 *
 *   const result = parseSafe(patchWorkflowSchema, req.body, "patchWorkflow");
 *   if (!result.success) { ... }
 */

"use strict";

function parseSafe(schema, data, label = "unknown") {
    if (!schema || typeof schema.safeParse !== "function") {
        throw new Error(
            `[parseSafe] Invalid schema for "${label}": expected a Zod schema, got ${schema === undefined ? "undefined" : typeof schema}`
        );
    }

    try {
        return schema.safeParse(data);
    } catch (err) {
        // Zod itself should NEVER throw from safeParse — it returns
        // { success: false, error }. If we get here, the schema definition
        // itself is malformed (e.g. v3-style z.record under v4).
        console.error("[parseSafe] Zod internal crash", {
            label,
            error: err && err.message,
        });
        throw new Error(`[parseSafe] Schema execution failed in "${label}": ${err && err.message}`);
    }
}

/**
 * Strict variant — throws on validation failure, returns parsed data.
 * Use sparingly; prefer parseSafe + explicit handling.
 */
function parseStrict(schema, data, label = "unknown") {
    const result = parseSafe(schema, data, label);
    if (!result.success) {
        const err = new Error(`[parseStrict] Validation failed in "${label}"`);
        err.zodError = result.error;
        throw err;
    }
    return result.data;
}

module.exports = { parseSafe, parseStrict };
