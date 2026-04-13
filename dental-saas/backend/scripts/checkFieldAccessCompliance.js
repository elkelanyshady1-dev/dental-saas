#!/usr/bin/env node

/**
 * checkFieldAccessCompliance.js — CI-Ready Field Access Coverage Validator
 *
 * Standalone script that validates field-level security coverage
 * for all org-plane resource types. Designed for CI pipelines.
 *
 * USAGE:
 *   node scripts/checkFieldAccessCompliance.js          # advisory mode
 *   node scripts/checkFieldAccessCompliance.js --strict  # exit 1 on failure
 *
 * WHAT IT CHECKS:
 *   1. All required resource types have field access definitions
 *   2. org_admin always has ["*"] (full access)
 *   3. No empty arrays (use undefined for "no access")
 *   4. Read and write registries have consistent resource type lists
 *   5. All org roles are covered in each resource type
 *
 * EXIT CODES:
 *   0  — all checks passed
 *   1  — violations found (strict mode)
 *
 * @module checkFieldAccessCompliance
 * @version 1.0.0 — Phase E.1
 */

"use strict";

require("module-alias/register");
require("dotenv").config();

const { validateFieldAccess, REQUIRED_RESOURCE_TYPES } = require("../src/rbac/validators/fieldAccessValidator");
const { fieldAccess, getResourceTypes } = require("../src/rbac/fieldAccessRegistry");
const { ORG_ROLES } = require("../src/rbac/orgPermissions");

const strict = process.argv.includes("--strict");
const verbose = process.argv.includes("--verbose");

// ─── Banner ─────────────────────────────────────────────────────────────────

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║       FIELD ACCESS COMPLIANCE VALIDATOR (Phase E.1)     ║");
console.log(`║       Mode: ${strict ? "STRICT (CI gate)" : "ADVISORY"}                            ║`);
console.log("╚══════════════════════════════════════════════════════════╝");
console.log();

// ─── Run Validator ──────────────────────────────────────────────────────────

const result = validateFieldAccess({
    strict: false, // We handle exit ourselves
    silent: true,   // We print our own output
    checkWriteGuard: true,
});

// ─── Print Coverage Matrix ──────────────────────────────────────────────────

const registeredTypes = getResourceTypes();

console.log("┌─────────────────────────────────────────────────────────┐");
console.log("│  RESOURCE COVERAGE MATRIX                              │");
console.log("├───────────────────┬─────────────────────────────────────┤");
console.log("│ Resource Type     │ Roles Covered                      │");
console.log("├───────────────────┼─────────────────────────────────────┤");

for (const rt of REQUIRED_RESOURCE_TYPES) {
    const def = fieldAccess[rt];
    if (!def) {
        console.log(`│ ❌ ${rt.padEnd(15)} │ MISSING DEFINITION                  │`);
        continue;
    }

    const roles = ORG_ROLES.map((role) => {
        if (!def[role]) return `${role}:✗`;
        if (Array.isArray(def[role]) && def[role][0] === "*") return `${role}:★`;
        return `${role}:✓`;
    }).join(" ");

    const icon = ORG_ROLES.every((r) => def[r]) ? "✅" : "⚠️";
    console.log(`│ ${icon} ${rt.padEnd(15)} │ ${roles.substring(0, 36).padEnd(36)}│`);
}

console.log("└───────────────────┴─────────────────────────────────────┘");
console.log();
console.log("  Legend: ★ = full access [*]  ✓ = whitelist  ✗ = deny (undefined)");
console.log();

// ─── Print Detailed Verbose ─────────────────────────────────────────────────

if (verbose) {
    console.log("┌─────────────────────────────────────────────────────────┐");
    console.log("│  DETAILED FIELD ACCESS (per resource × role)            │");
    console.log("└─────────────────────────────────────────────────────────┘");

    for (const rt of registeredTypes) {
        console.log(`\n  📦 ${rt}:`);
        const def = fieldAccess[rt];
        for (const role of ORG_ROLES) {
            const fields = def[role];
            if (!fields) {
                console.log(`     ${role.padEnd(16)} → DENY (no definition)`);
            } else if (fields[0] === "*") {
                console.log(`     ${role.padEnd(16)} → FULL ACCESS [*]`);
            } else {
                console.log(`     ${role.padEnd(16)} → ${fields.length} fields: [${fields.slice(0, 5).join(", ")}${fields.length > 5 ? ", ..." : ""}]`);
            }
        }
    }
    console.log();
}

// ─── Summary ────────────────────────────────────────────────────────────────

const { stats } = result;

console.log("┌─────────────────────────────────────────────────────────┐");
console.log("│  VALIDATION SUMMARY                                    │");
console.log("├──────────────────────────────┬──────────────────────────┤");
console.log(`│ Required resource types      │ ${String(stats.requiredResourceTypes).padEnd(25)}│`);
console.log(`│ Registered resource types    │ ${String(stats.registeredResourceTypes).padEnd(25)}│`);
console.log(`│ Write guard resource types   │ ${String(stats.writeGuardResourceTypes).padEnd(25)}│`);
console.log(`│ Missing resources            │ ${String(stats.missingResources).padEnd(25)}│`);
console.log(`│ Coverage                     │ ${(stats.coveragePercent + "%").padEnd(25)}│`);
console.log(`│ Total role entries           │ ${String(stats.totalRoleEntries).padEnd(25)}│`);
console.log(`│ Full access entries          │ ${String(stats.fullAccessEntries).padEnd(25)}│`);
console.log(`│ Whitelist entries            │ ${String(stats.whitelistEntries).padEnd(25)}│`);
console.log(`│ Implicit deny entries        │ ${String(stats.implicitDenyEntries).padEnd(25)}│`);
console.log("└──────────────────────────────┴──────────────────────────┘");
console.log();

// ─── Errors ─────────────────────────────────────────────────────────────────

if (result.errors.length > 0) {
    console.log("❌ ERRORS:");
    result.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    console.log();
}

if (result.warnings.length > 0) {
    console.log("⚠️  WARNINGS:");
    result.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${w}`));
    console.log();
}

// ─── Exit ───────────────────────────────────────────────────────────────────

if (result.valid) {
    console.log("✅ FIELD ACCESS COMPLIANCE: PASSED");
    console.log(`   ${stats.registeredResourceTypes} resource types, ${stats.totalRoleEntries} role entries, ${stats.coveragePercent}% coverage`);
    process.exit(0);
} else {
    console.log(`❌ FIELD ACCESS COMPLIANCE: FAILED (${result.errors.length} error(s))`);
    if (strict) {
        console.log("   🚫 Strict mode — blocking deployment.");
        process.exit(1);
    } else {
        console.log("   ⚠️  Advisory mode — not blocking. Use --strict to enforce.");
        process.exit(0);
    }
}
