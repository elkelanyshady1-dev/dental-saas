/**
 * fixPermissions.codemod.js — AST-Based Permission Auto-Fix Codemod
 *
 * Enterprise-grade AST rewriter for route permission enforcement.
 * Uses Babel to parse → transform → regenerate route files.
 *
 * Operations:
 *   1. REPLACE: authorize("role") → requireOrgPermission(P.CAPABILITY)
 *   2. INSERT: orgProtect without permission → add requireOrgPermission(P.CAPABILITY)
 *   3. IMPORT: add missing requireOrgPermission and { P } imports
 *
 * Usage:
 *   node scripts/fixPermissions.codemod.js                → DRY RUN (preview only)
 *   node scripts/fixPermissions.codemod.js --commit        → WRITE to files
 *   node scripts/fixPermissions.codemod.js --verbose       → Show AST details
 *
 * SAFETY:
 *   ⚠️  DRY RUN is the default. You MUST pass --commit to write.
 *   ⚠️  Always commit your code BEFORE running with --commit.
 *   ⚠️  Review the diff output before approving changes.
 *
 * EXIT CODES:
 *   0 = No changes needed (or dry run completed)
 *   1 = Changes applied (or would be applied in dry run)
 */

"use strict";

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const _traverse = require("@babel/traverse");
const _generate = require("@babel/generator");
const t = require("@babel/types");

const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;

// ─── CLI Flags ──────────────────────────────────────────────────────────────

const COMMIT = process.argv.includes("--commit");
const VERBOSE = process.argv.includes("--verbose");

// ─── Configuration ──────────────────────────────────────────────────────────

const ROUTES_DIRS = [
    path.join(__dirname, "../src/modules"),
    path.join(__dirname, "../src/routes"),
];

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/**
 * Files to skip entirely (already correctly guarded or exempt).
 */
const SKIP_FILES = new Set([
    "orgV1Routes.js",
    "portalAuth.routes.js",
    "authRoutes.js",
    "settingsRoutes.js",
    "orgEntitlement.routes.js",
]);

/**
 * Exact route-level permission mapping.
 *
 * Format: "filename:METHOD:/path" → "P.PERMISSION_NAME"
 *
 * This is the authoritative source of truth for which permission
 * should guard each route. The codemod uses this map to:
 *   1. Replace authorize("role") with the correct requireOrgPermission
 *   2. Insert requireOrgPermission where it's completely missing
 *
 * ⚠️  If a route is NOT in this map, the codemod will use a FALLBACK
 *     based on HTTP method → CRUD permission pattern.
 */
const ROUTE_PERMISSION_MAP = new Map([
    // ── addOnRoutes.js ────────────────────────────────────────────────
    ["addOnRoutes.js:POST:/purchase",           "ACCOUNTING_UPDATE"],
    ["addOnRoutes.js:DELETE:/:id",              "ACCOUNTING_DELETE"],

    // ── organizationRoutes.js ─────────────────────────────────────────
    ["organizationRoutes.js:POST:/",                    "STAFF_MANAGE"],
    ["organizationRoutes.js:PUT:/appointment-settings", "STAFF_MANAGE"],
    ["organizationRoutes.js:GET:/settings",             "STAFF_MANAGE"],
    ["organizationRoutes.js:PUT:/settings",             "STAFF_MANAGE"],
    ["organizationRoutes.js:POST:/billing/portal",      "ACCOUNTING_UPDATE"],
]);

/**
 * Generic fallback: HTTP method → CRUD suffix.
 * Used ONLY when a route is not in ROUTE_PERMISSION_MAP.
 */
const METHOD_TO_CRUD = {
    get:    "READ",
    post:   "CREATE",
    put:    "UPDATE",
    patch:  "UPDATE",
    delete: "DELETE",
};

/**
 * Domain detection: filename → permission prefix.
 * Used with METHOD_TO_CRUD for dynamic permission generation.
 */
const FILE_TO_DOMAIN = {
    "appointmentRoutes.js":         "APPOINTMENTS",
    "patientDomain.routes.js":      "PATIENTS",
    "treatments.routes.js":         "TREATMENTS",
    "invoices.routes.js":           "INVOICES",
    "payments.routes.js":           "PAYMENTS",
    "procedures.routes.js":         "PROCEDURES",
    "branches.routes.js":           "BRANCHES",
    "users.routes.js":              "USERS",
    "orthodonticCase.routes.js":    "ORTHODONTICS",
    "finance.routes.js":            "ACCOUNTING",
    "recallRoutes.js":              "RECALLS",
    "familyRoutes.js":              "FAMILIES",
    "addOnRoutes.js":               "ACCOUNTING",
    "organizationRoutes.js":        "STAFF",
    "bookingApproval.routes.js":    "APPOINTMENTS",
    "analytics.routes.js":          "ACCOUNTING",
};

// ─── File Discovery ─────────────────────────────────────────────────────────

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

// ─── AST Helpers ────────────────────────────────────────────────────────────

/**
 * Resolve the name of a middleware node.
 */
function resolveName(node) {
    if (!node) return null;
    if (node.type === "Identifier") return node.name;
    if (node.type === "CallExpression") return resolveName(node.callee);
    if (node.type === "MemberExpression") return node.property?.name || null;
    if (node.type === "SpreadElement") return resolveName(node.argument);
    if (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") return "<handler>";
    return null;
}

/**
 * Extract the route path from the first argument.
 */
function extractRoutePath(arg) {
    if (!arg) return "<unknown>";
    if (arg.type === "StringLiteral") return arg.value;
    if (arg.type === "TemplateLiteral") return "<template>";
    return "<dynamic>";
}

/**
 * Create a requireOrgPermission(P.CAPABILITY) AST node.
 *
 * @param {string} permName — e.g. "STAFF_MANAGE" or "ACCOUNTING_READ"
 */
function createPermissionCall(permName) {
    return t.callExpression(
        t.identifier("requireOrgPermission"),
        [
            t.memberExpression(
                t.identifier("P"),
                t.identifier(permName)
            )
        ]
    );
}

/**
 * Resolve the correct permission for a given route.
 *
 * Priority:
 *   1. Exact match in ROUTE_PERMISSION_MAP
 *   2. Domain + HTTP method fallback
 *   3. Generic UNKNOWN_READ/CREATE/etc (fail-safe, always flagged)
 *
 * @param {string} basename
 * @param {string} method — e.g. "GET"
 * @param {string} routePath — e.g. "/settings"
 * @returns {string} — Permission name like "STAFF_MANAGE"
 */
function resolvePermission(basename, method, routePath) {
    // 1. Exact route match
    const exactKey = `${basename}:${method}:${routePath}`;
    if (ROUTE_PERMISSION_MAP.has(exactKey)) {
        return ROUTE_PERMISSION_MAP.get(exactKey);
    }

    // 2. Domain + method fallback
    const domain = FILE_TO_DOMAIN[basename];
    const crud = METHOD_TO_CRUD[method.toLowerCase()];
    if (domain && crud) {
        // Special case: STAFF doesn't follow CRUD pattern
        if (domain === "STAFF") return "STAFF_MANAGE";
        return `${domain}_${crud}`;
    }

    // 3. Fail-safe
    return `UNKNOWN_${crud || "READ"}`;
}

// ─── Import Management ──────────────────────────────────────────────────────

/**
 * Check if a file's AST already has a require() for a given module path.
 */
function hasRequire(ast, moduleName) {
    let found = false;
    traverse(ast, {
        CallExpression(p) {
            if (
                p.node.callee.name === "require" &&
                p.node.arguments.length === 1 &&
                p.node.arguments[0].type === "StringLiteral" &&
                p.node.arguments[0].value.includes(moduleName)
            ) {
                found = true;
                p.stop();
            }
        },
    });
    return found;
}

/**
 * Check if a variable name is declared in the file.
 */
function hasVariable(ast, varName) {
    let found = false;
    traverse(ast, {
        VariableDeclarator(p) {
            if (p.node.id?.name === varName) {
                found = true;
                p.stop();
            }
            // Destructured: const { P } = require(...)
            if (p.node.id?.type === "ObjectPattern") {
                for (const prop of p.node.id.properties) {
                    if (prop.key?.name === varName || prop.value?.name === varName) {
                        found = true;
                        p.stop();
                    }
                }
            }
        },
    });
    return found;
}

/**
 * Build a require statement AST node.
 * e.g. const requireOrgPermission = require("@middleware/requireOrgPermission");
 */
function buildRequireStatement(varName, modulePath) {
    return t.variableDeclaration("const", [
        t.variableDeclarator(
            t.identifier(varName),
            t.callExpression(
                t.identifier("require"),
                [t.stringLiteral(modulePath)]
            )
        )
    ]);
}

/**
 * Build a destructured require statement AST node.
 * e.g. const { P } = require("@rbac/orgPermissions");
 */
function buildDestructuredRequire(varName, modulePath) {
    return t.variableDeclaration("const", [
        t.variableDeclarator(
            t.objectPattern([
                t.objectProperty(
                    t.identifier(varName),
                    t.identifier(varName),
                    false,
                    true // shorthand
                )
            ]),
            t.callExpression(
                t.identifier("require"),
                [t.stringLiteral(modulePath)]
            )
        )
    ]);
}

// ─── Core Transform ─────────────────────────────────────────────────────────

/**
 * Transform a single route file.
 *
 * @param {string} filePath
 * @returns {{ modified: boolean, changes: object[], newCode: string|null }}
 */
function transformFile(filePath) {
    const basename = path.basename(filePath);

    if (SKIP_FILES.has(basename)) {
        return { modified: false, changes: [], newCode: null, skipped: true };
    }

    const originalCode = fs.readFileSync(filePath, "utf-8");

    const ast = parser.parse(originalCode, {
        sourceType: "module",
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins: ["jsx", "dynamicImport"],
        errorRecovery: true,
    });

    const changes = [];
    let modified = false;
    let needsRequireOrgPermission = false;
    let needsP = false;

    // ── Pass 1: Detect router.use(orgProtect) with position tracking ──
    // Track ALL router.use(orgProtect) positions so we only apply
    // file-level protection to routes defined AFTER the use() call.
    // This prevents false positives for public routes defined before scope.
    const orgProtectScopes = [];  // Array of { line, path } tuples

    traverse(ast, {
        CallExpression(astPath) {
            const callee = astPath.node.callee;
            if (
                callee.type === "MemberExpression" &&
                callee.property?.name === "use"
            ) {
                const args = astPath.node.arguments;
                for (const arg of args) {
                    const name = resolveName(arg);
                    if (name === "orgProtect") {
                        const useLine = astPath.node.loc?.start?.line || 0;
                        // Extract the path prefix if provided (e.g. router.use("/internal", orgProtect))
                        const pathArg = args[0];
                        const scopePath = (pathArg?.type === "StringLiteral" && pathArg.value !== "orgProtect")
                            ? pathArg.value
                            : "/";
                        orgProtectScopes.push({ line: useLine, path: scopePath });
                    }
                }
            }
        },
    });

    /**
     * Check if a route at a given line is under orgProtect file-level scope.
     * A route is under scope if it appears AFTER a router.use(orgProtect) call.
     */
    function isUnderFileOrgProtect(routeLine) {
        return orgProtectScopes.some(scope => routeLine > scope.line);
    }

    // ── Pass 2: Transform routes ──────────────────────────────────────
    traverse(ast, {
        CallExpression(astPath) {
            const callee = astPath.node.callee;

            // Skip router.use()
            if (
                callee.type === "MemberExpression" &&
                callee.property?.name === "use"
            ) {
                return;
            }

            // Match router.METHOD(...)
            if (
                callee.type !== "MemberExpression" ||
                callee.property?.type !== "Identifier" ||
                !HTTP_METHODS.has(callee.property.name)
            ) {
                return;
            }

            const method = callee.property.name.toUpperCase();
            const args = astPath.node.arguments;
            if (args.length < 2) return;

            const routePath = extractRoutePath(args[0]);
            const middlewareArgs = args.slice(1);

            // Resolve all middleware names
            const middlewareNames = middlewareArgs.map(a => resolveName(a));

            const hasInlineOrgProtect = middlewareNames.includes("orgProtect");
            const routeLine = astPath.node.loc?.start?.line || 0;
            const isOrgProtected = hasInlineOrgProtect || isUnderFileOrgProtect(routeLine);
            if (!isOrgProtected) return;

            const hasPermission = middlewareNames.some(
                n => n === "requireOrgPermission" || n === "authorizePermission"
            );

            if (hasPermission) return; // Already guarded

            // ── Determine the correct permission ──────────────────────
            const permName = resolvePermission(basename, method, routePath);
            const permNode = createPermissionCall(permName);
            const loc = astPath.node.loc?.start || {};

            // ── Case A: Replace authorize("role") ─────────────────────
            let replacedAuthorize = false;
            for (let i = 1; i < args.length; i++) {
                const arg = args[i];
                if (
                    arg.type === "CallExpression" &&
                    resolveName(arg) === "authorize"
                ) {
                    const oldRole = arg.arguments?.[0]?.value || "<unknown>";
                    args[i] = permNode;
                    modified = true;
                    replacedAuthorize = true;
                    needsRequireOrgPermission = true;
                    needsP = true;

                    changes.push({
                        type: "REPLACE",
                        file: path.relative(path.join(__dirname, ".."), filePath),
                        line: loc.line,
                        route: `${method} ${routePath}`,
                        from: `authorize("${oldRole}")`,
                        to: `requireOrgPermission(P.${permName})`,
                    });
                    break;
                }
            }

            // ── Case B: Insert missing permission guard ───────────────
            if (!replacedAuthorize) {
                // Find the insertion point: right after orgProtect (inline or right after path)
                let insertIdx;
                if (hasInlineOrgProtect) {
                    insertIdx = middlewareArgs.findIndex(a => resolveName(a) === "orgProtect");
                    insertIdx += 2; // +1 for 0-index, +1 to go after orgProtect (accounting for path at args[0])
                } else {
                    insertIdx = 1; // After the path
                }

                args.splice(insertIdx, 0, permNode);
                modified = true;
                needsRequireOrgPermission = true;
                needsP = true;

                changes.push({
                    type: "INSERT",
                    file: path.relative(path.join(__dirname, ".."), filePath),
                    line: loc.line,
                    route: `${method} ${routePath}`,
                    from: "(none)",
                    to: `requireOrgPermission(P.${permName})`,
                });
            }
        },
    });

    // ── Pass 3: Add missing imports ───────────────────────────────────
    if (modified) {
        const hasROP = hasVariable(ast, "requireOrgPermission");
        const hasPVar = hasVariable(ast, "P");

        // Find insertion point: after the last require() statement
        let lastRequireIdx = -1;
        for (let i = 0; i < ast.program.body.length; i++) {
            const stmt = ast.program.body[i];
            if (
                stmt.type === "VariableDeclaration" &&
                stmt.declarations?.[0]?.init?.type === "CallExpression" &&
                stmt.declarations[0].init.callee?.name === "require"
            ) {
                lastRequireIdx = i;
            }
            // Also catch: const X = require(...)
            if (
                stmt.type === "ExpressionStatement" &&
                stmt.expression?.type === "CallExpression" &&
                stmt.expression.callee?.name === "require"
            ) {
                lastRequireIdx = i;
            }
        }

        const insertAt = lastRequireIdx + 1;

        if (needsP && !hasPVar) {
            const pImport = buildDestructuredRequire("P", "@rbac/orgPermissions");
            ast.program.body.splice(insertAt, 0, pImport);
            changes.push({
                type: "IMPORT",
                file: path.relative(path.join(__dirname, ".."), filePath),
                line: 0,
                route: "(file-level)",
                from: "(none)",
                to: 'const { P } = require("@rbac/orgPermissions")',
            });
        }

        if (needsRequireOrgPermission && !hasROP) {
            const ropImport = buildRequireStatement(
                "requireOrgPermission",
                "@middleware/requireOrgPermission"
            );
            ast.program.body.splice(insertAt, 0, ropImport);
            changes.push({
                type: "IMPORT",
                file: path.relative(path.join(__dirname, ".."), filePath),
                line: 0,
                route: "(file-level)",
                from: "(none)",
                to: 'const requireOrgPermission = require("@middleware/requireOrgPermission")',
            });
        }
    }

    // ── Generate output ───────────────────────────────────────────────
    let newCode = null;
    if (modified) {
        const result = generate(ast, {
            retainLines: true,
            retainFunctionParens: true,
        }, originalCode);
        newCode = result.code;
    }

    return { modified, changes, newCode, skipped: false };
}

// ─── Report ─────────────────────────────────────────────────────────────────

function run() {
    const mode = COMMIT ? "COMMIT" : "DRY RUN";
    console.log(`🔧 AST Permission Codemod v1.0 [${mode}]`);
    console.log("═".repeat(70));
    console.log();

    if (!COMMIT) {
        console.log("⚠️  DRY RUN MODE — no files will be modified.");
        console.log("   Pass --commit to apply changes.");
        console.log();
    }

    let totalFiles = 0;
    let totalSkipped = 0;
    let totalModified = 0;
    let allChanges = [];

    for (const dir of ROUTES_DIRS) {
        const files = getAllRouteFiles(dir);

        for (const file of files) {
            totalFiles++;

            try {
                const result = transformFile(file);

                if (result.skipped) {
                    totalSkipped++;
                    if (VERBOSE) {
                        console.log(`   ⏭️  ${path.basename(file)} (exempt)`);
                    }
                    continue;
                }

                if (!result.modified) {
                    if (VERBOSE) {
                        console.log(`   ✅ ${path.basename(file)} (no changes)`);
                    }
                    continue;
                }

                totalModified++;
                allChanges = allChanges.concat(result.changes);

                const relPath = path.relative(path.join(__dirname, ".."), file);
                console.log(`   📝 ${relPath} — ${result.changes.length} change(s)`);

                for (const ch of result.changes) {
                    const icon = ch.type === "REPLACE" ? "🔄"
                        : ch.type === "INSERT" ? "➕"
                            : "📦";
                    console.log(`      ${icon} ${ch.type} ${ch.route}`);
                    console.log(`         ${ch.from} → ${ch.to}`);
                }

                // ── Write to file (only in commit mode) ───────────────
                if (COMMIT && result.newCode) {
                    fs.writeFileSync(file, result.newCode, "utf-8");
                    console.log(`      💾 Written to disk`);
                }
            } catch (err) {
                console.error(`   ❌ ERROR in ${path.basename(file)}: ${err.message}`);
                if (VERBOSE) console.error(err.stack);
            }
        }
    }

    // ── Summary ────────────────────────────────────────────────────────
    console.log();
    console.log("─".repeat(70));
    console.log("📊 SUMMARY");
    console.log(`   Files scanned:   ${totalFiles}`);
    console.log(`   Files skipped:   ${totalSkipped}`);
    console.log(`   Files modified:  ${totalModified}`);
    console.log(`   Total changes:   ${allChanges.length}`);
    console.log();

    // Breakdown by type
    const replaces = allChanges.filter(c => c.type === "REPLACE").length;
    const inserts = allChanges.filter(c => c.type === "INSERT").length;
    const imports = allChanges.filter(c => c.type === "IMPORT").length;
    console.log(`   🔄 Replacements: ${replaces}`);
    console.log(`   ➕ Insertions:   ${inserts}`);
    console.log(`   📦 Imports:      ${imports}`);
    console.log();

    if (allChanges.length > 0 && !COMMIT) {
        console.log("⚠️  Run with --commit to apply these changes:");
        console.log("   node scripts/fixPermissions.codemod.js --commit");
        console.log();
    }

    if (COMMIT && totalModified > 0) {
        console.log("✅ Changes written. Run the AST audit to verify:");
        console.log("   npm run audit:permissions:ast");
        console.log();
    }

    if (allChanges.length === 0) {
        console.log("✅ All routes already properly guarded. No changes needed.");
        console.log();
    }

    console.log("─".repeat(70));
    process.exit(allChanges.length > 0 ? 1 : 0);
}

// ─── Execute ────────────────────────────────────────────────────────────────

run();
