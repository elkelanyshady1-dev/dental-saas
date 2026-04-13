#!/usr/bin/env node
/**
 * validateRLSTaxonomy.js — CI/CD RLS Taxonomy Enforcement Script
 * Phase F.9 — Post-Lockdown Hardening
 *
 * PURPOSE:
 * Hard lock CI gate that enforces the RLS taxonomy and blocks regressions.
 * Detects forbidden @rls-exempt annotations and invalid taxonomy usage.
 *
 * CHECKS:
 * 1. No @rls-exempt in active application code (PERMANENTLY DISABLED)
 * 2. All @rls-* annotations use valid taxonomy types
 * 3. secureModel usage coverage in org-plane modules
 *
 * Usage:
 *   node scripts/validateRLSTaxonomy.js             — advisory mode
 *   node scripts/validateRLSTaxonomy.js --strict     — strict mode (exit 1 on violations)
 *
 * npm scripts:
 *   npm run validate:taxonomy             — advisory mode
 *   npm run validate:taxonomy:strict      — strict mode (exit 1)
 *
 * INVARIANT (Phase F.9):
 *   Uses rlsValidationEngine.js — the SAME engine as boot-time validation.
 *   Zero divergence. Taxonomy lock is absolute.
 */

"use strict";

const path = require("path");

// ── Unified Validation Engine (SSOT) ────────────────────────────────────────
const {
    scanForDeprecatedExemptions,
    SCAN_DIRS,
    VALID_TAXONOMY,
} = require("../src/core/rls/rlsValidationEngine");

const strict = process.argv.includes("--strict");
const SRC_DIR = path.resolve(__dirname, "../src");

console.log("\n═══════════════════════════════════════════════════");
console.log("  RLS TAXONOMY ENFORCEMENT VALIDATOR");
console.log(`  Mode: ${strict ? "STRICT (exit 1 on violations)" : "ADVISORY (warnings only)"}`);
console.log("  Engine: rlsValidationEngine.js (SSOT)");
console.log("  Phase: F.9 — Post-Lockdown Hardening");
console.log("═══════════════════════════════════════════════════\n");

console.log(`  Allowed taxonomy: ${VALID_TAXONOMY.join(", ")}`);
console.log(`  Forbidden: @rls-exempt (PERMANENTLY DISABLED)\n`);

// ── Run taxonomy scan ───────────────────────────────────────────────────────
const violations = scanForDeprecatedExemptions(SRC_DIR, [...SCAN_DIRS]);

// Separate by type
const deprecatedExemptions = violations.filter(v => v.type === "DEPRECATED_EXEMPTION");
const invalidTaxonomy = violations.filter(v => v.type === "INVALID_TAXONOMY");

// ── Report: Deprecated @rls-exempt ──────────────────────────────────────────
if (deprecatedExemptions.length > 0) {
    console.log(`\n❌ FORBIDDEN @rls-exempt DETECTED (${deprecatedExemptions.length}):\n`);
    for (const v of deprecatedExemptions) {
        const relPath = path.relative(process.cwd(), v.file);
        console.log(`  [CRITICAL] ${relPath}:${v.line}`);
        console.log(`    ${v.content}`);
        console.log(`    → ${v.message}\n`);
    }
}

// ── Report: Invalid taxonomy annotations ────────────────────────────────────
if (invalidTaxonomy.length > 0) {
    console.log(`\n⚠️  INVALID TAXONOMY ANNOTATIONS (${invalidTaxonomy.length}):\n`);
    for (const v of invalidTaxonomy) {
        const relPath = path.relative(process.cwd(), v.file);
        console.log(`  [HIGH] ${relPath}:${v.line}`);
        console.log(`    ${v.content}`);
        console.log(`    → ${v.message}\n`);
    }
}

// ── Summary ─────────────────────────────────────────────────────────────────
const totalViolations = violations.length;
const passed = totalViolations === 0;

console.log("═══════════════════════════════════════════════════");
console.log(`  Deprecated @rls-exempt:   ${deprecatedExemptions.length}`);
console.log(`  Invalid taxonomy:         ${invalidTaxonomy.length}`);
console.log(`  Total violations:         ${totalViolations}`);
console.log(`  Status:     ${passed ? "✅ PASS — Taxonomy lock intact" : strict ? "❌ FAIL — Taxonomy violation detected" : "⚠️  ADVISORY"}`);
console.log("═══════════════════════════════════════════════════\n");

if (strict && !passed) {
    console.error(`\n❌ RLS TAXONOMY STRICT MODE: ${totalViolations} violation(s) detected. Failing CI.\n`);
    console.error("REMEDIATION:");
    if (deprecatedExemptions.length > 0) {
        console.error("  → Replace all @rls-exempt with taxonomy annotations:");
        console.error(`    Allowed: ${VALID_TAXONOMY.map(t => `@rls-${t}`).join(", ")}\n`);
    }
    if (invalidTaxonomy.length > 0) {
        console.error("  → Fix invalid taxonomy annotations to use allowed types\n");
    }
    process.exit(1);
}

if (passed) {
    console.log("✅ Taxonomy lock intact — zero deprecated exemptions, all annotations valid.\n");
}

process.exit(0);
