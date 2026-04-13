#!/usr/bin/env node

/**
 * permissionDriftCheck.js — Frontend/Backend Permission Drift Detection
 *
 * Scans the frontend codebase for permission strings used in capability
 * guards and compares them against the backend SSOT permission registry.
 *
 * Detects:
 *   1. GHOST permissions — used in frontend but NOT in backend SSOT
 *   2. UNUSED permissions — defined in backend SSOT but never used in frontend
 *   3. POLICY GAPS — permissions with no PBAC policies defined
 *   4. FIELD GAPS — modules with no field access definitions
 *
 * Usage:
 *   node scripts/permissionDriftCheck.js [--json] [--strict]
 *
 * Flags:
 *   --json    Output results as JSON (for CI integration)
 *   --strict  Exit with code 1 if any ghosts or gaps found
 *
 * PLANE: Dev tooling only — not shipped to production.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── Configuration ──────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, "..");
const FRONTEND_SRC = path.resolve(PROJECT_ROOT, "..", "frontend", "src");

// Patterns to match permission strings in frontend code
const PERMISSION_PATTERNS = [
    /capabilities\.includes\(\s*["'`]([a-z_]+\.[a-z_]+)["'`]\s*\)/g,
    /permission=["'`]([a-z_]+\.[a-z_]+)["'`]/g,
    /hasPermission\(\s*["'`]([a-z_]+\.[a-z_]+)["'`]\s*\)/g,
    /checkCapability\(\s*["'`]([a-z_]+\.[a-z_]+)["'`]\s*\)/g,
    /useCapability\(\s*["'`]([a-z_]+\.[a-z_]+)["'`]\s*\)/g,
    /CapabilityGuard[^>]*permission=["'`]([a-z_]+\.[a-z_]+)["'`]/g,
    /P\.([A-Z_]+)/g, // P.PATIENTS_UPDATE style usage
];

// File extensions to scan in frontend
const FRONTEND_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

// Directories to skip
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", ".git", "coverage"]);

// ─── File Scanner ───────────────────────────────────────────────────────────

/**
 * Recursively scan a directory for files with matching extensions.
 */
function scanDirectory(dir, extensions) {
    const results = [];

    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...scanDirectory(fullPath, extensions));
        } else if (extensions.has(path.extname(entry.name))) {
            results.push(fullPath);
        }
    }

    return results;
}

/**
 * Extract all permission strings from frontend source files.
 */
function extractFrontendPermissions() {
    const files = scanDirectory(FRONTEND_SRC, FRONTEND_EXTENSIONS);
    const permissions = new Map(); // permission → [{ file, line }]

    for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n");

        for (const pattern of PERMISSION_PATTERNS) {
            // Reset the regex for each file
            pattern.lastIndex = 0;

            for (const line of lines) {
                let match;
                const patternClone = new RegExp(pattern.source, pattern.flags);
                while ((match = patternClone.exec(line)) !== null) {
                    const perm = match[1];
                    // Skip P. constant references (they're not direct permission strings)
                    if (perm && !perm.match(/^[A-Z_]+$/)) {
                        if (!permissions.has(perm)) {
                            permissions.set(perm, []);
                        }
                        const lineNumber = lines.indexOf(line) + 1;
                        const relativePath = path.relative(FRONTEND_SRC, file);
                        permissions.get(perm).push({
                            file: relativePath,
                            line: lineNumber,
                        });
                    }
                }
            }
        }
    }

    return permissions;
}

// ─── Backend SSOT Loader ────────────────────────────────────────────────────

function loadBackendPermissions() {
    try {
        const { generatePermissionKeys } = require(path.resolve(
            PROJECT_ROOT, "src", "rbac", "permissionRegistry"
        ));
        return new Set(generatePermissionKeys());
    } catch (err) {
        console.error("ERROR: Could not load backend permission registry:", err.message);
        console.error("Make sure you run this script from the backend directory.");
        process.exit(2);
    }
}

function loadBackendPolicies() {
    try {
        const { policies } = require(path.resolve(
            PROJECT_ROOT, "src", "rbac", "policyRegistry"
        ));
        return new Set(Object.keys(policies));
    } catch (err) {
        console.error("WARN: Could not load policy registry:", err.message);
        return new Set();
    }
}

function loadFieldAccessModules() {
    try {
        const { getResourceTypes } = require(path.resolve(
            PROJECT_ROOT, "src", "rbac", "fieldAccessRegistry"
        ));
        return new Set(getResourceTypes());
    } catch (err) {
        console.error("WARN: Could not load field access registry:", err.message);
        return new Set();
    }
}

function loadWriteGuardModules() {
    try {
        const { getWriteResourceTypes } = require(path.resolve(
            PROJECT_ROOT, "src", "rbac", "fieldWriteGuard"
        ));
        return new Set(getWriteResourceTypes());
    } catch (err) {
        console.error("WARN: Could not load field write guard:", err.message);
        return new Set();
    }
}

// ─── Analysis Engine ────────────────────────────────────────────────────────

function runAnalysis() {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  PERMISSION DRIFT CHECK — Frontend ↔ Backend Analysis");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Load backend SSOT
    const backendPermissions = loadBackendPermissions();
    const backendPolicies = loadBackendPolicies();
    const fieldAccessModules = loadFieldAccessModules();
    const writeGuardModules = loadWriteGuardModules();

    console.log(`Backend SSOT: ${backendPermissions.size} permissions`);
    console.log(`Backend policies: ${backendPolicies.size} permissions with PBAC policies`);
    console.log(`Field access: ${fieldAccessModules.size} resource types`);
    console.log(`Write guard: ${writeGuardModules.size} resource types\n`);

    // Extract frontend permissions
    console.log(`Scanning frontend: ${FRONTEND_SRC}`);
    const frontendPermissions = extractFrontendPermissions();
    console.log(`Found ${frontendPermissions.size} unique permission references\n`);

    // ── Analysis 1: Ghost Permissions ──
    const ghosts = [];
    for (const [perm, locations] of frontendPermissions) {
        if (!backendPermissions.has(perm)) {
            ghosts.push({ permission: perm, locations });
        }
    }

    // ── Analysis 2: Unused Permissions ──
    const frontendPermSet = new Set(frontendPermissions.keys());
    const unused = [];
    for (const perm of backendPermissions) {
        if (!frontendPermSet.has(perm)) {
            unused.push(perm);
        }
    }

    // ── Analysis 3: Policy Gaps ──
    // Write permissions without PBAC policies
    const writePerms = [...backendPermissions].filter(p =>
        p.endsWith(".create") || p.endsWith(".update") || p.endsWith(".delete") || p.endsWith(".manage")
    );
    const policyGaps = writePerms.filter(p => !backendPolicies.has(p));

    // ── Analysis 4: Module-Level Field Coverage ──
    const allModules = new Set([...backendPermissions].map(p => p.split(".")[0]));
    const fieldGaps = {
        readMissing: [...allModules].filter(m => !fieldAccessModules.has(m)),
        writeMissing: [...allModules].filter(m => !writeGuardModules.has(m)),
    };

    // ── Report ──
    const report = { ghosts, unused, policyGaps, fieldGaps };

    return report;
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function printReport(report) {
    // Ghost Permissions
    console.log("─── 1. GHOST PERMISSIONS (Frontend-Only) ─────────────────");
    if (report.ghosts.length === 0) {
        console.log("  ✅ No ghost permissions found.\n");
    } else {
        console.log(`  ⚠️  ${report.ghosts.length} ghost permission(s) found:\n`);
        for (const ghost of report.ghosts) {
            console.log(`  ❌ "${ghost.permission}"`);
            for (const loc of ghost.locations) {
                console.log(`     └── ${loc.file}:${loc.line}`);
            }
        }
        console.log();
    }

    // Unused Permissions
    console.log("─── 2. UNUSED PERMISSIONS (Backend-Only) ─────────────────");
    if (report.unused.length === 0) {
        console.log("  ✅ All backend permissions are referenced in frontend.\n");
    } else {
        console.log(`  ℹ️  ${report.unused.length} permission(s) not referenced in frontend:\n`);
        for (const perm of report.unused.slice(0, 20)) {
            console.log(`  ⬜ ${perm}`);
        }
        if (report.unused.length > 20) {
            console.log(`  ... and ${report.unused.length - 20} more`);
        }
        console.log();
    }

    // Policy Gaps
    console.log("─── 3. POLICY GAPS (Write ops without PBAC) ──────────────");
    if (report.policyGaps.length === 0) {
        console.log("  ✅ All write permissions have PBAC policies.\n");
    } else {
        console.log(`  ⚠️  ${report.policyGaps.length} write permission(s) without PBAC policy:\n`);
        for (const perm of report.policyGaps) {
            console.log(`  ⚠️  ${perm}`);
        }
        console.log();
    }

    // Field Gaps
    console.log("─── 4. FIELD ACCESS GAPS ─────────────────────────────────");
    if (report.fieldGaps.readMissing.length === 0 && report.fieldGaps.writeMissing.length === 0) {
        console.log("  ✅ All modules have field access definitions.\n");
    } else {
        if (report.fieldGaps.readMissing.length > 0) {
            console.log(`  ⚠️  Modules missing READ field definitions:`);
            for (const m of report.fieldGaps.readMissing) {
                console.log(`     ⬜ ${m}`);
            }
        }
        if (report.fieldGaps.writeMissing.length > 0) {
            console.log(`  ⚠️  Modules missing WRITE field definitions:`);
            for (const m of report.fieldGaps.writeMissing) {
                console.log(`     ⬜ ${m}`);
            }
        }
        console.log();
    }

    // Summary
    console.log("═══════════════════════════════════════════════════════════");
    const hasIssues = report.ghosts.length > 0 || report.policyGaps.length > 0;
    if (hasIssues) {
        console.log("  ⚠️  DRIFT DETECTED — review above issues");
    } else {
        console.log("  ✅  NO CRITICAL DRIFT — frontend and backend are aligned");
    }
    console.log("═══════════════════════════════════════════════════════════\n");

    return hasIssues;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
    const args = process.argv.slice(2);
    const jsonMode = args.includes("--json");
    const strictMode = args.includes("--strict");

    const report = runAnalysis();

    if (jsonMode) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        const hasIssues = printReport(report);

        if (strictMode && hasIssues) {
            console.log("STRICT MODE: Exiting with code 1 due to detected drift.\n");
            process.exit(1);
        }
    }
}

main();
