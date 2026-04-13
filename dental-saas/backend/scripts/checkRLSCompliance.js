#!/usr/bin/env node
/**
 * checkRLSCompliance.js — CI/CD RLS Enforcement Script
 * Phase F.5.1 — Unified with rlsValidationEngine.js
 *
 * Usage:
 *   node scripts/checkRLSCompliance.js           — advisory mode
 *   node scripts/checkRLSCompliance.js --strict   — strict mode (exit 1 on violations)
 *
 * npm scripts:
 *   npm run validate:rls           — advisory mode
 *   npm run validate:rls:strict    — strict mode
 *
 * INVARIANT (Phase F.5.1):
 *   Uses rlsValidationEngine.js — the SAME engine as boot-time validation.
 *   No duplicate scanning logic. Zero divergence.
 */

"use strict";

const path = require("path");

// ── Unified Validation Engine (SSOT) ────────────────────────────────────────
const { runValidation, SCAN_DIRS } = require("../src/core/rls/rlsValidationEngine");

const strict = process.argv.includes("--strict");
const SRC_DIR = path.resolve(__dirname, "../src");

console.log("\n═══════════════════════════════════════════");
console.log("  RLS COMPLIANCE VALIDATOR");
console.log(`  Mode: ${strict ? "STRICT (exit 1 on violations)" : "ADVISORY (warnings only)"}`);
console.log("  Engine: rlsValidationEngine.js (SSOT)");
console.log("═══════════════════════════════════════════\n");

// Run unified validation — same engine as boot-time
const result = runValidation({
    srcDir: SRC_DIR,
    scanDirs: [...SCAN_DIRS],
    includeDeprecated: false,
    silent: true,
});

// Print violations
if (result.violations.length > 0) {
    console.log(`\n⚠️  RAW QUERY VIOLATIONS (${result.violations.length}):\n`);

    for (const v of result.violations) {
        const relPath = path.relative(process.cwd(), v.file);
        console.log(`  ${relPath}:${v.line} — ${v.method}()`);
        console.log(`    ${v.content}`);
        console.log();
    }
}

// Summary
console.log("═══════════════════════════════════════════");
console.log(`  Scanned:    ${result.scanned} files`);
console.log(`  Exempt:     ${result.exempt} files`);
console.log(`  Violations: ${result.violations.length}`);
console.log(`  Registry:   ${result.registryValidated ? "✅ VALIDATED" : "⚠️  NOT LOADED"}`);
console.log(`  Status:     ${result.violations.length === 0 ? "✅ PASS" : strict ? "❌ FAIL" : "⚠️  ADVISORY"}`);
console.log("═══════════════════════════════════════════\n");

if (strict && result.violations.length > 0) {
    console.error(`\n❌ RLS STRICT MODE: ${result.violations.length} violation(s) detected. Failing CI.\n`);
    process.exit(1);
}

if (result.violations.length === 0) {
    console.log("✅ Full RLS compliance — zero raw queries detected.\n");
}

process.exit(0);
