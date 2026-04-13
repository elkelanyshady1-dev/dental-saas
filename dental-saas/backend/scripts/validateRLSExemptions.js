#!/usr/bin/env node

/**
 * validateRLSExemptions.js — RLS Exemption Compliance Validator
 * Phase F.5 — RLS Trust Hardening & Exemption Elimination
 *
 * PURPOSE:
 * Validates that every `@rls-exempt` annotation in the codebase:
 * 1. Has a corresponding entry in rlsExemptionRegistry.js
 * 2. Includes a justification reason after the annotation
 * 3. Uses a valid category
 * 4. Has no orphaned registry entries (registry entry with no matching annotation)
 *
 * USAGE:
 *   node scripts/validateRLSExemptions.js              # Advisory mode
 *   node scripts/validateRLSExemptions.js --strict      # CI gate (exit 1 on violations)
 *   npm run validate:rls-exemptions                     # Via npm script
 *   npm run validate:rls-exemptions:strict              # Strict mode
 *
 * CI THRESHOLD:
 *   RLS_EXEMPTION_MAX=50  → Maximum allowed eliminable exemptions
 *   If eliminable count > threshold → CI FAILS (gradual reduction)
 *
 * @module validateRLSExemptions
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── Import Registry ────────────────────────────────────────────────────────

const registryPath = path.resolve(__dirname, "../src/core/rls/rlsExemptionRegistry.js");
let registry;
try {
    registry = require(registryPath);
} catch (err) {
    console.error("❌ FATAL: Cannot load rlsExemptionRegistry.js");
    console.error(`   Path: ${registryPath}`);
    console.error(`   Error: ${err.message}`);
    process.exit(1);
}

const { VALID_CATEGORIES, EXEMPTIONS, getStats } = registry;

// ─── Configuration ──────────────────────────────────────────────────────────

const SRC_DIR = path.resolve(__dirname, "../src");
const STRICT = process.argv.includes("--strict") || process.env.RLS_EXEMPTION_STRICT === "true";

// CI threshold — maximum allowed eliminable exemptions
const MAX_ELIMINABLE = parseInt(process.env.RLS_EXEMPTION_MAX || "55", 10);

// Directories to scan for @rls-exempt annotations
const SCAN_DIRS = ["modules", "organization", "services"];

// ─── Helpers ────────────────────────────────────────────────────────────────

function collectJSFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            collectJSFiles(fullPath, files);
        } else if (entry.name.endsWith(".js")) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Scans a file for @rls-exempt annotations.
 * Returns array of { line, reason, file, hasReason }
 */
function scanFileForExemptions(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    const exemptions = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("@rls-exempt")) {
            // Extract reason: everything after "—" or "-" separator
            const match = line.match(/@rls-exempt\s*[—\-]\s*(.*)/);
            const reason = match ? match[1].trim() : null;

            exemptions.push({
                file: filePath,
                line: i + 1,
                hasReason: !!reason && reason.length > 5,
                reason: reason || "(no reason provided)",
            });
        }
    }

    return exemptions;
}

// ─── Validation Rules ───────────────────────────────────────────────────────

function validateRegistryIntegrity() {
    const errors = [];

    // Rule 1: All registry entries must have required fields
    for (let i = 0; i < EXEMPTIONS.length; i++) {
        const entry = EXEMPTIONS[i];
        const required = ["file", "reason", "category", "reviewedBy", "date"];
        for (const field of required) {
            if (!entry[field]) {
                errors.push({
                    type: "MISSING_FIELD",
                    message: `Registry entry #${i} (${entry.file || "unknown"}) missing field: ${field}`,
                });
            }
        }

        // Rule 2: Category must be valid
        if (entry.category && !VALID_CATEGORIES.includes(entry.category)) {
            errors.push({
                type: "INVALID_CATEGORY",
                message: `Registry entry "${entry.file}" has invalid category: "${entry.category}"`,
            });
        }
    }

    // Rule 3: No duplicate file entries
    const fileCounts = {};
    for (const entry of EXEMPTIONS) {
        fileCounts[entry.file] = (fileCounts[entry.file] || 0) + 1;
    }
    for (const [file, count] of Object.entries(fileCounts)) {
        if (count > 1) {
            errors.push({
                type: "DUPLICATE_ENTRY",
                message: `Registry has ${count} entries for file: "${file}" — consolidate to one entry`,
            });
        }
    }

    return errors;
}

function validateAnnotations(allAnnotations) {
    const errors = [];
    const warnings = [];

    for (const annotation of allAnnotations) {
        const relPath = path.relative(SRC_DIR, annotation.file).replace(/\\/g, "/");

        // Rule 4: Must have a reason
        if (!annotation.hasReason) {
            errors.push({
                type: "MISSING_REASON",
                message: `${relPath}:${annotation.line} — @rls-exempt missing justification reason`,
            });
        }

        // Rule 5: Must be registered
        const isRegistered = EXEMPTIONS.some(e => relPath.includes(e.file));
        if (!isRegistered) {
            warnings.push({
                type: "UNREGISTERED",
                message: `${relPath}:${annotation.line} — @rls-exempt not registered in rlsExemptionRegistry.js`,
            });
        }
    }

    return { errors, warnings };
}

function validateCoverage() {
    const warnings = [];

    // Check for orphaned registry entries (no matching file)
    for (const entry of EXEMPTIONS) {
        const expectedPath = path.join(SRC_DIR, entry.file);
        if (!fs.existsSync(expectedPath)) {
            warnings.push({
                type: "ORPHANED_REGISTRY",
                message: `Registry entry "${entry.file}" — file does not exist`,
            });
        }
    }

    return warnings;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║   🔐 RLS Exemption Validator — Phase F.5                   ║");
    console.log(`║   Mode: ${STRICT ? "STRICT (CI GATE)" : "ADVISORY"}                                   ║`);
    console.log(`║   Threshold: max ${MAX_ELIMINABLE} eliminable exemptions                 ║`);
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    // ── Step 1: Validate registry integrity ─────────────────────────────
    console.log("1️⃣  Validating registry integrity...");
    const registryErrors = validateRegistryIntegrity();

    if (registryErrors.length > 0) {
        console.log(`   ❌ ${registryErrors.length} registry integrity error(s):`);
        for (const err of registryErrors) {
            console.log(`      ⛔ [${err.type}] ${err.message}`);
        }
    } else {
        console.log("   ✅ Registry integrity: PASS");
    }
    console.log();

    // ── Step 2: Scan codebase for @rls-exempt annotations ───────────────
    console.log("2️⃣  Scanning codebase for @rls-exempt annotations...");
    const allAnnotations = [];
    let totalFiles = 0;

    for (const scanDir of SCAN_DIRS) {
        const fullDir = path.join(SRC_DIR, scanDir);
        const files = collectJSFiles(fullDir);
        totalFiles += files.length;

        for (const file of files) {
            const exemptions = scanFileForExemptions(file);
            allAnnotations.push(...exemptions);
        }
    }

    const uniqueFiles = new Set(allAnnotations.map(a => a.file)).size;
    console.log(`   Files scanned: ${totalFiles}`);
    console.log(`   Annotations found: ${allAnnotations.length}`);
    console.log(`   Files with exemptions: ${uniqueFiles}`);
    console.log();

    // ── Step 3: Validate annotations ────────────────────────────────────
    console.log("3️⃣  Validating annotations...");
    const { errors: annotationErrors, warnings: annotationWarnings } = validateAnnotations(allAnnotations);

    if (annotationErrors.length > 0) {
        console.log(`   ❌ ${annotationErrors.length} annotation error(s):`);
        for (const err of annotationErrors) {
            console.log(`      ⛔ [${err.type}] ${err.message}`);
        }
    } else {
        console.log("   ✅ All annotations have valid reasons");
    }

    if (annotationWarnings.length > 0) {
        console.log(`   ⚠️  ${annotationWarnings.length} annotation warning(s):`);
        for (const warn of annotationWarnings) {
            console.log(`      ⚠️  [${warn.type}] ${warn.message}`);
        }
    }
    console.log();

    // ── Step 4: Check for orphaned registry entries ─────────────────────
    console.log("4️⃣  Checking registry coverage...");
    const coverageWarnings = validateCoverage();

    if (coverageWarnings.length > 0) {
        console.log(`   ⚠️  ${coverageWarnings.length} orphaned registry entrie(s):`);
        for (const warn of coverageWarnings) {
            console.log(`      ⚠️  [${warn.type}] ${warn.message}`);
        }
    } else {
        console.log("   ✅ All registry entries map to existing files");
    }
    console.log();

    // ── Step 5: Exemption statistics ────────────────────────────────────
    const stats = getStats();
    console.log("═══════════════════════════════════════════════════════════════");
    console.log("📊 EXEMPTION STATISTICS\n");
    console.log(`   Total registered:      ${stats.total}`);
    console.log(`   Permanent (non-elim):  ${stats.permanent}`);
    console.log(`   Eliminable (targets):  ${stats.eliminable} (${stats.eliminablePercent}%)`);
    console.log(`   CI Threshold:          ${MAX_ELIMINABLE}`);
    console.log(`   Status:                ${stats.eliminable <= MAX_ELIMINABLE ? "✅ WITHIN THRESHOLD" : "❌ OVER THRESHOLD"}`);
    console.log();

    console.log("   By Category:");
    for (const [cat, count] of Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1])) {
        console.log(`      ${cat.padEnd(22)} ${count}`);
    }
    console.log();

    // ── Step 6: Summary & Exit ──────────────────────────────────────────
    const totalErrors = registryErrors.length + annotationErrors.length;
    const totalWarnings = annotationWarnings.length + coverageWarnings.length;
    const overThreshold = stats.eliminable > MAX_ELIMINABLE;

    console.log("═══════════════════════════════════════════════════════════════");
    console.log("📋 VALIDATION SUMMARY\n");
    console.log(`   Errors:    ${totalErrors}`);
    console.log(`   Warnings:  ${totalWarnings}`);
    console.log(`   Threshold: ${overThreshold ? "❌ EXCEEDED" : "✅ OK"}`);
    console.log();

    if (totalErrors > 0 && STRICT) {
        console.log("🚨 STRICT MODE: CI pipeline BLOCKED.");
        console.log(`   ${totalErrors} error(s) must be resolved.`);
        process.exit(1);
    } else if (overThreshold && STRICT) {
        console.log("🚨 STRICT MODE: Eliminable exemptions exceed CI threshold.");
        console.log(`   Current: ${stats.eliminable} > Max: ${MAX_ELIMINABLE}`);
        console.log("   Reduce eliminable exemptions by migrating to secureModel.");
        process.exit(1);
    } else if (totalErrors > 0) {
        console.log("⚠️  ADVISORY MODE: Errors detected but not blocking.");
        console.log("   Use --strict to enforce.");
        process.exit(0);
    } else {
        console.log("✅ RLS Exemption Validation: PASS");
        if (totalWarnings > 0) {
            console.log(`   (${totalWarnings} warnings — review recommended)`);
        }
        process.exit(0);
    }
}

main();
