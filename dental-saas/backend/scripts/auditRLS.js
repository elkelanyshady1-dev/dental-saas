#!/usr/bin/env node

/**
 * auditRLS.js — Row-Level Security Compliance Auditor
 * Phase F.5.1 — Unified with rlsValidationEngine.js
 *
 * PURPOSE:
 * CI-facing RLS audit script. All scanning logic is delegated to
 * rlsValidationEngine.js (SSOT) to ensure boot = CI consistency.
 *
 * Scans the codebase for:
 * 1. Raw Mongoose model queries that bypass secureModel (VIOLATION)
 * 2. Deprecated buildScopedQuery usage (DEPRECATION WARNING)
 * 3. Direct req.organizationId usage in services (LEGACY PATTERN)
 * 4. RLS coverage metrics (secureModel adoption rate) — Phase F.5
 * 5. Exemption registry integration (centralized tracking) — Phase F.5
 *
 * USAGE:
 *   node scripts/auditRLS.js              # Advisory mode (warnings only)
 *   node scripts/auditRLS.js --strict     # Strict mode (exit 1 on violations)
 *   npm run audit:rls                     # Via npm script
 *   npm run audit:rls:strict              # Strict mode via npm script
 *
 * ENV OVERRIDE:
 *   RLS_STRICT=true node scripts/auditRLS.js
 *
 * INVARIANT (Phase F.5.1):
 *   This script uses rlsValidationEngine.js — the SAME engine used by
 *   boot-time validation. Any change to exemption patterns, safe markers,
 *   or query detection MUST be made in rlsValidationEngine.js ONLY.
 *
 * @module auditRLS
 */

"use strict";

const path = require("path");

// ─── Unified Validation Engine (SSOT) ───────────────────────────────────────

const {
    runValidation,
    countSecureModelUsage,
    SCAN_DIRS,
} = require("../src/core/rls/rlsValidationEngine");

const SRC_DIR = path.resolve(__dirname, "../src");

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
    const strict = process.argv.includes("--strict") || process.env.RLS_STRICT === "true";

    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║      🔐 RLS Compliance Auditor — Phase F.5.1              ║");
    console.log(`║      Mode: ${strict ? "STRICT (CI GATE)" : "ADVISORY"}                                   ║`);
    console.log("║      Engine: rlsValidationEngine.js (SSOT)                ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    // ── Run unified validation ──────────────────────────────────────────────
    const result = runValidation({
        srcDir: SRC_DIR,
        scanDirs: [...SCAN_DIRS],
        includeDeprecated: true,
        silent: false,
    });

    // ─── RLS Violations Report ──────────────────────────────────────────────

    console.log("📊 RLS SCAN RESULTS\n");
    console.log(`   Files scanned:  ${result.scanned}`);
    console.log(`   Files exempt:   ${result.exempt}`);
    console.log(`   Violations:     ${result.violations.length}`);
    console.log(`   Registry:       ${result.registryValidated ? "✅ VALIDATED" : "⚠️  NOT LOADED"}`);
    console.log(`   Status:         ${result.violations.length === 0 ? "✅ CLEAN" : "⚠️  VIOLATIONS DETECTED"}\n`);

    if (result.violations.length > 0) {
        console.log("─── VIOLATIONS BY MODULE ───────────────────────────────────────\n");

        for (const [moduleName, violations] of result.violationsByModule) {
            console.log(`  📁 ${moduleName} (${violations.length} violation${violations.length > 1 ? "s" : ""})`);
            for (const v of violations) {
                const relPath = path.relative(process.cwd(), v.file);
                console.log(`     ❌ ${relPath}:${v.line} — raw ${v.method}()`);
                console.log(`        ${v.content}`);
            }
            console.log();
        }

        // Summary Table
        console.log("─── VIOLATION SUMMARY ──────────────────────────────────────────\n");

        const methodCounts = {};
        for (const v of result.violations) {
            methodCounts[v.method] = (methodCounts[v.method] || 0) + 1;
        }

        console.log("   Method               Count");
        console.log("   ─────────────────────────────");
        for (const [method, count] of Object.entries(methodCounts).sort((a, b) => b[1] - a[1])) {
            console.log(`   ${method.padEnd(22)} ${count}`);
        }
        console.log();

        // Remediation Guide
        console.log("─── REMEDIATION ────────────────────────────────────────────────\n");
        console.log("   Replace raw Model calls with secureModel:\n");
        console.log("   ❌  Patient.find({ organizationId, ... })");
        console.log("   ✅  SecurePatient.find({ ... }, req)\n");
        console.log("   ❌  Invoice.findById(id)");
        console.log("   ✅  SecureInvoice.findById(id, req)\n");
        console.log("   For legitimate exemptions, add: // @rls-exempt — <reason>\n");
    }

    // ─── Phase F.3: Deprecated Pattern Report ────────────────────────────────

    if (result.deprecated.length > 0) {
        console.log("═══════════════════════════════════════════════════════════════");
        console.log("🚨 PHASE F.3 — DEPRECATED PATTERN REPORT\n");
        console.log(`   Total deprecated usages: ${result.deprecated.length}\n`);

        const bySeverity = { DEPRECATED: [], LEGACY: [] };
        for (const d of result.deprecated) {
            bySeverity[d.severity] = bySeverity[d.severity] || [];
            bySeverity[d.severity].push(d);
        }

        if (bySeverity.DEPRECATED.length > 0) {
            console.log(`   🔴 DEPRECATED (${bySeverity.DEPRECATED.length}):`);
            console.log("   These patterns are FROZEN and MUST be removed:\n");
            for (const d of bySeverity.DEPRECATED) {
                const relPath = path.relative(process.cwd(), d.file);
                console.log(`     ⛔ ${relPath}:${d.line} — ${d.name}`);
                console.log(`        ${d.content}`);
            }
            console.log();
        }

        if (bySeverity.LEGACY.length > 0) {
            console.log(`   🟡 LEGACY (${bySeverity.LEGACY.length}):`);
            console.log("   These patterns should be migrated to req.rls.organizationId:\n");
            for (const d of bySeverity.LEGACY) {
                const relPath = path.relative(process.cwd(), d.file);
                console.log(`     ⚠️  ${relPath}:${d.line} — ${d.name}`);
                console.log(`        ${d.content}`);
            }
            console.log();
        }

        // Remediation for deprecated
        console.log("─── DEPRECATED REMEDIATION ─────────────────────────────────────\n");
        console.log("   ❌  buildScopedQuery({ user, resourceType })");
        console.log("   ✅  Delegate to read service with req\n");
        console.log("   ❌  req.organizationId (direct usage in services)");
        console.log("   ✅  req.rls.organizationId (via RLS context)\n");
        console.log("   For legitimate exemptions, add: // @rls-exempt — <reason>\n");
    } else {
        console.log("\n✅ DEPRECATED PATTERNS: None detected — all legacy patterns removed.\n");
    }

    // ─── Module Deprecation Summary ──────────────────────────────────────────

    if (result.deprecatedByModule.size > 0) {
        console.log("─── DEPRECATED BY MODULE ──────────────────────────────────────\n");
        for (const [moduleName, items] of result.deprecatedByModule) {
            const depCount = items.filter(d => d.severity === "DEPRECATED").length;
            const legCount = items.filter(d => d.severity === "LEGACY").length;
            console.log(`  📁 ${moduleName}: ${depCount} deprecated, ${legCount} legacy`);
        }
        console.log();
    }

    // ─── Phase F.5: RLS Coverage Metrics ──────────────────────────────────────

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("📈 PHASE F.5 — RLS COVERAGE METRICS\n");

    let totalCoverageFiles = 0;
    let totalSecureModelImports = 0;
    let totalSecureModelCalls = 0;

    for (const scanDir of SCAN_DIRS) {
        const fullDir = path.join(SRC_DIR, scanDir);
        const coverage = countSecureModelUsage(fullDir);
        totalCoverageFiles += coverage.totalFiles;
        totalSecureModelImports += coverage.secureModelImports;
        totalSecureModelCalls += coverage.secureModelCalls;

        const adoptionRate = coverage.totalFiles > 0
            ? ((coverage.secureModelImports / coverage.totalFiles) * 100).toFixed(1)
            : "0.0";
        console.log(`   📁 ${scanDir}: ${coverage.secureModelImports}/${coverage.totalFiles} files use secureModel (${adoptionRate}%), ${coverage.secureModelCalls} total calls`);
    }

    const overallAdoption = totalCoverageFiles > 0
        ? ((totalSecureModelImports / totalCoverageFiles) * 100).toFixed(1)
        : "0.0";
    console.log();
    console.log(`   Overall secureModel adoption: ${totalSecureModelImports}/${totalCoverageFiles} files (${overallAdoption}%)`);
    console.log(`   Total secureModel calls:      ${totalSecureModelCalls}`);
    console.log();

    // ─── Phase F.5: Exemption Registry Report ─────────────────────────────────

    try {
        const registry = require("../src/core/rls/rlsExemptionRegistry");
        const stats = registry.getStats();
        console.log("═══════════════════════════════════════════════════════════════");
        console.log("📋 EXEMPTION REGISTRY SUMMARY\n");
        console.log(`   Total registered:      ${stats.total}`);
        console.log(`   Permanent (required):  ${stats.permanent}`);
        console.log(`   Eliminable (targets):  ${stats.eliminable} (${stats.eliminablePercent}%)`);
        console.log();
        console.log("   By Category:");
        for (const [cat, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
            console.log(`      ${cat.padEnd(22)} ${count}`);
        }
        console.log();
    } catch (_) {
        console.log("⚠️  Exemption registry not loaded.\n");
    }

    // ─── Phase F.5.1: Engine Consistency Report ──────────────────────────────

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("🔗 PHASE F.5.1 — ENGINE CONSISTENCY\n");
    console.log(`   Validation Engine:    rlsValidationEngine.js (SSOT)`);
    console.log(`   Registry Validated:   ${result.registryValidated ? "✅ YES" : "❌ NO"}`);
    console.log(`   Boot = CI Parity:     ✅ GUARANTEED (unified engine)`);
    console.log();

    // ─── Exit ────────────────────────────────────────────────────────────────

    const totalIssues = result.violations.length + result.deprecated.filter(d => d.severity === "DEPRECATED").length;

    if (totalIssues > 0 && strict) {
        console.log("🚨 STRICT MODE: CI pipeline BLOCKED.");
        console.log(`   ${result.violations.length} raw query violation(s)`);
        console.log(`   ${result.deprecated.filter(d => d.severity === "DEPRECATED").length} deprecated pattern(s)`);
        console.log(`   Total: ${totalIssues} blocking issue(s) must be resolved.\n`);
        process.exit(1);
    } else if (totalIssues > 0) {
        console.log("⚠️  ADVISORY MODE: Issues detected but not blocking.");
        console.log("   Set RLS_STRICT=true or use --strict to enforce.\n");
        process.exit(0);
    } else {
        console.log("✅ CLEAN: Zero violations and zero deprecated patterns.");
        console.log("   Full RLS compliance achieved — Phase F.5.1 PASS.\n");
        process.exit(0);
    }
}

main();
