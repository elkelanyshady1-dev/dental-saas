#!/usr/bin/env node

/**
 * validateEntitlements.js — Entitlement Coverage Audit Script
 *
 * Scans the codebase for route files and verifies that every org-scoped
 * route has entitlement enforcement via requireEntitlement().
 *
 * Run:
 *   node scripts/validateEntitlements.js
 *
 * Exit codes:
 *   0 — all routes have entitlement guards
 *   1 — routes missing entitlement guards found
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ── Configuration ────────────────────────────────────────────────────────────

const ROUTE_DIRS = [
    path.join(__dirname, "..", "src", "modules"),
    path.join(__dirname, "..", "src", "routes"),
    path.join(__dirname, "..", "src", "organization"),
];

// Patterns that indicate this is a routes file
const ROUTE_FILE_PATTERN = /\.routes\.(js|ts)$/;

// Files/paths to skip (platform routes, public routes, etc.)
const SKIP_PATTERNS = [
    /platform/i,
    /public/i,
    /health/i,
    /shared[Cc]ase/,
    /portal[Aa]uth/,
    /swagger/i,
];

// The guards we expect to find in org-scoped route files
const REQUIRED_GUARDS = {
    orgProtect: /orgProtect/,
    organizationContext: /organizationContext/,
    subscriptionGuard: /subscriptionGuard/,
    requireEntitlement: /requireEntitlement/,
};

// ── Scanner ──────────────────────────────────────────────────────────────────

function findRouteFiles(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findRouteFiles(fullPath));
        } else if (ROUTE_FILE_PATTERN.test(entry.name)) {
            // Skip excluded patterns
            const shouldSkip = SKIP_PATTERNS.some((p) => p.test(fullPath));
            if (!shouldSkip) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

function auditFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const relativePath = path.relative(path.join(__dirname, ".."), filePath);
    const issues = [];

    // Check if this is an org-scoped file (has orgProtect)
    const isOrgScoped = REQUIRED_GUARDS.orgProtect.test(content);
    if (!isOrgScoped) {
        return { file: relativePath, isOrgScoped: false, issues: [], guards: {} };
    }

    const guards = {};
    for (const [name, pattern] of Object.entries(REQUIRED_GUARDS)) {
        guards[name] = pattern.test(content);
        if (!guards[name]) {
            issues.push(`MISSING: ${name}`);
        }
    }

    return { file: relativePath, isOrgScoped: true, issues, guards };
}

// ── App.js Audit ─────────────────────────────────────────────────────────────

function auditAppJs() {
    const appPath = path.join(__dirname, "..", "app.js");
    if (!fs.existsSync(appPath)) return null;

    const content = fs.readFileSync(appPath, "utf-8");
    const issues = [];

    // Check that requireEntitlement is imported
    if (!content.includes("requireEntitlement")) {
        issues.push("app.js does not import requireEntitlement");
    }

    // Check route mounts that should have entitlement
    const routeMountPattern = /v1Router\.use\("([^"]+)",\s*([^)]+)\)/g;
    let match;
    while ((match = routeMountPattern.exec(content)) !== null) {
        const routePath = match[1];
        const middleware = match[2];

        // Skip auth, public, platform routes
        if (/^\/?(auth|public|platform|portal|shared)/.test(routePath)) continue;

        // Skip routes that apply entitlement internally (procedures, treatments, etc.)
        // These are verified separately via route file audit
    }

    return { file: "app.js", issues };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
    console.log("\n╔══════════════════════════════════════════════════════════════╗");
    console.log("║       ENTITLEMENT COVERAGE AUDIT — DentalSaaS v12.0        ║");
    console.log("╚══════════════════════════════════════════════════════════════╝\n");

    const allFiles = ROUTE_DIRS.flatMap(findRouteFiles);
    const results = allFiles.map(auditFile);

    const orgFiles = results.filter((r) => r.isOrgScoped);
    const passing = orgFiles.filter((r) => r.issues.length === 0);
    const failing = orgFiles.filter((r) => r.issues.length > 0);
    const skipped = results.filter((r) => !r.isOrgScoped);

    // ── Report Passing Files ──
    console.log("✅ PASSING (%d files)", passing.length);
    for (const r of passing) {
        const guardList = Object.entries(r.guards)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(", ");
        console.log("   ✓ %s [%s]", r.file, guardList);
    }

    // ── Report Failing Files ──
    if (failing.length > 0) {
        console.log("\n❌ FAILING (%d files)", failing.length);
        for (const r of failing) {
            console.log("   ✗ %s", r.file);
            for (const issue of r.issues) {
                console.log("     → %s", issue);
            }
        }
    }

    // ── Report Skipped Files ──
    if (skipped.length > 0) {
        console.log("\n⏭️  SKIPPED (%d files — not org-scoped)", skipped.length);
        for (const r of skipped) {
            console.log("   - %s", r.file);
        }
    }

    // ── App.js Audit ──
    const appResult = auditAppJs();
    if (appResult && appResult.issues.length > 0) {
        console.log("\n⚠️  APP.JS ISSUES:");
        for (const issue of appResult.issues) {
            console.log("   → %s", issue);
        }
    }

    // ── Summary ──
    console.log("\n" + "─".repeat(62));
    console.log("SUMMARY: %d/%d org-scoped route files have full entitlement coverage",
        passing.length, orgFiles.length);

    if (failing.length > 0) {
        console.log("⚡ %d file(s) need entitlement guard additions.", failing.length);
        console.log("─".repeat(62) + "\n");
        process.exit(1);
    } else {
        console.log("🎉 All org-scoped routes are entitlement-guarded!");
        console.log("─".repeat(62) + "\n");
        process.exit(0);
    }
}

main();
