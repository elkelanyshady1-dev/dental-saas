#!/usr/bin/env node
/**
 * checkProjectionSecurity.js — CI Enforcement for INV-24 (Phase F.8)
 *
 * Scans all org-plane service files for $project stages that explicitly
 * include restricted fields, and $addFields/$set stages that add them.
 *
 * MODES:
 *   Advisory (default):  Logs warnings, exits 0
 *   Strict (--strict):   Logs errors, exits 1 on any violation
 *
 * USAGE:
 *   node scripts/checkProjectionSecurity.js           # advisory
 *   node scripts/checkProjectionSecurity.js --strict   # CI-blocking
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── Configuration ──────────────────────────────────────────────────────────

const SRC_DIR = path.join(__dirname, "..", "src");
const STRICT = process.argv.includes("--strict");

// Fields that should NEVER appear in $project inclusions or $addFields
const RESTRICTED_PATTERNS = [
    { field: "__v", pattern: /["']?__v["']?\s*:\s*(?:1|true|\{)/g },
    { field: "internalFlags", pattern: /["']?internalFlags["']?\s*:\s*(?:1|true|\{)/g },
    { field: "auditTrail", pattern: /["']?auditTrail["']?\s*:\s*(?:1|true|\{)/g },
    { field: "createdBySystem", pattern: /["']?createdBySystem["']?\s*:\s*(?:1|true|\{)/g },
    { field: "systemTags", pattern: /["']?systemTags["']?\s*:\s*(?:1|true|\{)/g },
    { field: "_rlsContext", pattern: /["']?_rlsContext["']?\s*:\s*(?:1|true|\{)/g },
    { field: "_systemContext", pattern: /["']?_systemContext["']?\s*:\s*(?:1|true|\{)/g },
    { field: "_hmacSignature", pattern: /["']?_hmacSignature["']?\s*:\s*(?:1|true|\{)/g },
];

// Directories to scan (org-plane only — platform is exempt)
const SCAN_DIRS = [
    path.join(SRC_DIR, "modules"),
    path.join(SRC_DIR, "services"),
];

// Files/directories to skip
const SKIP_PATTERNS = [
    /node_modules/,
    /\.test\./,
    /\.spec\./,
    /__tests__/,
    /tests\//,
    /projectionSanitizer\.js$/,     // The sanitizer itself
    /aggregateSecurity\.js$/,        // The engine itself
    /fieldAccessRegistry\.js$/,      // FLS registry (defines fields, doesn't project them)
    /fieldFilter\.js$/,              // FLS filter (response layer, not pipeline)
];

// ─── File Scanner ───────────────────────────────────────────────────────────

function getJSFiles(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (SKIP_PATTERNS.some((p) => p.test(fullPath))) continue;

        if (entry.isDirectory()) {
            files.push(...getJSFiles(fullPath));
        } else if (entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }
    return files;
}

// ─── Context Detection ─────────────────────────────────────────────────────

/**
 * Checks if a line is within an aggregate pipeline context.
 * Looks for $project, $addFields, or $set operators nearby.
 */
function isInPipelineContext(lines, lineIndex) {
    // Check ±10 lines for pipeline indicators
    const start = Math.max(0, lineIndex - 10);
    const end = Math.min(lines.length - 1, lineIndex + 10);
    const context = lines.slice(start, end + 1).join("\n");

    return (
        context.includes("$project") ||
        context.includes("$addFields") ||
        context.includes("$set") ||
        context.includes("$lookup") ||
        context.includes("$facet") ||
        context.includes("aggregate(") ||
        context.includes(".aggregate(")
    );
}

// ─── Main Scan ──────────────────────────────────────────────────────────────

function main() {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  INV-24 Projection Security Scanner (Phase F.8)");
    console.log(`  Mode: ${STRICT ? "STRICT (CI-blocking)" : "ADVISORY"}`);
    console.log("═══════════════════════════════════════════════════════════\n");

    const violations = [];
    let filesScanned = 0;

    for (const scanDir of SCAN_DIRS) {
        const files = getJSFiles(scanDir);
        for (const filePath of files) {
            filesScanned++;
            const content = fs.readFileSync(filePath, "utf8");
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                for (const { field, pattern } of RESTRICTED_PATTERNS) {
                    // Reset regex state (global flag)
                    pattern.lastIndex = 0;

                    if (pattern.test(line) && isInPipelineContext(lines, i)) {
                        const relativePath = path.relative(SRC_DIR, filePath);
                        violations.push({
                            file: relativePath,
                            line: i + 1,
                            field,
                            content: line.trim().substring(0, 120),
                        });
                    }
                }
            }
        }
    }

    // ── Report ─────────────────────────────────────────────────────────────

    console.log(`Files scanned: ${filesScanned}`);
    console.log(`Violations found: ${violations.length}\n`);

    if (violations.length === 0) {
        console.log("✅ No restricted field projections detected.\n");
        console.log("INV-24 PROJECTION_SANITIZATION: COMPLIANT");
        process.exit(0);
    }

    // Group by file
    const byFile = {};
    for (const v of violations) {
        if (!byFile[v.file]) byFile[v.file] = [];
        byFile[v.file].push(v);
    }

    for (const [file, fileViolations] of Object.entries(byFile)) {
        const icon = STRICT ? "❌" : "⚠️";
        console.log(`${icon} ${file}:`);
        for (const v of fileViolations) {
            console.log(`   L${v.line}: [${v.field}] ${v.content}`);
        }
        console.log();
    }

    if (STRICT) {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("❌ INV-24 PROJECTION_SANITIZATION: VIOLATIONS DETECTED");
        console.log("   Restricted fields must not appear in $project inclusions.");
        console.log("   See: https://docs.dental-saas.dev/security/inv-24");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        process.exit(1);
    } else {
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("⚠️  INV-24 PROJECTION_SANITIZATION: ADVISORY WARNINGS");
        console.log("   These will become CI-blocking violations in Wave 9.");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        process.exit(0);
    }
}

main();
