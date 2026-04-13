/**
 * checkPermissionMatrix.js — CI Permission Matrix Validator
 *
 * AST-based validation that verifies every org-plane route's actual
 * permission guard matches the canonical Permission Matrix.
 *
 * Three classes of violations:
 *   1. MISMATCH — route's actual permission differs from matrix
 *   2. MISSING  — route in matrix but no permission guard in code
 *   3. UNCOVERED — route in code with orgProtect but NOT in matrix
 *
 * Usage:
 *   node scripts/checkPermissionMatrix.js           → run validation
 *   node scripts/checkPermissionMatrix.js --verbose  → show all routes
 *
 * Exit codes:
 *   0 = Pass (100% coverage, 0 mismatches)
 *   1 = Failures detected
 *
 * CI integration:
 *   "audit:matrix": "node scripts/checkPermissionMatrix.js"
 */

"use strict";

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const _traverse = require("@babel/traverse");
const traverse = _traverse.default || _traverse;

// ─── Load Matrix ────────────────────────────────────────────────────────────

const { matrix, getMatrixStats } = require("../src/rbac/permissionMatrix");

const VERBOSE = process.argv.includes("--verbose");

// ─── Route File Registry ────────────────────────────────────────────────────

/**
 * Maps matrix module names → route file paths.
 * This is the bridge between the matrix and the actual code.
 */
const MODULE_FILE_MAP = {
    patients: [
        path.join(__dirname, "../src/modules/patientDomain/patientDomain.routes.js"),
    ],
    appointments: [
        path.join(__dirname, "../src/routes/appointmentRoutes.js"),
    ],
    recalls: [
        path.join(__dirname, "../src/routes/recallRoutes.js"),
    ],
    families: [
        path.join(__dirname, "../src/routes/familyRoutes.js"),
    ],
    treatments: [
        path.join(__dirname, "../src/modules/treatments/routes/treatments.routes.js"),
    ],
    procedures: [
        path.join(__dirname, "../src/modules/procedures/routes/procedures.routes.js"),
    ],
    invoices: [
        // Phase G — canonical location: billingDomain/routes/
        path.join(__dirname, "../src/modules/billingDomain/routes/invoices.routes.js"),
    ],
    payments: [
        // Phase G — canonical location: billingDomain/routes/
        path.join(__dirname, "../src/modules/billingDomain/routes/payments.routes.js"),
    ],
    branches: [
        path.join(__dirname, "../src/modules/branches/routes/branches.routes.js"),
    ],
    users: [
        path.join(__dirname, "../src/modules/users/routes/users.routes.js"),
    ],
    orthodontics: [
        path.join(__dirname, "../src/modules/orthodontics/routes/orthodonticCase.routes.js"),
    ],
    finance: [
        // Phase G — canonical location: billingDomain/analytics/routes/
        path.join(__dirname, "../src/modules/billingDomain/analytics/routes/billingAnalytics.routes.js"),
    ],
    analytics: [
        path.join(__dirname, "../src/modules/analyticsDomain/analytics.routes.js"),
    ],
    portalMonitoring: [
        path.join(__dirname, "../src/modules/patientPortal/routes/portalMonitoring.routes.js"),
    ],
    bookingApproval: [
        path.join(__dirname, "../src/modules/booking/bookingApproval.routes.js"),
    ],
    authorization: [
        path.join(__dirname, "../src/modules/authorization/authorization.routes.js"),
    ],
    organization: [
        path.join(__dirname, "../src/routes/organizationRoutes.js"),
    ],
    addOn: [
        path.join(__dirname, "../src/routes/addOnRoutes.js"),
    ],
};

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

// ─── AST Helpers ────────────────────────────────────────────────────────────

function resolveName(node) {
    if (!node) return null;
    if (node.type === "Identifier") return node.name;
    if (node.type === "CallExpression") return resolveName(node.callee);
    if (node.type === "MemberExpression") return node.property?.name || null;
    return null;
}

function extractRoutePath(arg) {
    if (!arg) return null;
    if (arg.type === "StringLiteral") return arg.value;
    return null;
}

/**
 * Extract the permission string from a requireOrgPermission(P.SOMETHING) call.
 * Returns the full enum name (e.g., "PATIENTS_READ") or null.
 */
function extractPermission(node) {
    if (
        node.type === "CallExpression" &&
        resolveName(node) === "requireOrgPermission" &&
        node.arguments.length >= 1
    ) {
        const arg = node.arguments[0];
        // P.PATIENTS_READ → member expression
        if (arg.type === "MemberExpression" && arg.object?.name === "P") {
            return arg.property?.name || null;
        }
        // Direct string literal: requireOrgPermission("patients.read")
        if (arg.type === "StringLiteral") {
            return arg.value;
        }
    }
    return null;
}

/**
 * Same extraction for authorizePermission("patients.read")
 */
function extractAuthorizePermission(node) {
    if (
        node.type === "CallExpression" &&
        resolveName(node) === "authorizePermission" &&
        node.arguments.length >= 1
    ) {
        const arg = node.arguments[0];
        if (arg.type === "StringLiteral") return arg.value;
    }
    return null;
}

// ─── Route Extraction ───────────────────────────────────────────────────────

/**
 * Extract all route definitions from a file with their actual permissions.
 *
 * Returns array of:
 *   { method, path, permission (actual), line, hasOrgProtect }
 */
function extractRoutes(filePath) {
    if (!fs.existsSync(filePath)) return [];

    const code = fs.readFileSync(filePath, "utf-8");
    const ast = parser.parse(code, {
        sourceType: "module",
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: ["dynamicImport"],
        errorRecovery: true,
    });

    // Detect router.use(orgProtect) scopes (position-aware)
    const orgProtectScopes = [];
    traverse(ast, {
        CallExpression(p) {
            const callee = p.node.callee;
            if (callee.type === "MemberExpression" && callee.property?.name === "use") {
                for (const arg of p.node.arguments) {
                    if (resolveName(arg) === "orgProtect") {
                        orgProtectScopes.push(p.node.loc?.start?.line || 0);
                    }
                }
            }
        },
    });

    const routes = [];

    traverse(ast, {
        CallExpression(p) {
            const callee = p.node.callee;
            if (callee.type !== "MemberExpression") return;
            if (!HTTP_METHODS.has(callee.property?.name)) return;
            if (callee.property.name === "use") return;

            const method = callee.property.name.toUpperCase();
            const args = p.node.arguments;
            if (args.length < 2) return;

            const routePath = extractRoutePath(args[0]);
            if (!routePath) return;

            const line = p.node.loc?.start?.line || 0;

            // Check org protection
            const middlewareNames = args.slice(1).map(a => resolveName(a));
            const hasInlineOrgProtect = middlewareNames.includes("orgProtect");
            const hasFileOrgProtect = orgProtectScopes.some(scopeLine => line > scopeLine);
            const hasOrgProtect = hasInlineOrgProtect || hasFileOrgProtect;

            // Extract permission
            let actualPermission = null;
            for (const arg of args.slice(1)) {
                const perm = extractPermission(arg) || extractAuthorizePermission(arg);
                if (perm) {
                    actualPermission = perm;
                    break;
                }
            }

            routes.push({ method, path: routePath, permission: actualPermission, line, hasOrgProtect });
        },
    });

    return routes;
}

// ─── Permission Resolution ──────────────────────────────────────────────────

/**
 * Resolve a P.ENUM_NAME to the actual permission string for comparison.
 */
function resolvePermissionValue(permNameOrString) {
    if (!permNameOrString) return null;

    // If it's already a dotted string like "patients.read"
    if (permNameOrString.includes(".")) return permNameOrString;

    // If it's a P enum name like "PATIENTS_READ", load it
    const { P } = require("../src/rbac/orgPermissions");
    return P[permNameOrString] || null;
}

// ─── Validation Engine ──────────────────────────────────────────────────────

function validate() {
    const violations = [];
    const uncovered = [];
    const verified = [];
    let totalMatrixRoutes = 0;
    let totalCodeRoutes = 0;
    let coveredRoutes = 0;

    for (const [moduleName, moduleMatrix] of Object.entries(matrix)) {
        const files = MODULE_FILE_MAP[moduleName];
        if (!files || files.length === 0) {
            console.warn(`   ⚠️  Module "${moduleName}" has no file mapping — skipping`);
            continue;
        }

        // Collect all actual routes from files
        const actualRoutes = [];
        for (const file of files) {
            actualRoutes.push(...extractRoutes(file));
        }

        // Validate each matrix entry against actual code
        for (const [key, expectedPerm] of Object.entries(moduleMatrix)) {
            totalMatrixRoutes++;

            const [method, ...pathParts] = key.split(":");
            const routePath = pathParts.join(":");

            // Find matching actual route
            const matchingRoutes = actualRoutes.filter(r =>
                r.method === method && r.path === routePath
            );

            if (matchingRoutes.length === 0) {
                violations.push({
                    type: "MISSING",
                    module: moduleName,
                    route: `${method} ${routePath}`,
                    expected: expectedPerm,
                    actual: "(route not found in code)",
                });
                continue;
            }

            const route = matchingRoutes[0];
            const actualPermValue = resolvePermissionValue(route.permission);
            const expectedPermValue = expectedPerm; // Already resolved from P.XXX

            if (!actualPermValue) {
                violations.push({
                    type: "MISSING",
                    module: moduleName,
                    route: `${method} ${routePath}`,
                    expected: expectedPerm,
                    actual: "(no permission guard)",
                    line: route.line,
                });
                continue;
            }

            if (actualPermValue !== expectedPermValue) {
                violations.push({
                    type: "MISMATCH",
                    module: moduleName,
                    route: `${method} ${routePath}`,
                    expected: expectedPerm,
                    actual: actualPermValue,
                    line: route.line,
                });
                continue;
            }

            // ✅ Match confirmed
            coveredRoutes++;
            verified.push({ module: moduleName, route: `${method} ${routePath}`, permission: expectedPerm });
        }

        // Check for UNCOVERED routes (in code but not in matrix)
        for (const route of actualRoutes) {
            totalCodeRoutes++;
            const key = `${route.method}:${route.path}`;
            if (!moduleMatrix[key] && route.hasOrgProtect && route.permission) {
                uncovered.push({
                    module: moduleName,
                    route: `${route.method} ${route.path}`,
                    actual: route.permission,
                    line: route.line,
                });
            }
        }
    }

    return { violations, uncovered, verified, totalMatrixRoutes, totalCodeRoutes, coveredRoutes };
}

// ─── Report ─────────────────────────────────────────────────────────────────

function run() {
    console.log("📋 Permission Matrix Validator v1.0");
    console.log("═".repeat(70));
    console.log();

    const stats = getMatrixStats();
    console.log(`📊 Matrix: ${stats.totalRoutes} routes across ${stats.moduleCount} modules`);
    console.log(`   Unique permissions: ${stats.uniquePermissions}`);
    console.log();

    const result = validate();

    // ── Violations ─────────────────────────────────────────────────
    if (result.violations.length > 0) {
        console.log("❌ VIOLATIONS DETECTED:");
        console.log();
        for (const v of result.violations) {
            const icon = v.type === "MISMATCH" ? "🔴" : "🟡";
            console.log(`   ${icon} [${v.type}] ${v.module} → ${v.route}`);
            console.log(`      Expected: ${v.expected}`);
            console.log(`      Actual:   ${v.actual}`);
            if (v.line) console.log(`      Line:     ${v.line}`);
            console.log();
        }
    }

    // ── Uncovered Routes ───────────────────────────────────────────
    if (result.uncovered.length > 0) {
        console.log("⚠️  UNCOVERED ROUTES (in code but NOT in matrix):");
        console.log();
        for (const u of result.uncovered) {
            console.log(`   🟠 ${u.module} → ${u.route} [${u.actual}] (line ${u.line})`);
        }
        console.log();
    }

    // ── Verified Routes ────────────────────────────────────────────
    if (VERBOSE && result.verified.length > 0) {
        console.log("✅ VERIFIED ROUTES:");
        console.log();
        for (const v of result.verified) {
            console.log(`   ✅ ${v.module} → ${v.route} = ${v.permission}`);
        }
        console.log();
    }

    // ── Coverage Report ────────────────────────────────────────────
    console.log("─".repeat(70));
    console.log("📊 COVERAGE REPORT");
    console.log();

    const coverage = result.totalMatrixRoutes > 0
        ? ((result.coveredRoutes / result.totalMatrixRoutes) * 100).toFixed(1)
        : "0.0";

    console.log(`   Matrix routes:     ${result.totalMatrixRoutes}`);
    console.log(`   Verified:          ${result.coveredRoutes}`);
    console.log(`   Violations:        ${result.violations.length}`);
    console.log(`   Uncovered in code: ${result.uncovered.length}`);
    console.log(`   Coverage:          ${coverage}%`);
    console.log();

    // ── Module breakdown ───────────────────────────────────────────
    console.log("   Module Breakdown:");
    for (const [mod, count] of Object.entries(stats.moduleStats)) {
        const modVerified = result.verified.filter(v => v.module === mod).length;
        const modViolations = result.violations.filter(v => v.module === mod).length;
        const status = modViolations > 0 ? "❌" : "✅";
        console.log(`      ${status} ${mod}: ${modVerified}/${count} verified`);
    }
    console.log();

    // ── Exit ───────────────────────────────────────────────────────
    const hasFailed = result.violations.length > 0;
    if (hasFailed) {
        console.log("❌ MATRIX VALIDATION FAILED");
        console.log(`   ${result.violations.length} violation(s) must be resolved.`);
        console.log();
        console.log("   Fix options:");
        console.log("   1. Update the route's permission guard to match the matrix");
        console.log("   2. Update src/rbac/permissionMatrix.js if the matrix is wrong");
        console.log("   3. Run: npm run fix:permissions --commit");
        console.log();
    } else {
        console.log("✅ MATRIX VALIDATION PASSED");
        const uncoveredNote = result.uncovered.length > 0
            ? ` (${result.uncovered.length} uncovered route(s) — add to permissionMatrix.js)`
            : "";
        console.log(`   All ${result.coveredRoutes} routes match the canonical matrix.${uncoveredNote}`);
        console.log();
    }

    console.log("─".repeat(70));
    process.exit(hasFailed ? 1 : 0);
}

// ─── Execute ────────────────────────────────────────────────────────────────

run();
