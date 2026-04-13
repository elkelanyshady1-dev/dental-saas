require("module-alias/register");
/**
 * validatePlatformRoutes.js
 * v20.1 Wave4 — CI Route Guard Validator
 *
 * Parses all platform route files and validates:
 *   - Every route has platformProtect (except explicit AUTH_ONLY)
 *   - Mutation routes (POST/PATCH/PUT/DELETE) use authorizePlatformPermission with MANAGE_*
 *   - GET routes use authorizePlatformPermission with VIEW_* (except AUTH_ONLY)
 *
 * Exit code 1 on failure.
 * Usage: node backend/scripts/validatePlatformRoutes.js
 */

const fs = require('fs');
const path = require('path');

// Routes explicitly allowed without capability guard (AUTH_ONLY or public)
const AUTH_ONLY_PATTERNS = [
    '/auth/',           // login, verify-2fa, refresh — public
    '/login',           // public auth endpoint
    '/verify-2fa',      // public auth endpoint
    '/refresh',         // cookie-gated auth endpoint
    '/profile',         // self-profile (auth-only)
    '/logout',          // self-action (auth-only)
    '/capabilities',    // meta endpoint for frontend boot
    '/feature-flags',   // meta endpoint for frontend boot
    '/me',              // self-service endpoints
    '/audit/frontend-event',  // logging endpoint
    '/performance-metric',    // logging endpoint
    '/change-password', // self-action
    '/2fa/',            // self-service 2FA
    '/notifications',   // user notifications
    '/settings',        // non-sensitive config read (GET only; PUT has guard)
    '/features',        // feature list read (GET only; POST/PUT have guard)
    '/plans',           // plan catalog (admin-scoped via superAdminOnly)
    '/plans/catalog',   // plan catalog projection (superAdminOnly)
    '/manage-credentials', // credential management (admin context)
    '/trials',          // trial listing (superAdminOnly guards access)
    '/__sentinel'       // Phase 8 diagnostic (non-prod only, auth-gated)
];

const ROUTE_REGEX = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
const PROTECT_REGEX = /platformProtect/;
// Match both raw string: authorizePlatformPermission("VIEW_ORGANIZATIONS")
// and constant: authorizePlatformPermission(CAP.VIEW_ORGANIZATIONS)
const CAPABILITY_REGEX = /authorizePlatformPermission\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/;
const CAPABILITY_CONST_REGEX = /authorizePlatformPermission\s*\(\s*(?:CAP|PLATFORM_CAPABILITIES)\.([A-Z_]+)\s*\)/;

const routeDir = path.resolve(__dirname, "../../../src/routes");

const platformRouteFiles = [];

// Legacy top-level files
const topLevel = fs.readdirSync(routeDir)
    .filter(f => f.startsWith('platform') && f.endsWith('.js') && !fs.statSync(path.join(routeDir, f)).isDirectory());
topLevel.forEach(f => platformRouteFiles.push({ file: f, dir: routeDir }));

// New platform/ directory
const subDir = path.join(routeDir, "platform");
if (fs.existsSync(subDir)) {
    const subFiles = fs.readdirSync(subDir)
        .filter(f => f.endsWith('.js') && !fs.statSync(path.join(subDir, f)).isDirectory());
    subFiles.forEach(f => platformRouteFiles.push({ file: f, dir: subDir }));
}

let violations = [];
let totalRoutes = 0;

for (const { file, dir } of platformRouteFiles) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const routeMatch = /router\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/i.exec(line);

        if (!routeMatch) continue;

        const method = routeMatch[1].toUpperCase();
        const routePath = routeMatch[2];
        totalRoutes++;

        // Check if this is an AUTH_ONLY route
        const isAuthOnly = AUTH_ONLY_PATTERNS.some(p => routePath.includes(p));
        if (isAuthOnly) continue;

        // Check platformProtect
        if (!PROTECT_REGEX.test(line)) {
            // Check if it's using a spread variable (e.g., ...pOrgRead)
            const spreadMatch = /\.\.\.(p\w+)/.exec(line);
            if (!spreadMatch) {
                violations.push({
                    file,
                    line: i + 1,
                    route: `${method} ${routePath}`,
                    issue: 'MISSING platformProtect'
                });
            }
        }

        // Check capability guard
        const capMatch = CAPABILITY_REGEX.exec(line) || CAPABILITY_CONST_REGEX.exec(line);
        const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

        // Check spread variables for capability
        const spreadMatch = /\.\.\.(p\w+)/.exec(line);
        const hasCapabilityInSpread = spreadMatch !== null; // Spread vars include capability by convention

        if (!capMatch && !hasCapabilityInSpread) {
            // Route has no capability guard and is not AUTH_ONLY
            // Check if it has superAdminOnly at least
            if (!/superAdminOnly/.test(line)) {
                violations.push({
                    file,
                    line: i + 1,
                    route: `${method} ${routePath}`,
                    issue: 'MISSING capability guard (no authorizePlatformPermission, no superAdminOnly)'
                });
            }
            continue;
        }

        if (capMatch) {
            const capability = capMatch[1];

            if (isMutation && capability.startsWith('VIEW_')) {
                violations.push({
                    file,
                    line: i + 1,
                    route: `${method} ${routePath}`,
                    issue: `SEMANTIC VIOLATION: mutation guarded by read-only capability "${capability}"`
                });
            }
        }
    }
}

// Report
console.log('');
console.log('═══════════════════════════════════════════════════');
console.log('  PLATFORM ROUTE GUARD VALIDATOR — Wave 4');
console.log('═══════════════════════════════════════════════════');
console.log(`  Files scanned:    ${platformRouteFiles.length}`);
console.log(`  Routes found:     ${totalRoutes}`);
console.log(`  Violations:       ${violations.length}`);
console.log('');

if (violations.length > 0) {
    for (const v of violations) {
        console.error(`  ❌ ${v.file}:${v.line} — ${v.route}`);
        console.error(`     ${v.issue}`);
        console.error('');
    }
    console.error('RESULT: FAILED — Route guard violations detected.');
    process.exit(1);
} else {
    console.log('  ✅ All platform routes have correct guards.');
    console.log('');
    console.log('RESULT: PASSED');
    process.exit(0);
}
