/**
 * enforceDTO.js — DTO Enforcement Wrapper
 * @bridge-layer (LOCKED)
 * @rls-bridge-passthrough — Pure validation. ZERO DB access.
 *
 * Runtime safety net that validates DTO transformer output
 * does not contain forbidden platform-internal fields.
 *
 * INVARIANTS:
 *   ✔ Runs AFTER the DTO transformer, BEFORE response
 *   ✔ Throws DTO_SANITIZATION_FAILED if any forbidden key detected
 *   ✔ Recursively checks nested objects and arrays
 *   ✔ Null/undefined inputs pass through unchanged
 *   ✔ Frozen objects are safe (Object.keys still works)
 *
 * USAGE:
 *   return enforceDTO(mapSubscription, contract);
 *   return invoices.map(inv => enforceDTO(mapInvoice, inv));
 *
 * PLANE: Bridge layer (services/bridges/)
 *
 * @module services/bridges/utils/enforceDTO
 */

"use strict";

const logger = require("../../../utils/logger");

/**
 * Forbidden keys that MUST NEVER appear in a bridge DTO.
 * Any match triggers an immediate hard error.
 */
const FORBIDDEN_KEYS = Object.freeze([
    "_id",
    "__v",
    "organizationId",
    "providerSubscriptionId",
    "providerPaymentId",
    "providerInvoiceId",
    "providerCustomerId",
    "providerDisputeId",
    "internalNotes",
    "actorId",
    "salesOwnerId",
    "createdBy",
    "activatedBy",
    "terminatedBy",
    "metadata",
]);

/**
 * Recursively checks an object tree for forbidden keys.
 *
 * @param {*} obj - The value to check (recursive)
 * @param {string} path - Current object path (for error context)
 * @throws {Error} DTO_SANITIZATION_FAILED if any forbidden key found
 */
function deepCheck(obj, path) {
    if (!obj || typeof obj !== "object") return;

    // Handle arrays — check each element
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            deepCheck(obj[i], `${path}[${i}]`);
        }
        return;
    }

    // Handle plain objects
    for (const key of Object.keys(obj)) {
        if (FORBIDDEN_KEYS.includes(key)) {
            const err = new Error(
                `[DTO_SANITIZATION_FAILED] Forbidden key "${key}" found at path "${path}.${key}". ` +
                `Bridge DTO transformers MUST strip platform-internal fields.`
            );
            err.code = "DTO_SANITIZATION_FAILED";
            err.status = 500;

            logger.error({
                event: "DTO_SANITIZATION_FAILED",
                forbiddenKey: key,
                path: `${path}.${key}`,
            }, "[enforceDTO] SECURITY: Platform-internal field leaked into bridge DTO");

            throw err;
        }

        deepCheck(obj[key], `${path}.${key}`);
    }
}

/**
 * Enforces DTO sanitization by running a transformer and then verifying
 * the result contains no forbidden platform-internal fields.
 *
 * @param {Function} mapper - DTO transformer function (e.g., mapSubscription)
 * @param {*} data - Raw data to transform (Mongoose doc or plain object)
 * @returns {*} The transformed DTO (pass-through)
 * @throws {Error} DTO_SANITIZATION_FAILED if forbidden keys detected
 */
function enforceDTO(mapper, data) {
    const result = mapper(data);

    // Null/undefined pass through (mapper returned null for null input)
    if (result == null) return result;

    // Deep-check the result for forbidden keys
    deepCheck(result, "dto");

    return result;
}

module.exports = { enforceDTO, FORBIDDEN_KEYS };
