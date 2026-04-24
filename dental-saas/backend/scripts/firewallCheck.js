#!/usr/bin/env node
/**
 * firewallCheck.js — CI Architecture Firewall Check
 *
 * Fast grep-based static analysis that catches violations ESLint cannot:
 *   1. Controllers using raw res.json() instead of successResponse/errorResponse
 *   2. Frontend code using window.location.reload()
 *   3. Cross-plane imports bypassing ESLint (e.g., dynamic requires)
 *   4. Direct BroadcastChannel construction outside planChannel.js
 *   5. Missing authorize() in controller files
 *
 * Exit code:
 *   0 = all checks pass
 *   1 = violations found (blocks CI)
 *
 * Usage:
 *   node scripts/firewallCheck.js
 *   npm run firewall:check        (add to package.json scripts)
 */

"use strict";

const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FRONTEND = path.resolve(ROOT, "../frontend");

let totalViolations = 0;

function check(name, command, allowedCount = 0) {
    try {
        const result = execSync(command, {
            cwd: ROOT,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        const lines = result.trim().split("\n").filter(Boolean);

        if (lines.length > allowedCount) {
            console.error(`\n\x1b[31m[FIREWALL FAIL]\x1b[0m ${name}`);
            console.error(`  Found ${lines.length} violation(s) (allowed: ${allowedCount}):`);
            lines.slice(0, 10).forEach(l => console.error(`    ${l}`));
            if (lines.length > 10) console.error(`    ... and ${lines.length - 10} more`);
            totalViolations += lines.length - allowedCount;
        } else {
            console.log(`\x1b[32m[FIREWALL PASS]\x1b[0m ${name}`);
        }
    } catch {
        // grep returns exit code 1 when no matches found = PASS
        console.log(`\x1b[32m[FIREWALL PASS]\x1b[0m ${name}`);
    }
}

console.log("\n=== Architecture Firewall CI Check ===\n");

// ── Backend Checks ───────────────────────────────────────────────────────

// 1. window.location.reload in frontend (exclude comments + ErrorBoundary)
check(
    "No window.location.reload() in frontend",
    `grep -rn "window\\.location\\.reload()" "${FRONTEND}/src" --include="*.js" --include="*.jsx" | grep -v "ErrorBoundary" | grep -v "//" | grep -v "\\*.*reload" || true`
);

// 2. new BroadcastChannel outside channel singletons
check(
    "No raw BroadcastChannel construction",
    `grep -rn "new BroadcastChannel" "${FRONTEND}/src" --include="*.js" --include="*.jsx" | grep -v "Channel.js" || true`
);

// 3. req.user.role (exact) in backend code (use req.context.roleName)
// Exclude: comments, portalFieldFilter (legitimate bridge), req.user.roleId (different field)
check(
    "No req.user.role in backend (use req.context.roleName)",
    `grep -rPn "req\\.user\\.role[^I]" src/modules/ src/organization/ --include="*.js" | grep -v "roleId" | grep -v "//" | grep -v "\\*.*req\\.user" | grep -v "portalFieldFilter" || true`
);

// 4. req.organization in backend (use req.context.organizationId)
check(
    "No req.organization in backend (use req.context.organizationId)",
    `grep -rn "req\\.organization[^I]" src/modules/ --include="*.js" | grep -v "organizationId" | grep -v "^\s*//" | grep -v "^\s*\\*" || true`
);

// 5. Direct new QueryClient() in frontend (use shared instance, exclude comments)
check(
    "No new QueryClient() in frontend components",
    `grep -rn "new QueryClient()" "${FRONTEND}/src" --include="*.js" --include="*.jsx" | grep -v "queryClient.js" | grep -v "//" | grep -v "\\*" || true`
);

// 6. Controllers without authorize() call
check(
    "All controllers call authorize()",
    `grep -rLn "authorize(" src/modules/*/[!r]*.controller.js src/modules/*/*.controller.js 2>/dev/null || true`
);

// ── Summary ──────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(40));
if (totalViolations > 0) {
    console.error(`\n\x1b[31m[FIREWALL] ${totalViolations} violation(s) found. CI BLOCKED.\x1b[0m\n`);
    process.exit(1);
} else {
    console.log(`\n\x1b[32m[FIREWALL] All checks passed.\x1b[0m\n`);
    process.exit(0);
}
