#!/usr/bin/env node
/**
 * auditRbacRoutes.js — RBAC Route Coverage Scanner
 *
 * Statically scans all route files in the backend for route definitions
 * and checks whether each route has proper RBAC enforcement:
 *   - requireOrgPermission(P.XXX)  (route-level RBAC)
 *   - authOnly()                   (auth-only marker)
 *   - authorize(req, ...)          (controller-level, detected in same file)
 *
 * Usage:
 *   node scripts/auditRbacRoutes.js
 *   node scripts/auditRbacRoutes.js --strict   # exit 1 on any unprotected route
 *   node scripts/auditRbacRoutes.js --json     # JSON output for CI
 *
 * Exit codes:
 *   0 — all routes covered
 *   1 — unprotected routes found (--strict mode)
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── Configuration ──────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

const ROUTE_FILE_PATTERN = /\.routes\.js$/;

// Public / exempt patterns (no RBAC expected)
const EXEMPT_ROUTE_PATTERNS = [
    /\/auth\//,         // Auth routes (login, logout, etc.)
    /\/health/,         // Health checks
    /\/ready/,          // Readiness probes
    /\/public\//,       // Public endpoints
    /\/shared\//,       // Shared token-gated routes
    /\/portal\//,       // Patient portal (separate auth plane)
    /\/intake\//,       // Patient intake (public, token-gated)
    /portal\/activate/, // Portal activation
    /portal\/login/,    // Portal login
];

// Files from different auth planes that don't use org RBAC
// Note: Use both separators (/ and \) for cross-platform compatibility
const EXEMPT_FILE_PATTERNS = [
    /patientPortal/,                    // Patient Portal plane — uses patientProtect
    /portalAuth/,                       // Portal auth routes
    /portalAccess/,                     // Portal access routes
    /portalMonitoring/,                 // Portal monitoring routes
    /routes[/\\]platform[/\\]/,         // Platform plane — uses superAdminOnly / platformProtect
    /sharedCase\.routes/,               // Token-gated shared access
    /booking\.routes/,                  // Booking routes (public + token-gated)
    /bookingApproval/,                  // Booking approval (token-gated)
    /authHealth\.routes/,               // Auth health probes
    /dlq\.routes/,                      // Platform DLQ admin
    /outboxHealth\.routes/,             // Platform outbox health
    /guardian\.routes/,                 // Platform guardian
    /platformFinance/,                  // Platform finance
    /featureRegistry\.routes/,          // Platform feature registry
    /supervisor[/\\]routes/,            // Supervisor plane — different auth model
];

// Middleware patterns that satisfy RBAC
const RBAC_PATTERNS = [
    /requireOrgPermission\s*\(/,
    /authOnly\s*\(\s*\)/,
    /authorizePlatformPermission\s*\(/,
    /superAdminOnly\s*\(/,
    /authorize\s*\(\s*req/,                 // controller-level
    /\.use\s*\(\s*requireOrgPermission/,    // router.use() blanket guard
    /\.use\s*\(\s*superAdminOnly/,          // router.use() blanket guard
    /\.\.\.\w+Gate/,                        // spread of gate arrays (e.g. ...staffManageGate)
    /\.\.\.\w+Guard/,                       // spread of guard arrays
    /\.\.\.\w+Auth/,                        // spread of auth arrays
    /\.\.\.\w+Middleware/,                   // spread of middleware arrays
    /\.\.\.\w+Permission/,                  // spread of permission arrays
    /\.\.\.authorize\s*\(/,                 // spread of authorize() middleware factory
];

// Route definition regex: router.METHOD("path", ...)
const ROUTE_DEF_REGEX = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;

// ─── Scanner ────────────────────────────────────────────────────────────────

function findRouteFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findRouteFiles(fullPath));
        } else if (ROUTE_FILE_PATTERN.test(entry.name)) {
            results.push(fullPath);
        }
    }
    return results;
}

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = path.relative(ROOT, filePath);
    const findings = [];

    // Check for blanket router.use() guards
    const hasBlanketGuard = /router\.use\s*\(\s*(requireOrgPermission|superAdminOnly)\s*\(/.test(content);

    // Detect variable-based gate arrays containing RBAC middleware
    // e.g., const staffManageGate = [ requireOrgPermission(P.STAFF_MANAGE) ]
    const gateVarNames = new Set();
    const gateVarRegex = /const\s+(\w+)\s*=\s*\[[\s\S]*?requireOrgPermission[\s\S]*?\]/g;
    let gateMatch;
    while ((gateMatch = gateVarRegex.exec(content)) !== null) {
        gateVarNames.add(gateMatch[1]);
    }
    // Build a regex matching ...spreadOfTheseVars
    const hasSpreadGuard = (ctx) => {
        if (gateVarNames.size === 0) return false;
        for (const name of gateVarNames) {
            if (ctx.includes(`...${name}`)) return true;
        }
        return false;
    };

    let match;
    ROUTE_DEF_REGEX.lastIndex = 0;

    while ((match = ROUTE_DEF_REGEX.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        const routePath = match[2];
        const matchIndex = match.index;

        // Find line number
        const linesBefore = content.slice(0, matchIndex).split("\n");
        const lineNum = linesBefore.length;

        // Check if this route is exempt
        const isExempt = EXEMPT_ROUTE_PATTERNS.some(p => p.test(routePath));
        if (isExempt) continue;

        // Get the full route definition line(s) — up to the next semicolon or closing paren
        // Look at the text from this match to the next route definition or 500 chars
        const contextEnd = Math.min(matchIndex + 500, content.length);
        const routeContext = content.slice(matchIndex, contextEnd);

        // Extract just this route definition (up to next `router.` or end of statement)
        const nextRouterMatch = routeContext.indexOf("\nrouter.");
        const relevantContext = nextRouterMatch > 0
            ? routeContext.slice(0, nextRouterMatch)
            : routeContext.split("\n").slice(0, 5).join("\n");

        // Check if RBAC pattern exists in this route's context
        const hasRbac = RBAC_PATTERNS.some(p => p.test(relevantContext))
            || hasBlanketGuard
            || hasSpreadGuard(relevantContext);

        if (!hasRbac) {
            findings.push({
                file: relPath,
                line: lineNum,
                method,
                path: routePath,
                status: "UNPROTECTED",
            });
        }
    }

    return findings;
}

// Also scan orgV1Routes.js which has inline handlers
function scanOrgV1Routes(filePath) {
    if (!fs.existsSync(filePath)) return [];

    const content = fs.readFileSync(filePath, "utf-8");
    const relPath = path.relative(ROOT, filePath);
    const findings = [];

    // Match both router.METHOD and inline handler patterns
    const patterns = [
        /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi,
    ];

    for (const pattern of patterns) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const routePath = match[2];
            const matchIndex = match.index;
            const linesBefore = content.slice(0, matchIndex).split("\n");
            const lineNum = linesBefore.length;

            const isExempt = EXEMPT_ROUTE_PATTERNS.some(p => p.test(routePath));
            if (isExempt) continue;

            const contextEnd = Math.min(matchIndex + 600, content.length);
            const routeContext = content.slice(matchIndex, contextEnd);
            const nextRouterMatch = routeContext.indexOf("\nrouter.");
            const relevantContext = nextRouterMatch > 0
                ? routeContext.slice(0, nextRouterMatch)
                : routeContext.split("\n").slice(0, 8).join("\n");

            const hasRbac = RBAC_PATTERNS.some(p => p.test(relevantContext));

            if (!hasRbac) {
                findings.push({
                    file: relPath,
                    line: lineNum,
                    method,
                    path: routePath,
                    status: "UNPROTECTED",
                });
            }
        }
    }

    return findings;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
    const args = process.argv.slice(2);
    const strict = args.includes("--strict");
    const json = args.includes("--json");

    const routeFiles = findRouteFiles(SRC);
    const orgV1Path = path.join(SRC, "routes", "orgV1Routes.js");

    let allFindings = [];
    let totalRoutes = 0;
    let protectedRoutes = 0;

    for (const file of routeFiles) {
        const relFile = path.relative(ROOT, file);
        // Skip files from exempt auth planes
        if (EXEMPT_FILE_PATTERNS.some(p => p.test(relFile))) continue;

        const content = fs.readFileSync(file, "utf-8");
        const routeCount = (content.match(/router\.(get|post|put|patch|delete)\s*\(/gi) || []).length;
        totalRoutes += routeCount;

        const findings = scanFile(file);
        allFindings.push(...findings);
        protectedRoutes += routeCount - findings.length;
    }

    // Special scan for orgV1Routes.js (not a .routes.js file)
    if (fs.existsSync(orgV1Path)) {
        const content = fs.readFileSync(orgV1Path, "utf-8");
        const routeCount = (content.match(/router\.(get|post|put|patch|delete)\s*\(/gi) || []).length;
        totalRoutes += routeCount;

        const findings = scanOrgV1Routes(orgV1Path);
        allFindings.push(...findings);
        protectedRoutes += routeCount - findings.length;
    }

    // ─── Output ─────────────────────────────────────────────────────────────
    if (json) {
        console.log(JSON.stringify({
            totalRoutes,
            protectedRoutes,
            unprotectedRoutes: allFindings.length,
            coveragePercent: totalRoutes > 0
                ? Math.round((protectedRoutes / totalRoutes) * 10000) / 100
                : 100,
            findings: allFindings,
        }, null, 2));
    } else {
        console.log("\n══════════════════════════════════════════════════════════════");
        console.log("  RBAC ROUTE COVERAGE AUDIT");
        console.log("══════════════════════════════════════════════════════════════\n");

        if (allFindings.length === 0) {
            console.log("  ✅ ALL routes have RBAC enforcement.\n");
        } else {
            console.log(`  🚨 ${allFindings.length} UNPROTECTED route(s) found:\n`);
            for (const f of allFindings) {
                console.log(`    ❌ ${f.method.padEnd(7)} ${f.path}`);
                console.log(`       File: ${f.file}:${f.line}\n`);
            }
        }

        console.log(`  Total routes scanned: ${totalRoutes}`);
        console.log(`  Protected:            ${protectedRoutes}`);
        console.log(`  Unprotected:          ${allFindings.length}`);
        const coverage = totalRoutes > 0
            ? Math.round((protectedRoutes / totalRoutes) * 10000) / 100
            : 100;
        console.log(`  Coverage:             ${coverage}%`);
        console.log("\n══════════════════════════════════════════════════════════════\n");
    }

    if (strict && allFindings.length > 0) {
        process.exit(1);
    }
}

main();
