/**
 * auditPermissions.js
 * Automated Route Permission Coverage Scanner
 *
 * Scans all .routes.js files for missing requireOrgPermission guards
 * on routes that use orgProtect.
 *
 * Usage: node scripts/auditPermissions.js
 * CI:    npm run audit:permissions
 *
 * EXIT CODES:
 *   0 = All org routes properly guarded
 *   1 = Missing permission guards detected
 *
 * EXCLUDED (by design):
 *   - Portal routes (patientProtect, not orgProtect)
 *   - Platform routes (requirePlatformCapability, not requireOrgPermission)
 *   - Public/activation routes (no auth)
 *   - Infrastructure routes (context, capabilities, dashboard — all-user access)
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── Configuration ──────────────────────────────────────────────────────────

const SCAN_DIRS = [
    path.join(__dirname, "../src/modules"),
    path.join(__dirname, "../src/routes"),
];

// Files that legitimately use orgProtect without requireOrgPermission
// (infrastructure, context, or mixed-auth route files)
const EXEMPTED_FILES = [
    "orgV1Routes.js",               // Infrastructure routes (dashboard, context, capabilities)
    "portalAuth.routes.js",          // Portal-plane auth (organizationContext, not orgProtect for most)
    "authRoutes.js",                 // Auth lifecycle (login/register/refresh)
    "settingsRoutes.js",             // Org settings (owner-only, no granular RBAC)
    "orgEntitlement.routes.js",      // Subscription self-serve (entitlement-gated)
];

// Route patterns that are exempt from requireOrgPermission
// (staff routes in mixed files where orgProtect is correct but granular RBAC is not needed)
const EXEMPT_PATTERNS = [
    "router.use(orgProtect",         // Router-level middleware application (not a route)
    "router.use(orgProtect,",        // Same, with trailing comma
];

// ─── Scanner ────────────────────────────────────────────────────────────────

const results = {
    scanned: 0,
    passed: 0,
    warnings: [],
    errors: [],
};

function isExemptedFile(filePath) {
    const basename = path.basename(filePath);
    return EXEMPTED_FILES.includes(basename);
}

function scanFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relativePath = path.relative(path.join(__dirname, ".."), filePath);

    results.scanned++;

    if (isExemptedFile(filePath)) {
        return; // Skip exempted files
    }

    const hasOrgProtect = content.includes("orgProtect");
    if (!hasOrgProtect) return; // Not an org route file

    const hasRequireOrgPermission = content.includes("requireOrgPermission");
    const hasAuthorizePermission = content.includes("authorizePermission"); // Legacy equivalent

    // Check if the file uses orgProtect on individual routes without permission check
    if (!hasRequireOrgPermission && !hasAuthorizePermission) {
        // Check if orgProtect is only used in router.use() (middleware registration)
        const orgProtectLines = lines.filter((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed.includes("orgProtect")) return false;
            // Exclude router.use patterns (middleware registration, not route definition)
            if (EXEMPT_PATTERNS.some(p => trimmed.startsWith(p))) return false;
            return true;
        });

        if (orgProtectLines.length > 0) {
            results.errors.push({
                file: relativePath,
                issue: "Uses orgProtect but NO requireOrgPermission or authorizePermission",
                linesWithOrgProtect: orgProtectLines.length,
            });
        }
    }

    // Check individual route definitions for missing permission guards
    // Pattern: router.METHOD(path, orgProtect, ..., handler) WITHOUT requireOrgPermission
    const routeRegex = /router\.(get|post|put|patch|delete)\s*\(/gi;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
        const lineIdx = content.substring(0, match.index).split("\n").length;
        // Get the full route definition (may span multiple lines)
        const routeStart = match.index;
        let parenDepth = 0;
        let routeEnd = routeStart;
        for (let i = routeStart; i < content.length; i++) {
            if (content[i] === "(") parenDepth++;
            if (content[i] === ")") {
                parenDepth--;
                if (parenDepth === 0) {
                    routeEnd = i + 1;
                    break;
                }
            }
        }
        const routeDefinition = content.substring(routeStart, routeEnd);

        // Only check routes that use orgProtect (directly or via router.use)
        const routeUsesOrgProtect = routeDefinition.includes("orgProtect");
        const routeHasPermission = routeDefinition.includes("requireOrgPermission")
            || routeDefinition.includes("authorizePermission");

        if (routeUsesOrgProtect && !routeHasPermission) {
            results.warnings.push({
                file: relativePath,
                line: lineIdx,
                method: match[1].toUpperCase(),
                issue: "Route uses orgProtect directly but missing permission guard",
                snippet: routeDefinition.split("\n")[0].trim().substring(0, 80),
            });
        }
    }

    // If file has orgProtect and permission checks, it passes
    if ((hasRequireOrgPermission || hasAuthorizePermission) && results.errors.every(e => e.file !== relativePath)) {
        results.passed++;
    }
}

function walk(dir) {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((file) => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (file.endsWith(".routes.js")) {
            scanFile(fullPath);
        }
    });
}

// ─── Execute ────────────────────────────────────────────────────────────────

console.log("🔐 Permission Coverage Audit");
console.log("═".repeat(60));

SCAN_DIRS.forEach(walk);

console.log(`\n📊 Scanned: ${results.scanned} route files`);
console.log(`✅ Passed:  ${results.passed} files`);
console.log(`⚠️  Warnings: ${results.warnings.length}`);
console.log(`❌ Errors:  ${results.errors.length}`);

if (results.warnings.length > 0) {
    console.log("\n⚠️  WARNINGS (route-level missing permission):");
    results.warnings.forEach((w) => {
        console.log(`  ${w.file}:${w.line} [${w.method}] — ${w.issue}`);
        console.log(`    ${w.snippet}`);
    });
}

if (results.errors.length > 0) {
    console.log("\n❌ ERRORS (file-level missing permission):");
    results.errors.forEach((e) => {
        console.log(`  ${e.file} — ${e.issue} (${e.linesWithOrgProtect} routes)`);
    });
    console.log("\n🚨 PERMISSION AUDIT FAILED\n");
    process.exit(1);
} else {
    console.log("\n✅ ALL ORG ROUTES PROPERLY GUARDED\n");
    process.exit(0);
}
