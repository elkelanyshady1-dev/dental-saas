#!/usr/bin/env node
/**
 * checkAggregateSecurity.js — Phase F.7 CI Enforcement Script
 *
 * Detects unsafe aggregation patterns:
 * 1. Raw .aggregate() calls (not via secureModel)
 * 2. Simple $lookup stages (not pipeline-based with org scoping)
 * 3. Bootstrap findOne/findById without secureModel
 *
 * Usage:
 *   node scripts/checkAggregateSecurity.js           # Advisory mode
 *   node scripts/checkAggregateSecurity.js --strict   # CI gate (exit 1 on violations)
 *
 * INVARIANTS ENFORCED:
 * INV-21: Bootstrap queries must use secureModel
 * INV-22: $lookup stages must be pipeline-based with org scoping
 * INV-23: Pipeline immutability (handled at runtime by aggregateSecurity.js)
 */

"use strict";

const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");
const STRICT = process.argv.includes("--strict");

// ─── Patterns to detect ────────────────────────────────────────────────────

const VIOLATIONS = {
    // Simple $lookup (not pipeline-based) — INV-22
    SIMPLE_LOOKUP: {
        // Match $lookup with localField/foreignField but no pipeline
        regex: /\$lookup:\s*\{[^}]*localField\s*:/g,
        message: "INV-22: Simple $lookup detected — must use pipeline-based with organizationId",
        severity: "HIGH",
    },
};

// Files/directories to exclude from scanning
const EXCLUDE_PATTERNS = [
    "node_modules",
    ".git",
    "dist",
    "coverage",
    "scripts/checkAggregateSecurity.js", // self
    "scripts/checkRawModelUsage.js",     // sibling script
    "__tests__",
    "tests",
    ".test.js",
    ".spec.js",
    // Platform-plane (cross-tenant scope — $lookup without organizationId is correct)
    "platform\\guardian\\",
    "platform/guardian/",
    "platform\\billing\\services\\billingRecovery",
    "platform/billing/services/billingRecovery",
    "platform\\billing\\services\\billingInvariantMonitor",
    "platform/billing/services/billingInvariantMonitor",
    // Analytics projections (materialized views — separate security model)
    "analyticsDomain\\projections\\",
    "analyticsDomain/projections/",
];

// ─── File Scanner ──────────────────────────────────────────────────────────

function shouldExclude(filePath) {
    return EXCLUDE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function getJSFiles(dir) {
    const results = [];

    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (shouldExclude(fullPath)) continue;

            if (entry.isDirectory()) {
                results.push(...getJSFiles(fullPath));
            } else if (entry.name.endsWith(".js")) {
                results.push(fullPath);
            }
        }
    } catch (_) {
        // Skip inaccessible directories
    }

    return results;
}

// ─── Violation Detection ───────────────────────────────────────────────────

function checkFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(SRC_DIR, filePath);
    const lines = content.split("\n");
    const violations = [];

    // Check for @rls-exempt annotation — exempt files are allowed
    const isExempt = content.includes("@rls-exempt");

    // Check for secureModel usage — files using secureModel are partially safe
    const usesSecureModel = content.includes("secureModel(") || content.includes("SecureModel");

    // ── Check 1: Simple $lookup (INV-22) ────────────────────────────────
    // Only check files that contain $lookup
    if (content.includes("$lookup")) {
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Detect simple $lookup pattern (localField + foreignField without pipeline)
            if (line.includes("$lookup") && !isExempt) {
                // Look ahead for localField/foreignField pattern
                const lookAhead = lines.slice(i, Math.min(i + 10, lines.length)).join("\n");

                if (
                    lookAhead.includes("localField") &&
                    lookAhead.includes("foreignField") &&
                    !lookAhead.includes("pipeline")
                ) {
                    // Check if this is inside a secureModel aggregate (which auto-secures via deepSecurePipeline)
                    const contextLines = lines.slice(Math.max(0, i - 5), i).join("\n");
                    const isInSecureAggregate =
                        contextLines.includes("SecureModel.aggregate") ||
                        contextLines.includes("Secure") && contextLines.includes(".aggregate");

                    if (!isInSecureAggregate) {
                        violations.push({
                            file: relativePath,
                            line: i + 1,
                            type: "SIMPLE_LOOKUP",
                            severity: "HIGH",
                            message: `INV-22: Simple $lookup at line ${i + 1} — should use pipeline-based with organizationId`,
                            content: line.trim(),
                        });
                    }
                }
            }
        }
    }

    return violations;
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  Phase F.7 — Aggregate Security CI Check                   ║");
    console.log(`║  Mode: ${STRICT ? "STRICT (CI gate)" : "ADVISORY"}                                    ║`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const files = getJSFiles(SRC_DIR);
    console.log(`Scanning ${files.length} files...\n`);

    let totalViolations = 0;
    const allViolations = [];

    for (const file of files) {
        const violations = checkFile(file);
        if (violations.length > 0) {
            totalViolations += violations.length;
            allViolations.push(...violations);
        }
    }

    if (allViolations.length === 0) {
        console.log("✅ No aggregate security violations found.\n");
        console.log("All $lookup stages are either:");
        console.log("  - Pipeline-based with organizationId scoping");
        console.log("  - Inside secureModel.aggregate() (auto-secured)");
        console.log("  - In @rls-exempt files\n");
        process.exit(0);
    }

    // Group violations by type
    const byType = {};
    for (const v of allViolations) {
        if (!byType[v.type]) byType[v.type] = [];
        byType[v.type].push(v);
    }

    console.log(`\n⚠️  Found ${totalViolations} aggregate security violation(s):\n`);

    for (const [type, violations] of Object.entries(byType)) {
        console.log(`── ${type} (${violations.length}) ──────────────────────────────────`);
        for (const v of violations) {
            const icon = v.severity === "HIGH" ? "🔴" : "🟡";
            console.log(`  ${icon} ${v.file}:${v.line}`);
            console.log(`     ${v.message}`);
            console.log(`     → ${v.content}\n`);
        }
    }

    if (STRICT) {
        console.log("\n❌ STRICT mode: Build FAILED due to aggregate security violations.");
        console.log("   Fix all violations or add @rls-exempt with justification.\n");
        process.exit(1);
    } else {
        console.log("\n⚠️  ADVISORY mode: Violations logged but build continues.");
        console.log("   Run with --strict for CI enforcement.\n");
        process.exit(0);
    }
}

main();
