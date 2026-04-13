/**
 * contractEnforcer.js — DTO ↔ Schema Contract Enforcement Engine
 * Phase 10 — API Contract Automation
 *
 * Wraps DTO builders with Zod schema validation.
 * In ALL environments: safeParse() — logs violation, returns unvalidated DTO.
 * In DEV: ADDITIONALLY prints to stderr for maximum visibility.
 *
 * DESIGN DECISION: The enforcer DETECTS violations but never BLOCKS data.
 * Blocking is the CI contract tests' job, not runtime's job.
 * A single DTO serialization issue must never take down an entire API endpoint.
 *
 * Usage:
 *   const enforced = enforce(dto, schema, "buildPatientListDTO");
 *   // Returns Object.freeze(validated) or throws in dev
 *
 * This module is the bridge between:
 *   DTO builders (patient.dto.js, lab.dto.js) ↔ Zod response schemas
 */

"use strict";

const logger = require("../utils/logger");

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * enforce — validates a DTO object against its Zod response schema.
 *
 * @param {object} dto — The built DTO object (pre-freeze)
 * @param {import("zod").ZodSchema} schema — The response schema
 * @param {string} builderName — Name of the DTO builder (for diagnostics)
 * @returns {object} — The validated (and frozen) DTO
 */
function enforce(dto, schema, builderName) {
    if (!schema) {
        // No schema registered — skip validation (backward compat for domains
        // that haven't migrated to Phase 10 yet)
        return Object.freeze(dto);
    }

    if (IS_PROD) {
        // PROD: graceful — log and continue
        const result = schema.safeParse(dto);
        if (!result.success) {
            logger.error({
                event: "CONTRACT_VIOLATION",
                builder: builderName,
                errors: result.error?.errors?.slice(0, 5) || result.error?.issues?.slice(0, 5),
                itemId: dto?._id || dto?.id || "unknown",
            }, `[ContractEnforcer] DTO contract violation in ${builderName}`);
            // Return the original DTO — better to show data than crash in prod
            return Object.freeze(dto);
        }
        return Object.freeze(result.data);
    }

    // DEV: aggressive warning — log loudly but never crash API responses
    // The contract enforcer's job is to DETECT violations, not to BLOCK data.
    // Blocking belongs in CI (contract tests), not in runtime.
    const result = schema.safeParse(dto);
    if (!result.success) {
        const violations = result.error?.errors || result.error?.issues || [];
        logger.error({
            event: "CONTRACT_VIOLATION_DEV",
            builder: builderName,
            violations: violations.slice(0, 10),
            dto: JSON.stringify(dto).slice(0, 500),
        }, `[ContractEnforcer] ❌ CONTRACT VIOLATION — ${builderName} — fix this before deploy!`);

        // DEV-only: also print to stderr for max visibility
        if (process.stderr?.write) {
            process.stderr.write(
                `\n\x1b[31m[CONTRACT VIOLATION]\x1b[0m ${builderName}: ${violations.map(v => `${v.path?.join(".")}: ${v.message}`).join(", ")}\n`
            );
        }
        // Return unvalidated DTO — don't crash the app
        return Object.freeze(dto);
    }
    return Object.freeze(result.data);
}

/**
 * createEnforcedBuilder — factory that wraps a DTO builder function
 * with automatic schema enforcement.
 *
 * @param {Function} builderFn — Original DTO builder (e.g., buildPatientListDTO)
 * @param {import("zod").ZodSchema} schema — The response schema
 * @param {string} builderName — Name for diagnostics
 * @returns {Function} — Wrapped builder
 */
function createEnforcedBuilder(builderFn, schema, builderName) {
    return function enforcedBuilder(...args) {
        const dto = builderFn(...args);
        // DTOs are already Object.freeze'd — we need to work with a plain copy
        const plain = typeof dto === "object" && Object.isFrozen(dto)
            ? { ...dto }
            : dto;
        return enforce(plain, schema, builderName);
    };
}

module.exports = { enforce, createEnforcedBuilder };
