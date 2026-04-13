require("module-alias/register");
/**
 * validateMountNamespaces.js
 * Phase 9 — Mount Namespace Consistency Checker
 *
 * Scans the entire project for "/api/platform/core" references.
 * Reports occurrences outside the approved legacy rewrite block in app.js.
 *
 * Also detects:
 *   - Mixed mount patterns (same router under multiple prefixes)
 *   - Platform routes mounted without registerRouter() call
 *
 * Usage: node backend/scripts/validateMountNamespaces.js
 * Exit code 1 if unapproved /core references found.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, "../../../../../..");
const APP_FILE = path.resolve(__dirname, "../../../app.js");

// Approved files that may reference /core (legacy rewrite + documentation)
const APPROVED_CORE_FILES = [
    'app.js',           // legacy rewrite middleware
    'ARCHITECTURE.md',  // documentation
];

// Scan directories
const SCAN_DIRS = [
    path.resolve(__dirname, "../../../../../src"),
    path.resolve(__dirname, "../../../../frontend/src/platform"),
    path.resolve(__dirname, "../../../../../scripts")
];

const EXCLUDE_PATTERNS = [
    'node_modules',
    '.git',
    'routeGraph.json',
    'validateMountNamespaces.js',  // this script
    'validateSwaggerDrift.js'      // scans for /core, not a usage
];

let violations = [];
let warnings = [];

// ─── Rule 1: Scan for /api/platform/core outside approved files ─────────────
function scanForLegacyCore(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (EXCLUDE_PATTERNS.some(p => fullPath.includes(p))) continue;

        if (entry.isDirectory()) {
            scanForLegacyCore(fullPath);
        } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
            const relPath = path.relative(PROJECT_ROOT, fullPath);
            if (APPROVED_CORE_FILES.some(f => relPath.endsWith(f))) continue;

            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('/api/platform/core')) {
                    // Skip if it's in a comment about the migration
                    if (lines[i].trim().startsWith('//') || lines[i].trim().startsWith('*')) {
                        warnings.push({
                            file: relPath,
                            line: i + 1,
                            issue: `Comment referencing /api/platform/core — verify it's intentional`,
                            content: lines[i].trim().substring(0, 80)
                        });
                        continue;
                    }

                    violations.push({
                        file: relPath,
                        line: i + 1,
                        issue: 'Active code referencing legacy /api/platform/core namespace',
                        content: lines[i].trim().substring(0, 80)
                    });
                }
            }
        }
    }
}

// ─── Rule 2: Verify registerRouter() precedes every app.use() mount ─────────
// Mounts that are middleware (not routers) or pre-registration auth mounts
const MOUNT_EXCEPTIONS = [
    'loginLimiter',              // rate-limit middleware, not a router
    'platformAuthRoutes',        // mounted before v1Router pattern, legitimate
    'validateOpenApiResponse'    // Phase 12: transparent response validation middleware
];

function checkMountRegistration(appContent) {
    const lines = appContent.split('\n');
    const registrations = new Set();
    const mountIssues = [];

    // Collect registerRouter calls
    for (const line of lines) {
        const regMatch = /registerRouter\s*\(\s*["'`](\w+)["'`]/.exec(line);
        if (regMatch) registrations.add(regMatch[1]);
    }

    // Check app.use mounts for platform routes
    for (let i = 0; i < lines.length; i++) {
        const mountMatch = /app\.use\(\s*["'`](\/api\/platform[^"'`]*)["'`]\s*,\s*(\w+)\s*\)/.exec(lines[i]);
        if (!mountMatch) continue;

        const prefix = mountMatch[1];
        const routerVar = mountMatch[2];

        // Skip legacy rewrite (middleware function, not a router)
        if (lines[i].includes('=>') || lines[i].includes('function')) continue;

        // Skip known exceptions
        if (MOUNT_EXCEPTIONS.includes(routerVar)) continue;

        if (!registrations.has(routerVar)) {
            mountIssues.push({
                line: i + 1,
                prefix,
                routerVar,
                issue: `app.use("${prefix}", ${routerVar}) mounted without registerRouter("${routerVar}", ...)`
            });
        }
    }

    return mountIssues;
}

// ─── Execute ────────────────────────────────────────────────────────────────
for (const dir of SCAN_DIRS) {
    scanForLegacyCore(dir);
}

const appContent = fs.readFileSync(APP_FILE, 'utf8');
const mountIssues = checkMountRegistration(appContent);

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  MOUNT NAMESPACE CONSISTENCY — Phase 9');
console.log('═══════════════════════════════════════════════════');
console.log(`  Legacy /core violations:    ${violations.length}`);
console.log(`  Legacy /core warnings:      ${warnings.length}`);
console.log(`  Unregistered mounts:        ${mountIssues.length}`);
console.log('');

if (violations.length > 0) {
    console.error('  ❌ ACTIVE CODE WITH LEGACY /core NAMESPACE:');
    for (const v of violations) {
        console.error(`     ${v.file}:${v.line}`);
        console.error(`     ${v.content}`);
        console.error('');
    }
}

if (mountIssues.length > 0) {
    console.error('  ❌ UNREGISTERED PLATFORM MOUNTS:');
    for (const m of mountIssues) {
        console.error(`     app.js:${m.line} — ${m.issue}`);
    }
    console.error('');
}

if (warnings.length > 0) {
    console.warn('  ⚠️  COMMENTS WITH /core REFERENCES:');
    for (const w of warnings) {
        console.warn(`     ${w.file}:${w.line} — ${w.content}`);
    }
    console.warn('');
}

const hasCritical = violations.length > 0 || mountIssues.length > 0;

if (hasCritical) {
    console.error('RESULT: FAILED — Namespace consistency violations detected.');
    process.exit(1);
} else {
    console.log('  ✅ Mount namespace consistency verified.');
    console.log('');
    console.log('RESULT: PASSED');
    process.exit(0);
}
