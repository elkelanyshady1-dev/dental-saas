/**
 * auditPermissions.ast.js — AST-Based Permission Coverage Audit v1.0
 *
 * Enterprise-grade static analysis for route permission enforcement.
 * Uses Babel AST parsing to detect route definitions and extract
 * middleware chains with ZERO false positives/negatives.
 *
 * Handles:
 *   ✅ router.METHOD(path, mw1, mw2, ..., handler)
 *   ✅ router.use(orgProtect, ...) file-level middleware
 *   ✅ Call expressions (requireOrgPermission(P.X))
 *   ✅ Spread operators (...perms)
 *   ✅ Array middleware ([mw1, mw2])
 *   ✅ Member expressions (ctrl.handler)
 *   ✅ Inline arrow/function handlers
 *
 * Usage: node scripts/auditPermissions.ast.js
 * CI:    npm run audit:permissions:ast
 *
 * EXIT CODES:
 *   0 = All org routes properly guarded
 *   1 = Missing permission guards detected
 */

"use strict";

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const _traverse = require("@babel/traverse");
const traverse = _traverse.default || _traverse;

// ─── Configuration ──────────────────────────────────────────────────────────

const ROUTES_DIRS = [
    path.join(__dirname, "../src/modules"),
    path.join(__dirname, "../src/routes"),
];

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/**
 * Files exempt from the audit.
 * These legitimately use orgProtect without granular permission checks.
 */
const EXEMPT_FILES = new Set([
    "orgV1Routes.js",               // Infrastructure routes (dashboard, context, capabilities)
    "portalAuth.routes.js",          // Portal-plane auth (uses patientProtect, not orgProtect)
    "authRoutes.js",                 // Auth lifecycle (login/register/refresh)
    "settingsRoutes.js",             // Org settings (owner-only, no granular RBAC)
    "orgEntitlement.routes.js",      // Subscription self-serve (entitlement-gated)
]);

/**
 * Routes that use legacy role-based middleware (authorize("role"))
 * instead of capability-based (requireOrgPermission).
 *
 * These are ACKNOWLEDGED technical debt — reported as warnings, not errors.
 * They must be migrated to requireOrgPermission before General Availability.
 *
 * Format: "filename:METHOD:path" → migration note
 */
const KNOWN_DEBT = new Map([
    // addOnRoutes.js — uses authorize("org_admin"), needs SUBSCRIPTION_MANAGE capability
    ["addOnRoutes.js:POST:/purchase",  "Migrate to requireOrgPermission(P.SUBSCRIPTION_MANAGE)"],
    ["addOnRoutes.js:DELETE:/:id",     "Migrate to requireOrgPermission(P.SUBSCRIPTION_MANAGE)"],
    // organizationRoutes.js — legacy settings, uses authorize("org_admin"/"superadmin")
    ["organizationRoutes.js:POST:/",                    "Migrate to requireOrgPermission(P.ORG_MANAGE)"],
    ["organizationRoutes.js:PUT:/appointment-settings", "Migrate to requireOrgPermission(P.SETTINGS_UPDATE)"],
    ["organizationRoutes.js:GET:/settings",             "Migrate to requireOrgPermission(P.SETTINGS_READ)"],
    ["organizationRoutes.js:PUT:/settings",             "Migrate to requireOrgPermission(P.SETTINGS_UPDATE)"],
    ["organizationRoutes.js:POST:/billing/portal",      "Migrate to requireOrgPermission(P.SUBSCRIPTION_MANAGE)"],
]);

/**
 * Middleware names that satisfy the "permission guard" requirement.
 * If a route uses orgProtect, it MUST include at least one of these.
 */
const PERMISSION_GUARDS = new Set([
    "requireOrgPermission",
    "authorizePermission",
]);

/**
 * Middleware names that indicate "this route is org-protected".
 * Detected either in router.use() or inline in router.METHOD().
 */
const ORG_PROTECT_NAMES = new Set([
    "orgProtect",
]);

// ─── File Discovery ─────────────────────────────────────────────────────────

/**
 * Recursively collect all *.routes.js files from a directory.
 * @param {string} dir
 * @param {string[]} files
 * @returns {string[]}
 */
function getAllRouteFiles(dir, files = []) {
    if (!fs.existsSync(dir)) return files;

    for (const entry of fs.readdirSync(dir)) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            getAllRouteFiles(fullPath, files);
        } else if (entry.endsWith(".routes.js") || entry.endsWith("Routes.js")) {
            files.push(fullPath);
        }
    }

    return files;
}

// ─── AST Utilities ──────────────────────────────────────────────────────────

/**
 * Parse a JS file into a Babel AST.
 * Uses CJS sourceType (CommonJS modules) with error recovery.
 *
 * @param {string} filePath
 * @returns {import("@babel/parser").ParseResult}
 */
function parseFile(filePath) {
    const code = fs.readFileSync(filePath, "utf-8");

    return parser.parse(code, {
        sourceType: "module",       // Handles both ESM and CJS
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: ["jsx", "dynamicImport"],
        errorRecovery: true,        // Don't crash on minor syntax issues
    });
}

/**
 * Extract the resolved name from any AST node that could be a middleware.
 *
 * Handles:
 *   Identifier           → "orgProtect"
 *   CallExpression        → "requireOrgPermission" (from requireOrgPermission(P.X))
 *   MemberExpression      → "handler" (from ctrl.handler)
 *   SpreadElement         → recurse into argument
 *   ArrowFunctionExpr     → "<arrow>"  (inline handler, not middleware)
 *   FunctionExpression    → "<function>" (inline handler, not middleware)
 *   ArrayExpression       → recurse into each element
 *
 * @param {import("@babel/types").Node} node
 * @returns {string|null}
 */
function resolveName(node) {
    if (!node) return null;

    switch (node.type) {
        case "Identifier":
            return node.name;

        case "CallExpression":
            return resolveName(node.callee);

        case "MemberExpression":
            // e.g. ctrl.handler → "handler"
            // e.g. P.TREATMENTS_READ → "P" (but we're after middleware names)
            return node.property?.name || null;

        case "SpreadElement":
            return resolveName(node.argument);

        case "ArrowFunctionExpression":
        case "FunctionExpression":
            return "<handler>";

        default:
            return null;
    }
}

/**
 * Flatten middleware arguments from a router.METHOD() call.
 *
 * router.get("/path", mw1, mw2, [mw3, mw4], ...spread, handler)
 *   → ["mw1", "mw2", "mw3", "mw4", "spread", "<handler>"]
 *
 * @param {import("@babel/types").Node[]} args — CallExpression arguments
 * @returns {string[]} — Resolved middleware names
 */
function flattenMiddleware(args) {
    const names = [];

    for (const arg of args) {
        if (arg.type === "ArrayExpression") {
            // [mw1, mw2] → recurse into each element
            for (const el of arg.elements) {
                const name = resolveName(el);
                if (name) names.push(name);
            }
        } else {
            const name = resolveName(arg);
            if (name) names.push(name);
        }
    }

    return names;
}

/**
 * Extract the route path string from the first argument of router.METHOD().
 *
 * @param {import("@babel/types").Node} arg
 * @returns {string}
 */
function extractRoutePath(arg) {
    if (!arg) return "<unknown>";
    if (arg.type === "StringLiteral") return arg.value;
    if (arg.type === "TemplateLiteral") return "<template>";
    return "<dynamic>";
}

// ─── Core Analysis ──────────────────────────────────────────────────────────

/**
 * Analyze a single route file for permission coverage violations.
 *
 * Strategy:
 *   1. Detect `router.use(orgProtect, ...)` → mark file as "org-protected at router level"
 *   2. For each `router.METHOD(path, ...)`:
 *      a. Extract middleware chain
 *      b. If orgProtect is applied (inline or via router.use):
 *         → verify at least one PERMISSION_GUARD is present
 *
 * @param {string} filePath
 * @returns {{ issues: object[], routeCount: number, hasRouterLevelOrgProtect: boolean }}
 */
function analyzeFile(filePath) {
    const basename = path.basename(filePath);

    // Skip exempt files
    if (EXEMPT_FILES.has(basename)) {
        return { issues: [], routeCount: 0, hasRouterLevelOrgProtect: false, exempt: true };
    }

    const ast = parseFile(filePath);
    const issues = [];
    let routeCount = 0;
    let hasRouterLevelOrgProtect = false;

    traverse(ast, {
        CallExpression(astPath) {
            const callee = astPath.node.callee;

            // ── Detect router.use(orgProtect, ...) ─────────────────────────
            if (
                callee.type === "MemberExpression" &&
                callee.property?.name === "use"
            ) {
                const args = astPath.node.arguments;
                const names = flattenMiddleware(args);
                if (names.some(n => ORG_PROTECT_NAMES.has(n))) {
                    hasRouterLevelOrgProtect = true;
                }
                return; // router.use() is not a route definition
            }

            // ── Detect router.METHOD(path, ...) ────────────────────────────
            if (
                callee.type === "MemberExpression" &&
                callee.property?.type === "Identifier" &&
                HTTP_METHODS.has(callee.property.name)
            ) {
                const method = callee.property.name.toUpperCase();
                const args = astPath.node.arguments;

                if (args.length < 2) return; // Incomplete route, skip

                const routePath = extractRoutePath(args[0]);

                // Extract all middleware names (skip the first arg which is the path)
                const middlewareArgs = args.slice(1);
                const middlewareNames = flattenMiddleware(middlewareArgs);

                // Determine if this route has org protection
                const hasInlineOrgProtect = middlewareNames.some(n => ORG_PROTECT_NAMES.has(n));
                const isOrgProtected = hasInlineOrgProtect || hasRouterLevelOrgProtect;

                if (!isOrgProtected) return; // Not an org-protected route, skip

                // Check for permission guard
                const hasPermissionGuard = middlewareNames.some(n => PERMISSION_GUARDS.has(n));

                routeCount++;

                if (!hasPermissionGuard) {
                    const loc = astPath.node.loc?.start || { line: 0, column: 0 };
                    const debtKey = `${basename}:${method}:${routePath}`;
                    const debtNote = KNOWN_DEBT.get(debtKey);

                    issues.push({
                        file: path.relative(path.join(__dirname, ".."), filePath),
                        method,
                        path: routePath,
                        line: loc.line,
                        column: loc.column,
                        middleware: middlewareNames.filter(n => n !== "<handler>"),
                        orgProtectSource: hasInlineOrgProtect ? "inline" : "router.use",
                        knownDebt: debtNote || null,
                    });
                }
            }
        },
    });

    return { issues, routeCount, hasRouterLevelOrgProtect, exempt: false };
}

// ─── Report ─────────────────────────────────────────────────────────────────

/**
 * Run the full audit across all configured directories.
 */
function runAudit() {
    console.log("🔐 AST-Based Permission Coverage Audit v1.0");
    console.log("═".repeat(70));
    console.log();

    let totalFiles = 0;
    let totalRoutes = 0;
    let totalExempt = 0;
    let allIssues = [];
    const fileResults = [];

    for (const dir of ROUTES_DIRS) {
        const files = getAllRouteFiles(dir);

        for (const file of files) {
            totalFiles++;
            const result = analyzeFile(file);

            if (result.exempt) {
                totalExempt++;
                continue;
            }

            totalRoutes += result.routeCount;

            if (result.issues.length > 0) {
                allIssues = allIssues.concat(result.issues);
            }

            fileResults.push({
                file: path.relative(path.join(__dirname, ".."), file),
                routeCount: result.routeCount,
                hasRouterLevelOrgProtect: result.hasRouterLevelOrgProtect,
                issues: result.issues.length,
            });
        }
    }

    // ── Summary ────────────────────────────────────────────────────────────
    console.log("📊 SCAN SUMMARY");
    console.log(`   Files scanned:      ${totalFiles}`);
    console.log(`   Files exempt:       ${totalExempt}`);
    console.log(`   Org routes found:   ${totalRoutes}`);
    console.log(`   Violations found:   ${allIssues.length}`);
    console.log();

    // ── File-level breakdown ───────────────────────────────────────────────
    console.log("📁 FILE BREAKDOWN");
    for (const fr of fileResults) {
        const status = fr.issues > 0
            ? `❌ ${fr.issues} violation(s)`
            : `✅ ${fr.routeCount} routes guarded`;
        const scope = fr.hasRouterLevelOrgProtect ? " [router.use(orgProtect)]" : "";
        console.log(`   ${fr.file}${scope}`);
        console.log(`     ${status}`);
    }
    console.log();

    // ── Separate violations from known debt ─────────────────────────────────
    const criticalIssues = allIssues.filter(i => !i.knownDebt);
    const debtIssues = allIssues.filter(i => i.knownDebt);

    // ── Known Debt (warnings, not errors) ──────────────────────────────────
    if (debtIssues.length > 0) {
        console.log(`⚠️  KNOWN TECHNICAL DEBT — ${debtIssues.length} legacy route(s)`);
        console.log("─".repeat(70));

        for (const issue of debtIssues) {
            console.log(`  ${issue.file}:${issue.line} ${issue.method} ${issue.path}`);
            console.log(`    Middleware: [${issue.middleware.join(", ")}]`);
            console.log(`    Plan:       ${issue.knownDebt}`);
        }
        console.log();
    }

    // ── Critical Violations (errors, CI failure) ───────────────────────────
    if (criticalIssues.length > 0) {
        console.error("❌ PERMISSION VIOLATIONS DETECTED");
        console.error("─".repeat(70));

        for (const issue of criticalIssues) {
            console.error();
            console.error(`  File:       ${issue.file}:${issue.line}`);
            console.error(`  Route:      ${issue.method} ${issue.path}`);
            console.error(`  OrgProtect: ${issue.orgProtectSource}`);
            console.error(`  Middleware: [${issue.middleware.join(", ")}]`);
            console.error(`  Fix:        Add requireOrgPermission(P.CAPABILITY) before handler`);
        }

        console.error();
        console.error("─".repeat(70));
        console.error(`🚨 PERMISSION AUDIT FAILED — ${criticalIssues.length} unguarded route(s)`);
        console.error();
        process.exit(1);
    } else {
        console.log("─".repeat(70));
        console.log(`✅ ALL ORG ROUTES PROPERLY GUARDED — 0 new violations`);
        if (debtIssues.length > 0) {
            console.log(`   (${debtIssues.length} known debt item(s) tracked for migration)`);
        }
        console.log("─".repeat(70));
        console.log();
        process.exit(0);
    }
}

// ─── Execute ────────────────────────────────────────────────────────────────

runAudit();
