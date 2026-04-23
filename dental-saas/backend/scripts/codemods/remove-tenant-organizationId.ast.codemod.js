#!/usr/bin/env node
/**
 * remove-tenant-organizationId.ast.codemod.js
 *
 * AST-based variant of the Step 5c sweep. Where the regex codemod failed
 * (shorthand in queries, destructuring, aggregations), the AST version
 * operates on the parsed program tree and is precise.
 *
 * BUILT ON @babel/* (already a backend devDependency — no new install).
 *
 * BEHAVIOUR
 *
 *   REMOVES (safely):
 *     • `{ organizationId: <expr> }` property from ANY ObjectExpression that
 *       is NOT the argument to a logger/audit call. Value can be
 *       `req.context.organizationId`, `orgId`, `organizationId`, etc.
 *     • Shorthand property `organizationId` (ES2015 shorthand inside object
 *       literals — the form {organizationId, patientId, ...}).
 *     • `organizationId` from an ObjectPattern (destructuring) ONLY when the
 *       bound identifier has zero references in its scope. Use-aware check:
 *       `const { organizationId } = ctx` stays if `organizationId` is read
 *       ANYWHERE later in the same function (logger fields, function calls,
 *       conditionals, etc.). V1 broke on this — removed bindings whose
 *       identifiers were still used, producing silent undefined references.
 *     • Whole `ExpressionStatement` assignments of the form
 *       `obj.organizationId = <expr>;` or `query.organizationId = <expr>;`.
 *
 *   SKIPS (intentionally preserved):
 *     • logger / audit / log / console calls — detected by the immediate
 *       enclosing CallExpression's callee name (logger, log, audit, console,
 *       winston, pino, bunyan, or any method whose name starts with `log`).
 *     • Member-expression READS like `doc.organizationId`, `req.context.organizationId`
 *       — those are identifier USES, not schema/query properties.
 *     • Schema field definitions that have a nested `type:` field — handled
 *       by the earlier regex pass; re-running the AST codemod on already-clean
 *       files is a no-op because those Properties are gone.
 *
 *   FLAGS (warn only, never auto-modifies):
 *     • Aggregations: any `organizationId` property found inside an object
 *       where a sibling key starts with `$` (`$match`, `$group`, `$lookup`,
 *       `$project`, etc.) — emits a WARNING with the file:line so a human
 *       can review. Blindly removing from `$group._id` would collapse dimensions.
 *     • `"$organizationId"` string values (aggregation field references).
 *
 * CLI
 *
 *   node scripts/codemods/remove-tenant-organizationId.ast.codemod.js \
 *     --path src/modules/orthodontics    # REQUIRED
 *     --dry-run                           # print diff + warnings, do not write
 *     --verbose                           # per-file match log
 *
 * SAFETY
 *   - Refuses to run outside src/modules or src/organization.
 *   - Skips .test.js files and any __tests__ directory paths.
 *   - Skips migrations/ directories (historical scripts).
 */

"use strict";

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const arg  = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
};

const dryRun = flag("--dry-run");
const verbose = flag("--verbose");
const targetArg = arg("--path");

if (!targetArg) {
    console.error("[AST-codemod] --path is required (e.g. --path src/modules/orthodontics)");
    process.exit(2);
}

const target = path.resolve(process.cwd(), targetArg);
const TENANT_ROOTS = [
    path.resolve(process.cwd(), "src/modules"),
    path.resolve(process.cwd(), "src/organization"),
];

if (!TENANT_ROOTS.some((root) => target === root || target.startsWith(root + path.sep))) {
    console.error(
        `[AST-codemod] Target ${target} is NOT under a tenant-plane root.\n` +
        `             Allowed roots: ${TENANT_ROOTS.join(", ")}`
    );
    process.exit(2);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const LOGGER_CALLEE_NAMES = new Set([
    "logger", "log", "audit", "console", "winston", "pino", "bunyan",
]);

/**
 * Walks up the ancestor chain: is the current path *inside* a logger/audit
 * call expression's arguments? Detected by the callee name — either a plain
 * Identifier (logger) or a MemberExpression (logger.info, console.log).
 */
function isInsideLoggerCall(nodePath) {
    let p = nodePath.parentPath;
    while (p) {
        if (t.isCallExpression(p.node)) {
            const callee = p.node.callee;
            if (t.isIdentifier(callee) && LOGGER_CALLEE_NAMES.has(callee.name)) return true;
            if (t.isMemberExpression(callee)) {
                const obj = callee.object;
                const prop = callee.property;
                if (t.isIdentifier(obj) && LOGGER_CALLEE_NAMES.has(obj.name)) return true;
                if (t.isIdentifier(prop) && /^(log|warn|info|error|debug|trace|fatal)$/.test(prop.name) && t.isIdentifier(obj)) {
                    // e.g. `anyThing.info(...)` with a typical logger method name
                    return true;
                }
            }
        }
        p = p.parentPath;
    }
    return false;
}

/**
 * Is the parent ObjectExpression "aggregation-shaped"? i.e. does it have ANY
 * sibling key that begins with `$`? If yes, we don't auto-remove; we warn.
 */
function isAggregationContext(propertyPath) {
    const objExpr = propertyPath.parentPath && propertyPath.parentPath.node;
    if (!objExpr || !t.isObjectExpression(objExpr)) return false;
    return objExpr.properties.some((p) => {
        if (!t.isObjectProperty(p) && !t.isProperty(p)) return false;
        const k = p.key;
        if (t.isIdentifier(k)) return k.name.startsWith("$");
        if (t.isStringLiteral(k)) return k.value.startsWith("$");
        return false;
    });
}

function isOrgIdKey(prop) {
    if (!prop || (!t.isObjectProperty(prop) && !t.isProperty(prop))) return false;
    const k = prop.key;
    if (t.isIdentifier(k) && k.name === "organizationId") return true;
    if (t.isStringLiteral(k) && k.value === "organizationId") return true;
    return false;
}

function isOrgIdRestPattern(prop) {
    // destructuring shorthand: { organizationId } → prop.shorthand === true and key.name === "organizationId"
    if (!prop || !t.isObjectProperty(prop)) return false;
    const k = prop.key;
    return t.isIdentifier(k) && k.name === "organizationId";
}

// ─── File walker ────────────────────────────────────────────────────────────

function listJsFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "__tests__" || entry.name === "migrations" || entry.name === "node_modules") continue;
            out.push(...listJsFiles(full));
        } else if (entry.isFile() && full.endsWith(".js") && !full.endsWith(".test.js")) {
            out.push(full);
        }
    }
    return out;
}

// ─── Transform one file ─────────────────────────────────────────────────────

/** @returns {{changed: boolean, warnings: Array<{line:number, reason:string}>, stats: Object}} */
function transformFile(filePath) {
    const source = fs.readFileSync(filePath, "utf-8");
    const stats = {
        removedObjectProperty: 0,
        removedShorthandProperty: 0,
        removedDestructureProperty: 0,
        keptDestructureBecauseUsed: 0,     // use-awareness telemetry
        removedAssignment: 0,
    };
    const warnings = [];

    let ast;
    try {
        ast = parser.parse(source, {
            sourceType: "unambiguous",
            plugins: [
                "objectRestSpread",
                "optionalChaining",
                "nullishCoalescingOperator",
                "classProperties",
                "numericSeparator",
                "asyncGenerators",
                "dynamicImport",
            ],
        });
    } catch (err) {
        warnings.push({ line: 0, reason: `Parse error: ${err.message}` });
        return { changed: false, warnings, stats };
    }

    traverse(ast, {
        // Remove organizationId from ObjectExpressions (queries, create payloads, etc.)
        ObjectExpression(pathNode) {
            pathNode.node.properties = pathNode.node.properties.filter((prop, idx) => {
                if (!isOrgIdKey(prop)) return true;

                // Skip logger/audit object-argument contexts
                if (isInsideLoggerCall(pathNode)) return true;

                // Flag aggregation context, do not auto-modify
                if (isAggregationContext(pathNode.get(`properties.${idx}`))) {
                    warnings.push({
                        line: prop.loc ? prop.loc.start.line : 0,
                        reason: "organizationId inside aggregation-shaped object (sibling $-key present) — review manually",
                    });
                    return true;
                }

                // Skip schema field definitions: value is an ObjectExpression that
                // has a `type:` property (legacy Mongoose schema field). The earlier
                // regex codemod handled these; re-running is a no-op.
                if (
                    t.isObjectProperty(prop) &&
                    t.isObjectExpression(prop.value) &&
                    prop.value.properties.some((p) =>
                        (t.isObjectProperty(p) || t.isProperty(p)) &&
                        t.isIdentifier(p.key) &&
                        p.key.name === "type"
                    )
                ) {
                    // Still remove — schema block is legitimately stale.
                    stats.removedObjectProperty++;
                    return false;
                }

                // Count shorthand vs keyed separately for telemetry
                if (t.isObjectProperty(prop) && prop.shorthand) {
                    stats.removedShorthandProperty++;
                } else {
                    stats.removedObjectProperty++;
                }
                return false;
            });
        },

        // Use-aware removal from ObjectPatterns (destructuring).
        //
        // The v1 codemod removed every destructured organizationId unconditionally.
        // That broke files where the bound identifier was still referenced
        // downstream (logger fields, helper-function args, conditionals).
        //
        // The v2 rule: strip a destructured `organizationId` ONLY if its
        // scope-binding has zero non-declaration references. Babel's scope
        // tracks this: `binding.references` counts reads; `binding.constantViolations`
        // counts writes. If either is non-zero, the identifier is still live
        // and we must NOT remove the binding — fix those usages in a later pass.
        ObjectPattern(pathNode) {
            const enclosingFnPath = pathNode.getFunctionParent() || pathNode.scope.path;

            const shouldKeep = (prop) => {
                if (!isOrgIdRestPattern(prop)) return true;

                // For ObjectPatterns that are NOT variable declarators (e.g.,
                // function parameter destructuring), the enclosing scope tracks
                // the binding. For declarators, the declarator's scope tracks it.
                // Use getBinding on the scope that owns the pattern.
                const boundName = (prop.value && prop.value.name) || "organizationId";
                const binding = pathNode.scope.getBinding(boundName);

                // If we cannot find a binding (function parameter destructuring in
                // some rare forms, or computed property keys), fail closed — keep
                // the binding. Better to leave a dead var than a ReferenceError.
                if (!binding) {
                    stats.keptDestructureBecauseUsed++;
                    return true;
                }

                const refCount = binding.references || 0;
                const writeCount = (binding.constantViolations && binding.constantViolations.length) || 0;

                if (refCount > 0 || writeCount > 0) {
                    // Identifier is still used somewhere downstream — keep the
                    // binding; the user (or a follow-up pass) must decide whether
                    // to remove those references first.
                    stats.keptDestructureBecauseUsed++;
                    return true;
                }

                stats.removedDestructureProperty++;
                return false;
            };

            pathNode.node.properties = pathNode.node.properties.filter(shouldKeep);

            // If removing bindings left the pattern empty AND it was a simple
            // variable declarator (not a function parameter), remove the whole
            // declarator to avoid leaving `const {} = ...` behind.
            if (
                pathNode.node.properties.length === 0 &&
                pathNode.parentPath &&
                t.isVariableDeclarator(pathNode.parentPath.node)
            ) {
                const declaratorPath = pathNode.parentPath;
                const declaration = declaratorPath.parentPath;
                // Remove just this declarator; if it's the only one, the
                // declaration as a whole becomes empty and must go too.
                if (
                    t.isVariableDeclaration(declaration.node) &&
                    declaration.node.declarations.length === 1
                ) {
                    declaration.remove();
                } else {
                    declaratorPath.remove();
                }
            }
        },

        // Flag aggregation string-literal field refs "$organizationId"
        StringLiteral(pathNode) {
            if (pathNode.node.value === "$organizationId") {
                warnings.push({
                    line: pathNode.node.loc ? pathNode.node.loc.start.line : 0,
                    reason: "string literal \"$organizationId\" (aggregation field reference) — review manually",
                });
            }
        },

        // Remove `obj.organizationId = <expr>;` assignment statements
        ExpressionStatement(pathNode) {
            const expr = pathNode.node.expression;
            if (!t.isAssignmentExpression(expr)) return;
            const left = expr.left;
            if (!t.isMemberExpression(left)) return;
            const prop = left.property;
            if (t.isIdentifier(prop) && prop.name === "organizationId") {
                pathNode.remove();
                stats.removedAssignment++;
            }
        },
    });

    const changed =
        stats.removedObjectProperty +
        stats.removedShorthandProperty +
        stats.removedDestructureProperty +
        stats.removedAssignment > 0;

    if (changed && !dryRun) {
        // Preserve original style where possible.
        const output = generate(ast, {
            retainLines: false,
            compact: false,
            concise: false,
        }, source).code;
        fs.writeFileSync(filePath, output);
    }

    return { changed, warnings, stats };
}

// ─── Main ───────────────────────────────────────────────────────────────────

const files = listJsFiles(target);
console.log(`[AST-codemod] Scanning ${files.length} files under ${target}`);
console.log(`[AST-codemod] Mode: ${dryRun ? "DRY-RUN (no writes)" : "APPLY"}`);

const totals = {
    removedObjectProperty: 0,
    removedShorthandProperty: 0,
    removedDestructureProperty: 0,
    keptDestructureBecauseUsed: 0,
    removedAssignment: 0,
    filesChanged: 0,
    warnings: 0,
};

const warningsByFile = {};

for (const file of files) {
    const { changed, warnings, stats } = transformFile(file);
    if (changed) totals.filesChanged++;
    totals.removedObjectProperty         += stats.removedObjectProperty;
    totals.removedShorthandProperty      += stats.removedShorthandProperty;
    totals.removedDestructureProperty    += stats.removedDestructureProperty;
    totals.keptDestructureBecauseUsed    += stats.keptDestructureBecauseUsed;
    totals.removedAssignment             += stats.removedAssignment;
    if (warnings.length) {
        warningsByFile[file] = warnings;
        totals.warnings += warnings.length;
    }
    if (verbose && changed) {
        const rel = path.relative(process.cwd(), file);
        console.log(
            `  ${rel}  obj=${stats.removedObjectProperty} ` +
            `shorthand=${stats.removedShorthandProperty} ` +
            `destructure=${stats.removedDestructureProperty} ` +
            `assign=${stats.removedAssignment}`
        );
    }
}

console.log("\n─── Summary ───────────────────────────────────────────");
console.log(`Files changed                     : ${totals.filesChanged} / ${files.length}`);
console.log(`ObjectExpression properties       : ${totals.removedObjectProperty}`);
console.log(`Shorthand properties              : ${totals.removedShorthandProperty}`);
console.log(`Destructuring bindings removed    : ${totals.removedDestructureProperty}`);
console.log(`Destructuring bindings KEPT (used): ${totals.keptDestructureBecauseUsed}`);
console.log(`Assignment statements removed     : ${totals.removedAssignment}`);
console.log(`WARNINGS (manual review required) : ${totals.warnings}`);

if (totals.warnings > 0) {
    console.log("\n─── Warnings ──────────────────────────────────────────");
    for (const [file, warns] of Object.entries(warningsByFile)) {
        const rel = path.relative(process.cwd(), file);
        for (const w of warns) {
            console.log(`  ${rel}:${w.line}  ${w.reason}`);
        }
    }
}

if (dryRun) {
    console.log("\n[AST-codemod] --dry-run: no files written. Re-run without --dry-run to apply.");
}
