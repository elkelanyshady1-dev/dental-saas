#!/usr/bin/env node
/**
 * validateSecurityChain.js — CI/CD Unified Security Chain Validation
 * Phase F.10 — Post-Certification Regression Prevention
 *
 * PURPOSE:
 * Runs ALL security chain validators in a single pipeline and produces
 * a unified pass/fail result. Designed for CI/CD — exits 1 on any failure.
 *
 * VALIDATORS EXECUTED (in order):
 *   1. checkRawModelUsage.js           — Raw Model Detection (INV-21)
 *   2. checkAggregateSecurity.js        — Aggregate Pipeline Security (INV-22)
 *   3. validateRLSTaxonomy.js           — Taxonomy Enforcement (INV-26)
 *   4. checkFieldAccessCompliance.js    — Field-Level Security Parity (INV-27)
 *
 * USAGE:
 *   node scripts/validateSecurityChain.js           — run all validators
 *   node scripts/validateSecurityChain.js --strict   — enforce strict mode on all
 *
 * NPM SCRIPT:
 *   npm run validate:security-chain
 *   npm run validate:security-chain:strict
 *
 * INVARIANT: INV-29 — ZERO_DRIFT_ENFORCEMENT
 *   Deployment MUST fail if any validation fails.
 *
 * @version 1.0.0 — Phase F.10
 */

"use strict";

const { execSync } = require("child_process");
const path = require("path");

// ── Configuration ────────────────────────────────────────────────────────────

const strict = process.argv.includes("--strict");

const VALIDATORS = [
    {
        name: "Raw Model Detection",
        invariant: "INV-21",
        description: "No raw Mongoose model queries (secureModel required)",
        script: "checkRawModelUsage.js",
        critical: true,
    },
    {
        name: "Aggregate Pipeline Security",
        invariant: "INV-22",
        description: "All aggregation pipelines use aggregateSecurity",
        script: "checkAggregateSecurity.js",
        critical: true,
    },
    {
        name: "RLS Taxonomy Enforcement",
        invariant: "INV-26",
        description: "All RLS-annotated files use valid taxonomy types",
        script: "validateRLSTaxonomy.js",
        critical: true,
    },
    {
        name: "Field-Level Security Parity",
        invariant: "INV-27",
        description: "Read filter + Write guard coverage at 100%",
        script: "checkFieldAccessCompliance.js",
        critical: true,
    },
];

// ── Runner ───────────────────────────────────────────────────────────────────

console.log("\n══════════════════════════════════════════════════════════════");
console.log("  SECURITY CHAIN VALIDATION — Phase F.10 Post-Certification");
console.log(`  Mode: ${strict ? "STRICT (CI gate — exit 1 on any failure)" : "ADVISORY (warnings only)"}`);
console.log(`  Date: ${new Date().toISOString()}`);
console.log("══════════════════════════════════════════════════════════════\n");

const results = [];
let totalPassed = 0;
let totalFailed = 0;

for (const validator of VALIDATORS) {
    const scriptPath = path.resolve(__dirname, validator.script);
    const flagSuffix = strict ? " --strict" : "";

    console.log(`  ▶ [${validator.invariant}] ${validator.name}`);
    console.log(`    ${validator.description}`);

    try {
        execSync(`node "${scriptPath}"${flagSuffix}`, {
            cwd: path.resolve(__dirname, ".."),
            stdio: "pipe",
            timeout: 30_000,
        });

        results.push({ ...validator, status: "PASS" });
        totalPassed++;
        console.log(`    ✅ PASS\n`);
    } catch (err) {
        // In strict mode, a non-zero exit is a failure
        // In advisory mode, only log the warning
        const output = (err.stdout?.toString() || "").split("\n").slice(-5).join("\n    ");
        results.push({ ...validator, status: "FAIL", output });
        totalFailed++;
        console.log(`    ❌ FAIL`);
        if (output.trim()) {
            console.log(`    ${output.trim()}`);
        }
        console.log();
    }
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log("══════════════════════════════════════════════════════════════");
console.log("  SECURITY CHAIN VALIDATION SUMMARY");
console.log("══════════════════════════════════════════════════════════════");
console.log();

for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : "❌";
    console.log(`  ${icon} [${r.invariant}] ${r.name}: ${r.status}`);
}

console.log();
console.log(`  Passed:     ${totalPassed}/${VALIDATORS.length}`);
console.log(`  Failed:     ${totalFailed}/${VALIDATORS.length}`);
console.log(`  Coverage:   ${((totalPassed / VALIDATORS.length) * 100).toFixed(1)}%`);
console.log();

if (totalFailed > 0) {
    console.log("  ⚠️  SECURITY CHAIN INCOMPLETE — Violations detected");
    console.log("  The following invariants are not satisfied:");
    for (const r of results.filter((v) => v.status === "FAIL")) {
        console.log(`    • ${r.invariant}: ${r.name}`);
    }
    console.log();

    if (strict) {
        console.error("  ❌ STRICT MODE: Security chain validation FAILED.");
        console.error("     Deployment MUST NOT proceed (INV-29).\n");
        process.exit(1);
    } else {
        console.log("  ℹ️  ADVISORY MODE: Violations reported but not blocking.\n");
    }
} else {
    console.log("  ✅ ALL SECURITY CHAIN INVARIANTS SATISFIED");
    console.log("  Deployment may proceed — zero-drift state confirmed.\n");
}

process.exit(0);
