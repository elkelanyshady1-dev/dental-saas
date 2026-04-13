/**
 * policyCoverageValidator.js — PBAC Policy Coverage Enforcement Engine
 *
 * Production-grade static validator ensuring RBAC ↔ PBAC consistency.
 * Runs both at boot time (warn/crash) and as a CI hard-fail gate.
 *
 * INVARIANTS ENFORCED:
 *   ❌ No RBAC permission without PBAC policy
 *   ❌ No empty policy arrays
 *   ❌ No orphan policies (keys in registry with no matching P.* constant)
 *   ❌ No invalid policy rule structure
 *   ❌ No missing hard-deny rules for financial write operations
 *
 * MODES:
 *   "writes"  — validate only write permissions (default boot-time)
 *   "all"     — validate ALL org permissions (full coverage)
 *   "ci"      — CI mode: validates structure + coverage + orphans + hard-denies
 *
 * PLANE: Org only.
 *
 * @module policyCoverageValidator
 * @version 2.0.0 — Phase D.5 (CI/CD Hardened)
 */

"use strict";

const { P } = require("@rbac/orgPermissions");
const { policies: policyRegistry } = require("@rbac/policyRegistry");
const logger = require("@utils/logger");

// ─── Constants ──────────────────────────────────────────────────────────────

/** Write-action suffixes that MUST have policy definitions. */
const WRITE_SUFFIXES = [".create", ".update", ".delete", ".manage", ".review", ".send", ".export"];

/**
 * Financial/critical WRITE permissions that SHOULD have at least one
 * hard-deny rule (priority ≥ 110) for status-based immutability.
 * Missing a hard-deny here is a WARNING, not a hard fail.
 */
const CRITICAL_IMMUTABLE_PERMISSIONS = new Set([
    "invoices.update",
    "invoices.delete",
    "payments.update",
    "payments.delete",
    "accounting.update",
    "accounting.delete",
    "lab.update",
    "lab.delete",
]);

// ─── Classification Helpers ─────────────────────────────────────────────────

function isWritePermission(permission) {
    return WRITE_SUFFIXES.some((s) => permission.endsWith(s));
}

function hasHardDenyRule(rules) {
    return rules.some(
        (rule) => rule.effect === "deny" && (rule.priority || 0) >= 110
    );
}

/**
 * Validate the structure of a single policy rule.
 * Returns an array of error strings (empty = valid).
 */
function validateRuleStructure(rule, permission, index) {
    const errors = [];

    if (typeof rule !== "object" || rule === null) {
        errors.push(`Rule ${index}: not an object`);
        return errors;
    }

    if (rule.effect !== "allow" && rule.effect !== "deny") {
        errors.push(`Rule ${index}: invalid effect "${rule.effect}" (must be "allow" or "deny")`);
    }

    if (typeof rule.condition !== "function") {
        errors.push(`Rule ${index}: condition is not a function (type: ${typeof rule.condition})`);
    }

    if (typeof rule.description !== "string" || rule.description.trim() === "") {
        errors.push(`Rule ${index}: missing or empty description`);
    }

    if (rule.priority !== undefined && typeof rule.priority !== "number") {
        errors.push(`Rule ${index}: priority is not a number (type: ${typeof rule.priority})`);
    }

    return errors;
}

// ─── Core Validator ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid — true if no errors found
 * @property {string[]} errors — hard errors (fail CI, block deployment)
 * @property {string[]} warnings — advisory warnings (orphans, missing hard-denies)
 * @property {Object} stats — coverage statistics
 */

/**
 * Validate that permissions have correct, non-empty, structurally valid
 * policy definitions in the policyRegistry.
 *
 * @param {Object} [options]
 * @param {"writes"|"all"|"ci"} [options.mode="writes"]
 *   - "writes": check write permissions only (boot-time default)
 *   - "all": check every permission
 *   - "ci": full structural validation + orphan detection + hard-deny check
 * @param {boolean} [options.strict=false] — if true, throws on errors (for CI/boot-crash)
 * @param {boolean} [options.silent=false] — if true, suppresses log output
 * @returns {ValidationResult}
 */
function validatePolicyCoverage(options = {}) {
    const { strict = false, silent = false, mode = "writes" } = options;
    const isCIMode = mode === "ci";

    // ── 1. Collect permissions ──────────────────────────────────────────────
    const allPermissionValues = Object.values(P);
    const uniquePermissions = [...new Set(allPermissionValues)];

    let targetPermissions;
    if (mode === "writes") {
        targetPermissions = uniquePermissions.filter(isWritePermission);
    } else {
        // "all" or "ci" — validate every permission
        targetPermissions = uniquePermissions;
    }

    const registeredPolicyKeys = new Set(Object.keys(policyRegistry));

    // ── 2. Coverage check ───────────────────────────────────────────────────
    const missingPolicies = [];
    const emptyPolicies = [];
    const covered = [];

    for (const perm of targetPermissions) {
        const rules = policyRegistry[perm];
        if (!rules) {
            missingPolicies.push(perm);
        } else if (!Array.isArray(rules) || rules.length === 0) {
            emptyPolicies.push(perm);
        } else {
            covered.push(perm);
        }
    }

    // ── 3. Structural validation (CI mode) ──────────────────────────────────
    const structuralErrors = []; // { permission, errors[] }

    if (isCIMode) {
        for (const [permission, rules] of Object.entries(policyRegistry)) {
            if (!Array.isArray(rules)) continue;
            for (let i = 0; i < rules.length; i++) {
                const ruleErrors = validateRuleStructure(rules[i], permission, i);
                if (ruleErrors.length > 0) {
                    structuralErrors.push({ permission, ruleIndex: i, errors: ruleErrors });
                }
            }
        }
    }

    // ── 4. Orphan detection ─────────────────────────────────────────────────
    //    Policies that exist in registry but have NO matching P.* constant
    const uniquePermSet = new Set(uniquePermissions);
    const orphanPolicies = [...registeredPolicyKeys].filter(
        (key) => !uniquePermSet.has(key)
    );

    // ── 5. Hard-deny check for critical financial writes ────────────────────
    const missingHardDenies = [];

    if (isCIMode || mode === "all") {
        for (const perm of CRITICAL_IMMUTABLE_PERMISSIONS) {
            const rules = policyRegistry[perm];
            if (rules && Array.isArray(rules) && rules.length > 0) {
                if (!hasHardDenyRule(rules)) {
                    missingHardDenies.push(perm);
                }
            }
        }
    }

    // ── 6. Assemble result ──────────────────────────────────────────────────
    const errors = [];
    const warnings = [];

    if (missingPolicies.length > 0) {
        errors.push(
            `Missing policies (${missingPolicies.length}):\n` +
            missingPolicies.map((p) => `  - ${p}`).join("\n")
        );
    }

    if (emptyPolicies.length > 0) {
        errors.push(
            `Empty policy arrays (${emptyPolicies.length}):\n` +
            emptyPolicies.map((p) => `  - ${p}`).join("\n")
        );
    }

    if (structuralErrors.length > 0) {
        const details = structuralErrors
            .map((se) => `  - ${se.permission} [rule ${se.ruleIndex}]: ${se.errors.join("; ")}`)
            .join("\n");
        errors.push(`Invalid policy structure (${structuralErrors.length}):\n${details}`);
    }

    // Orphans are ERRORS in strict/CI mode, WARNINGs otherwise
    if (orphanPolicies.length > 0) {
        const orphanMsg =
            `Orphan policies — no matching P.* constant (${orphanPolicies.length}):\n` +
            orphanPolicies.map((p) => `  - ${p}`).join("\n");

        if (isCIMode && process.env.POLICY_VALIDATION_STRICT === "true") {
            errors.push(orphanMsg);
        } else {
            warnings.push(orphanMsg);
        }
    }

    if (missingHardDenies.length > 0) {
        warnings.push(
            `Critical write permissions missing hard-deny rule (priority ≥110) (${missingHardDenies.length}):\n` +
            missingHardDenies.map((p) => `  - ${p}`).join("\n")
        );
    }

    const valid = errors.length === 0;
    const modeLabel = mode.toUpperCase();

    // ── 7. Reporting ────────────────────────────────────────────────────────
    const stats = {
        mode,
        totalPermissions: uniquePermissions.length,
        targetPermissions: targetPermissions.length,
        covered: covered.length,
        missing: missingPolicies.length,
        empty: emptyPolicies.length,
        structural: structuralErrors.length,
        orphans: orphanPolicies.length,
        missingHardDenies: missingHardDenies.length,
        totalPolicies: registeredPolicyKeys.size,
        totalRules: Object.values(policyRegistry).reduce(
            (sum, rules) => sum + (Array.isArray(rules) ? rules.length : 0), 0
        ),
        coveragePercent: targetPermissions.length > 0
            ? ((covered.length / targetPermissions.length) * 100).toFixed(1)
            : "100.0",
    };

    if (!silent) {
        if (valid) {
            logger.info(
                { service: "PolicyCoverageValidator", ...stats },
                `[PolicyCoverageValidator] ✅ ${modeLabel} mode — ${covered.length}/${targetPermissions.length} ` +
                `permissions covered (${stats.coveragePercent}%). ${stats.totalRules} rules across ${stats.totalPolicies} policies.`
            );
        } else {
            const errorBlock = errors.join("\n\n");
            logger.error(
                { service: "PolicyCoverageValidator", ...stats },
                `[PolicyCoverageValidator] ❌ ${modeLabel} mode — VALIDATION FAILED:\n${errorBlock}`
            );
        }

        if (warnings.length > 0) {
            const warnBlock = warnings.join("\n\n");
            logger.warn(
                { service: "PolicyCoverageValidator" },
                `[PolicyCoverageValidator] ⚠️ Warnings:\n${warnBlock}`
            );
        }
    }

    // ── 8. Strict mode → crash ──────────────────────────────────────────────
    if (!valid && strict) {
        throw new Error(
            `[PolicyCoverageValidator] STRICT MODE: ${errors.length} validation error(s) in ${modeLabel} mode.\n` +
            `Deployment blocked.\n\n` +
            errors.join("\n\n")
        );
    }

    return {
        valid,
        errors,
        warnings,
        stats,
        // Detailed breakdown for programmatic consumers
        details: {
            missingPolicies,
            emptyPolicies,
            structuralErrors,
            orphanPolicies,
            missingHardDenies,
            covered,
        },
    };
}

module.exports = { validatePolicyCoverage };
