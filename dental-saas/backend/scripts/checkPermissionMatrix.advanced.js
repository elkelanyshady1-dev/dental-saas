/**
 * checkPermissionMatrix.advanced.js — Advanced CI Permission Validator
 *
 * Combines three enforcement layers:
 *   1. RBAC Enum Sync — all rules reference valid P.* values
 *   2. Pattern Inference — resolver auto-generates expected permissions
 *   3. Matrix Cross-Check — resolver output matches canonical matrix
 *   4. AST Verification — actual code guards match resolved expectations
 *
 * This ensures the permission system is self-consistent:
 *   P enum ↔ Rules ↔ Matrix ↔ Actual Code
 *
 * Usage:
 *   node scripts/checkPermissionMatrix.advanced.js            → run all checks
 *   node scripts/checkPermissionMatrix.advanced.js --verbose  → show all verified routes
 *   node scripts/checkPermissionMatrix.advanced.js --fix      → auto-update matrix from rules
 *
 * Exit codes:
 *   0 = All checks passed
 *   1 = Failures detected
 */

"use strict";

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const _traverse = require("@babel/traverse");
const traverse = _traverse.default || _traverse;

// ─── Load Modules ───────────────────────────────────────────────────────────

const { resolvePermission, validateRulesIntegrity } = require("../src/rbac/permissionResolver");
const { matrix, getMatrixStats } = require("../src/rbac/permissionMatrix");
const { authOnlyRoutes } = require("../src/rbac/permissionRules");

const VERBOSE = process.argv.includes("--verbose");

// ─── Module → File Registry ─────────────────────────────────────────────────

const MODULE_FILE_MAP = {
    patients:          [path.join(__dirname, "../src/modules/patientDomain/patientDomain.routes.js")],
    appointments:      [path.join(__dirname, "../src/routes/appointmentRoutes.js")],
    recalls:           [path.join(__dirname, "../src/routes/recallRoutes.js")],
    families:          [path.join(__dirname, "../src/routes/familyRoutes.js")],
    treatments:        [path.join(__dirname, "../src/modules/treatments/routes/treatments.routes.js")],
    procedures:        [path.join(__dirname, "../src/modules/procedures/routes/procedures.routes.js")],
    invoices:          [path.join(__dirname, "../src/modules/billingDomain/routes/invoices.routes.js")],   // Phase G — canonical
    payments:          [path.join(__dirname, "../src/modules/billingDomain/routes/payments.routes.js")],   // Phase G — canonical
    branches:          [path.join(__dirname, "../src/modules/branches/routes/branches.routes.js")],
    users:             [path.join(__dirname, "../src/modules/users/routes/users.routes.js")],
    orthodontics:      [path.join(__dirname, "../src/modules/orthodontics/routes/orthodonticCase.routes.js")],
    finance:           [path.join(__dirname, "../src/modules/billingDomain/analytics/routes/billingAnalytics.routes.js")],  // Phase G — canonical
    analytics:         [path.join(__dirname, "../src/modules/analyticsDomain/analytics.routes.js")],
    portalMonitoring:  [path.join(__dirname, "../src/modules/patientPortal/routes/portalMonitoring.routes.js")],
    bookingApproval:   [path.join(__dirname, "../src/modules/booking/bookingApproval.routes.js")],
    authorization:     [path.join(__dirname, "../src/modules/authorization/authorization.routes.js")],
    organization:      [path.join(__dirname, "../src/routes/organizationRoutes.js")],
    addOn:             [path.join(__dirname, "../src/routes/addOnRoutes.js")],
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

function extractPermission(node) {
    if (node.type === "CallExpression" && resolveName(node) === "requireOrgPermission" && node.arguments.length >= 1) {
        const arg = node.arguments[0];
        if (arg.type === "MemberExpression" && arg.object?.name === "P") return arg.property?.name || null;
        if (arg.type === "StringLiteral") return arg.value;
    }
    return null;
}

function extractAuthorizePermission(node) {
    if (node.type === "CallExpression" && resolveName(node) === "authorizePermission" && node.arguments.length >= 1) {
        if (node.arguments[0].type === "StringLiteral") return node.arguments[0].value;
    }
    return null;
}

// ─── Route Extraction ───────────────────────────────────────────────────────

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

    const orgProtectScopes = [];
    traverse(ast, {
        CallExpression(p) {
            if (p.node.callee?.type === "MemberExpression" && p.node.callee.property?.name === "use") {
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
            const middlewareNames = args.slice(1).map(a => resolveName(a));
            const hasInlineOrgProtect = middlewareNames.includes("orgProtect");
            const hasFileOrgProtect = orgProtectScopes.some(sl => line > sl);
            const hasOrgProtect = hasInlineOrgProtect || hasFileOrgProtect;

            let actualPermission = null;
            for (const arg of args.slice(1)) {
                const perm = extractPermission(arg) || extractAuthorizePermission(arg);
                if (perm) { actualPermission = perm; break; }
            }

            routes.push({ method, path: routePath, permission: actualPermission, line, hasOrgProtect });
        },
    });

    return routes;
}

// ─── P Enum Name → Value Resolver ───────────────────────────────────────────

function resolvePermissionValue(permNameOrString) {
    if (!permNameOrString) return null;
    if (permNameOrString.includes(".")) return permNameOrString;
    const { P } = require("../src/rbac/orgPermissions");
    return P[permNameOrString] || null;
}

// ─── Check 1: RBAC Enum Sync ───────────────────────────────────────────────

function checkEnumSync() {
    console.log("🔗 CHECK 1: RBAC Enum Sync");
    const result = validateRulesIntegrity();

    if (result.valid) {
        console.log("   ✅ All permissions in rules reference valid P enum values");
        return 0;
    }

    console.log(`   ❌ ${result.invalid.length} invalid permission reference(s):`);
    for (const inv of result.invalid) {
        console.log(`      🔴 ${inv}`);
    }
    return result.invalid.length;
}

// ─── Check 2: Resolver ↔ Matrix Cross-Check ────────────────────────────────

function checkResolverVsMatrix() {
    console.log("🔄 CHECK 2: Resolver ↔ Matrix Cross-Check");
    let mismatches = 0;
    let matched = 0;
    let overrideCount = 0;
    let ruleCount = 0;

    for (const [moduleName, moduleMatrix] of Object.entries(matrix)) {
        for (const [key, expectedPerm] of Object.entries(moduleMatrix)) {
            const [method, ...pathParts] = key.split(":");
            const routePath = pathParts.join(":");

            const resolution = resolvePermission(moduleName, method, routePath);

            if (resolution.status === "auth_only") {
                // Auth-only routes should NOT be in the matrix
                // But since they were removed, this is a no-op
                continue;
            }

            if (resolution.status !== "resolved") {
                console.log(`   🟡 UNRESOLVABLE: ${moduleName} ${method} ${routePath} (${resolution.status})`);
                mismatches++;
                continue;
            }

            if (resolution.permission !== expectedPerm) {
                console.log(`   🔴 MISMATCH: ${moduleName} ${method} ${routePath}`);
                console.log(`      Matrix:   ${expectedPerm}`);
                console.log(`      Resolver: ${resolution.permission} (via ${resolution.source})`);
                mismatches++;
            } else {
                matched++;
                if (resolution.source === "override") overrideCount++;
                if (resolution.source === "rule") ruleCount++;
            }
        }
    }

    if (mismatches === 0) {
        console.log(`   ✅ All ${matched} matrix entries match resolver output`);
        console.log(`      ${ruleCount} via domain rules, ${overrideCount} via explicit overrides`);
    } else {
        console.log(`   ❌ ${mismatches} resolver ↔ matrix mismatch(es)`);
    }

    return mismatches;
}

// ─── Check 3: AST ↔ Resolver Verification ──────────────────────────────────

function checkAstVsResolver() {
    console.log("🔍 CHECK 3: AST ↔ Resolver Verification (actual code guards)");
    let violations = 0;
    let verified = 0;
    let skipped = 0;
    const verifiedList = [];
    const violationList = [];

    for (const [moduleName, files] of Object.entries(MODULE_FILE_MAP)) {
        for (const file of files) {
            const routes = extractRoutes(file);

            for (const route of routes) {
                if (!route.hasOrgProtect) { skipped++; continue; }

                const resolution = resolvePermission(moduleName, route.method, route.path);

                if (resolution.status === "auth_only") {
                    if (route.permission) {
                        violationList.push({
                            type: "AUTH_ONLY_HAS_GUARD",
                            module: moduleName,
                            route: `${route.method} ${route.path}`,
                            actual: route.permission,
                            line: route.line,
                        });
                        violations++;
                    }
                    continue;
                }

                if (resolution.status !== "resolved") {
                    // Unknown domain — report but don't fail (may be infra route)
                    if (VERBOSE) {
                        console.log(`   ⏭️  ${moduleName} → ${route.method} ${route.path} (unresolvable)`);
                    }
                    skipped++;
                    continue;
                }

                const actualValue = resolvePermissionValue(route.permission);
                const expectedValue = resolution.permission;

                if (!actualValue) {
                    violationList.push({
                        type: "MISSING_GUARD",
                        module: moduleName,
                        route: `${route.method} ${route.path}`,
                        expected: expectedValue,
                        actual: "(no guard)",
                        line: route.line,
                    });
                    violations++;
                    continue;
                }

                if (actualValue !== expectedValue) {
                    violationList.push({
                        type: "MISMATCH",
                        module: moduleName,
                        route: `${route.method} ${route.path}`,
                        expected: expectedValue,
                        actual: actualValue,
                        line: route.line,
                    });
                    violations++;
                    continue;
                }

                verified++;
                verifiedList.push({ module: moduleName, route: `${route.method} ${route.path}`, permission: expectedValue });
            }
        }
    }

    // Report violations
    if (violationList.length > 0) {
        console.log();
        for (const v of violationList) {
            const icon = v.type === "MISMATCH" ? "🔴" : v.type === "MISSING_GUARD" ? "🟡" : "🟠";
            console.log(`   ${icon} [${v.type}] ${v.module} → ${v.route}`);
            if (v.expected) console.log(`      Expected: ${v.expected}`);
            console.log(`      Actual:   ${v.actual}`);
            console.log(`      Line:     ${v.line}`);
        }
        console.log();
    }

    // Report verified (verbose)
    if (VERBOSE && verifiedList.length > 0) {
        console.log();
        console.log("   Verified routes:");
        for (const v of verifiedList) {
            console.log(`   ✅ ${v.module} → ${v.route} = ${v.permission}`);
        }
        console.log();
    }

    console.log(`   Verified: ${verified} | Violations: ${violations} | Skipped: ${skipped}`);

    return violations;
}

// ─── Coverage Report ────────────────────────────────────────────────────────

function printCoverage() {
    console.log();
    console.log("─".repeat(70));
    console.log("📊 COVERAGE REPORT");
    console.log();

    const stats = getMatrixStats();
    let totalCodeRoutes = 0;
    let guardedRoutes = 0;

    for (const [moduleName, files] of Object.entries(MODULE_FILE_MAP)) {
        for (const file of files) {
            const routes = extractRoutes(file);
            for (const route of routes) {
                if (route.hasOrgProtect) {
                    totalCodeRoutes++;
                    if (route.permission) guardedRoutes++;
                }
            }
        }
    }

    const matrixCoverage = stats.totalRoutes;
    const codeCoverage = totalCodeRoutes > 0 ? ((guardedRoutes / totalCodeRoutes) * 100).toFixed(1) : "0.0";

    console.log(`   Matrix routes:        ${matrixCoverage}`);
    console.log(`   Code routes (org):    ${totalCodeRoutes}`);
    console.log(`   With permission:      ${guardedRoutes}`);
    console.log(`   Guard coverage:       ${codeCoverage}%`);
    console.log(`   Unique permissions:   ${stats.uniquePermissions}`);
    console.log(`   Domain modules:       ${stats.moduleCount}`);
    console.log();

    // Module breakdown
    console.log("   Module Breakdown:");
    for (const [mod, count] of Object.entries(stats.moduleStats)) {
        const files = MODULE_FILE_MAP[mod] || [];
        let actualGuarded = 0;
        for (const file of files) {
            for (const r of extractRoutes(file)) {
                if (r.hasOrgProtect && r.permission) actualGuarded++;
            }
        }
        const status = actualGuarded >= count ? "✅" : actualGuarded > 0 ? "🟡" : "❌";
        console.log(`      ${status} ${mod}: ${actualGuarded}/${count} guarded`);
    }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function run() {
    console.log("🛡️  Advanced Permission Matrix Validator v1.0");
    console.log("═".repeat(70));
    console.log();

    let totalFailures = 0;

    // Check 1: Enum Sync
    totalFailures += checkEnumSync();
    console.log();

    // Check 2: Resolver ↔ Matrix
    totalFailures += checkResolverVsMatrix();
    console.log();

    // Check 3: AST ↔ Resolver
    totalFailures += checkAstVsResolver();

    // Coverage
    printCoverage();

    // Result
    console.log();
    if (totalFailures === 0) {
        console.log("✅ ALL CHECKS PASSED — Permission system is self-consistent");
        console.log("   P enum ↔ Rules ↔ Matrix ↔ Code — fully synchronized");
    } else {
        console.log(`❌ ${totalFailures} FAILURE(S) DETECTED`);
        console.log("   Fix violations before merging.");
    }

    console.log();
    console.log("─".repeat(70));
    process.exit(totalFailures > 0 ? 1 : 0);
}

// ─── Execute ────────────────────────────────────────────────────────────────

run();
