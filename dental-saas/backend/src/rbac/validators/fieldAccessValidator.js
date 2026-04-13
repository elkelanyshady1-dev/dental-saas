/**
 * fieldAccessValidator.js — Boot-Time & CI Field Access Coverage Validator (v2.0)
 *
 * Validates that:
 *   1. Every resource type has field definitions for ALL org roles
 *   2. org_admin always has ["*"] (full access)
 *   3. No empty arrays exist (must use undefined for "no access")
 *   4. Read registry (fieldAccessRegistry) and write registry (fieldWriteGuard)
 *      have consistent resource type lists
 *   5. All expected modules are covered
 *
 * MODES:
 *   boot    — runs at server start, warns only
 *   strict  — runs at server start, crashes on failure
 *   ci      — runs in CI, exits with code 1 on failure
 *
 * PLANE: Org only.
 *
 * @module fieldAccessValidator
 * @version 2.0.0 — Phase E (FLS Completion)
 */

"use strict";

const { fieldAccess, getResourceTypes } = require("@rbac/fieldAccessRegistry");
const { writeAccess } = require("@rbac/fieldWriteGuard");
const { ORG_ROLES } = require("@rbac/orgPermissions");
const logger = require("@utils/logger");

// ─── Expected Module Coverage ───────────────────────────────────────────────

/**
 * All org-plane modules that MUST have field access definitions.
 * This list is the enforcement target — adding a new module requires
 * adding it here AND to fieldAccessRegistry.js.
 */
const REQUIRED_RESOURCE_TYPES = [
    "patient",
    "appointment",
    "invoice",
    "payment",
    "treatment",
    "procedure",
    "user",
    "branch",
    "orthodonticCase",
    "inventory",
    "lab",
    "communication",
    "analytics",
    "support",
    "dashboard",
];

// ─── Validator ──────────────────────────────────────────────────────────────

/**
 * Validate field access registry completeness and consistency.
 *
 * @param {Object} [options]
 * @param {boolean} [options.strict=false] — throw on validation failure
 * @param {boolean} [options.silent=false] — suppress log output
 * @param {boolean} [options.checkWriteGuard=true] — also validate writeAccess consistency
 * @returns {{ valid: boolean, errors: string[], warnings: string[], stats: Object }}
 */
function validateFieldAccess(options = {}) {
    const {
        strict = false,
        silent = false,
        checkWriteGuard = true,
    } = options;

    const errors = [];
    const warnings = [];
    const readResourceTypes = getResourceTypes();
    const writeResourceTypes = Object.keys(writeAccess || {});

    // ── 1. Required resource type coverage ─────────────────────────────
    const registeredSet = new Set(readResourceTypes);
    const missingResources = REQUIRED_RESOURCE_TYPES.filter(
        (rt) => !registeredSet.has(rt)
    );

    if (missingResources.length > 0) {
        errors.push(
            `Missing resource types in fieldAccessRegistry (${missingResources.length}):\n` +
            missingResources.map((r) => `  - ${r}`).join("\n")
        );
    }

    // ── 2. Per-resource validation ────────────────────────────────────
    let totalRoles = 0;
    let fullAccessEntries = 0;
    let whitelistEntries = 0;
    let denyEntries = 0; // roles with no definition (undefined = deny)

    for (const resourceType of readResourceTypes) {
        const definition = fieldAccess[resourceType];
        if (!definition) {
            errors.push(`Resource "${resourceType}" has null/undefined field access definition.`);
            continue;
        }

        // org_admin MUST always have ["*"] (full access)
        if (
            !definition.org_admin ||
            !Array.isArray(definition.org_admin) ||
            definition.org_admin[0] !== "*"
        ) {
            errors.push(
                `Resource "${resourceType}": org_admin does not have ["*"]. ` +
                `This restricts admin visibility and violates the FLS invariant.`
            );
        }

        // Check all role coverage
        const definedRoles = Object.keys(definition);
        const missingRoles = ORG_ROLES.filter((role) => !definedRoles.includes(role));

        for (const role of definedRoles) {
            totalRoles++;
            const fields = definition[role];

            // Check for empty arrays (invalid — use undefined for "no access")
            if (Array.isArray(fields) && fields.length === 0) {
                errors.push(
                    `Resource "${resourceType}", role "${role}": empty array []. ` +
                    `Use undefined (omit) for "no access" or specify fields.`
                );
            }

            // Classify
            if (Array.isArray(fields) && fields.length === 1 && fields[0] === "*") {
                fullAccessEntries++;
            } else if (Array.isArray(fields) && fields.length > 0) {
                whitelistEntries++;
            }
        }

        // Track roles that have implicit deny (undefined)
        denyEntries += missingRoles.length;

        // Log missing roles as debug info (undefined = intentional deny)
        if (missingRoles.length > 0 && !silent) {
            logger.debug(
                `[FieldAccessValidator] Resource "${resourceType}": roles without field definitions ` +
                `(will return empty object): ${missingRoles.join(", ")}`
            );
        }
    }

    // ── 3. Write guard consistency ────────────────────────────────────
    if (checkWriteGuard) {
        const writeSet = new Set(writeResourceTypes);
        const readSet = new Set(readResourceTypes);

        // Resources in read but not write
        const readOnly = readResourceTypes.filter((rt) => !writeSet.has(rt));
        if (readOnly.length > 0) {
            warnings.push(
                `Resources in fieldAccessRegistry but NOT fieldWriteGuard (${readOnly.length}):\n` +
                readOnly.map((r) => `  - ${r}`).join("\n") +
                "\n  (May be intentional for read-only resources)"
            );
        }

        // Resources in write but not read
        const writeOnly = writeResourceTypes.filter((rt) => !readSet.has(rt));
        if (writeOnly.length > 0) {
            errors.push(
                `Resources in fieldWriteGuard but NOT fieldAccessRegistry (${writeOnly.length}):\n` +
                writeOnly.map((r) => `  - ${r}`).join("\n")
            );
        }
    }

    // ── 4. Assemble result ───────────────────────────────────────────
    const valid = errors.length === 0;

    const stats = {
        requiredResourceTypes: REQUIRED_RESOURCE_TYPES.length,
        registeredResourceTypes: readResourceTypes.length,
        writeGuardResourceTypes: writeResourceTypes.length,
        missingResources: missingResources.length,
        totalRoleEntries: totalRoles,
        fullAccessEntries,
        whitelistEntries,
        implicitDenyEntries: denyEntries,
        coveragePercent: REQUIRED_RESOURCE_TYPES.length > 0
            ? (((REQUIRED_RESOURCE_TYPES.length - missingResources.length) / REQUIRED_RESOURCE_TYPES.length) * 100).toFixed(1)
            : "100.0",
    };

    // ── 5. Reporting ─────────────────────────────────────────────────
    if (!silent) {
        if (valid) {
            logger.info(
                { service: "FieldAccessValidator", ...stats },
                `[FieldAccessValidator] ✅ ${readResourceTypes.length} resource types validated. ` +
                `${totalRoles} role entries (${fullAccessEntries} full, ${whitelistEntries} whitelist, ${denyEntries} deny). ` +
                `Coverage: ${stats.coveragePercent}%.`
            );
        } else {
            const errorBlock = errors.join("\n\n");
            logger.error(
                { service: "FieldAccessValidator", ...stats },
                `[FieldAccessValidator] ❌ VALIDATION FAILED:\n${errorBlock}`
            );
        }

        if (warnings.length > 0) {
            logger.warn(
                { service: "FieldAccessValidator" },
                `[FieldAccessValidator] ⚠️ Warnings:\n${warnings.join("\n\n")}`
            );
        }
    }

    // ── 6. Strict mode → crash ──────────────────────────────────────
    if (!valid && strict) {
        throw new Error(
            `[FieldAccessValidator] STRICT MODE: ${errors.length} field access error(s). ` +
            `Deployment blocked.\n\n` +
            errors.join("\n\n")
        );
    }

    return { valid, errors, warnings, stats };
}

module.exports = { validateFieldAccess, REQUIRED_RESOURCE_TYPES };
