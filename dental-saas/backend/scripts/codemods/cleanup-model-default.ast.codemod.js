#!/usr/bin/env node
/**
 * cleanup-model-default.ast.codemod.js
 * Step 5f · Phase 1 — Model file self-export cleanup.
 *
 * Removes the legacy `default: mongoose.models[X] || mongoose.model(X, schema)`
 * fallback from model files. After 5e-B migrated every call site to
 * getPlatformModel/getSharedModel/getModel, the default key is dead weight
 * AND keeps mongoose.model() alive (which breaks per-org isolation).
 *
 * Target patterns (only clean variants are auto-transformed):
 *
 *   Pattern 1 — default: as IIFE || fallback (single or multi-line)
 *   ─────────────────────────────────────────────────────────────
 *     module.exports = {
 *         modelName,
 *         schema,
 *         default:
 *             mongoose.models[modelName] || mongoose.model(modelName, schema),
 *     };
 *
 *   → becomes:
 *     module.exports = {
 *         modelName,
 *         schema,
 *     };
 *
 *   Pattern 2 — intermediate variable, exported alongside default
 *   ─────────────────────────────────────────────────────────────
 *     const X = mongoose.models[modelName] || mongoose.model(modelName, schema);
 *     module.exports = {
 *         modelName,
 *         schema,
 *         default: X,
 *         X,            // keep this? only if named-exported AND consumers use it.
 *     };
 *
 *   → SKIPPED (requires manual review — the `X` key might be destructured
 *     by consumers: `const { X } = require(...)`. Removing it would break
 *     them; keeping it requires rebinding through getPlatformModel at the
 *     call site. Flagged for Phase 5f-C.)
 *
 * NOT handled here (manual or separate codemod):
 *   - Direct export: `module.exports = mongoose.model("X", schema)` (Phase 5f-B)
 *   - Plural models files (e.g., ortho.models.js) (Phase 5f-C)
 *   - Module-level model compilation used inside functions (Phase 5f-C)
 *   - DistributedLock.js (Phase 5f-C — needs lazy binding)
 *
 * USAGE
 *   node scripts/codemods/cleanup-model-default.ast.codemod.js --path src [--dry-run] [--verbose]
 */

"use strict";

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const arg = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
};

const dryRun = flag("--dry-run");
const verbose = flag("--verbose");
const targetArg = arg("--path") || "src";

if (!fs.existsSync(targetArg)) {
    console.error(`[codemod] Target does not exist: ${targetArg}`);
    process.exit(2);
}

// ─── Walker ─────────────────────────────────────────────────────────────────

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules") continue;
            yield* walk(full);
        } else if (entry.isFile() && full.endsWith(".js")) {
            yield full;
        }
    }
}

function isExempt(filePath) {
    const rel = filePath.replace(/\\/g, "/");
    if (/\/__tests__\//.test(rel)) return true;
    if (/\/tests\//.test(rel)) return true;
    if (rel.endsWith(".test.js")) return true;
    if (/\/scripts\//.test(rel)) return true;
    if (/\/migrations\//.test(rel)) return true;
    // Core factories that legitimately bind models.
    if (/\/core\/db\/getModel\.js$/.test(rel)) return true;
    if (/\/core\/db\/getPlatformModel\.js$/.test(rel)) return true;
    if (/\/core\/db\/getSharedModel\.js$/.test(rel)) return true;
    return false;
}

// ─── Helper: is this expression `mongoose.models[X] || mongoose.model(...)`? ─

function isMongooseModelFallback(expr) {
    // Accept:
    //   A) mongoose.models[X] || mongoose.model(X, schema)
    //   B) mongoose.model(X, schema)
    //   C) mongoose.models.X || mongoose.model("X", schema)
    function isMongooseModelCall(node) {
        return (
            t.isCallExpression(node) &&
            t.isMemberExpression(node.callee) &&
            !node.callee.computed &&
            t.isIdentifier(node.callee.object, { name: "mongoose" }) &&
            t.isIdentifier(node.callee.property, { name: "model" })
        );
    }
    function isMongooseModelsLookup(node) {
        return (
            t.isMemberExpression(node) &&
            t.isIdentifier(node.object, { name: "mongoose" }) &&
            t.isIdentifier(node.property, { name: "models" })
        );
    }
    if (t.isLogicalExpression(expr) && expr.operator === "||") {
        // LHS should be mongoose.models[X] or mongoose.models.X
        const lhs = expr.left;
        const lhsIsModels =
            t.isMemberExpression(lhs) &&
            isMongooseModelsLookup(lhs.object);
        if (!lhsIsModels) return false;
        return isMongooseModelCall(expr.right);
    }
    return isMongooseModelCall(expr);
}

// ─── Per-file transform ─────────────────────────────────────────────────────

function transformFile(filePath) {
    if (isExempt(filePath)) return { skipped: "exempt" };

    const src = fs.readFileSync(filePath, "utf-8");
    // Cheap gate: skip files that don't contain the fallback at all.
    if (!/mongoose\.model/.test(src)) return { skipped: "no-mongoose-model" };

    let ast;
    try {
        ast = parser.parse(src, {
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
        return { skipped: `parse-error: ${err.message}` };
    }

    let changed = false;
    let removedDefaultProp = false;
    let hadDangerousPattern = false;
    let reason = null;

    // Step 1: find module.exports = { ... } assignments.
    traverse(ast, {
        AssignmentExpression(pathNode) {
            const node = pathNode.node;
            // Only module.exports = ...
            if (node.operator !== "=") return;
            if (
                !t.isMemberExpression(node.left) ||
                node.left.computed ||
                !t.isIdentifier(node.left.object, { name: "module" }) ||
                !t.isIdentifier(node.left.property, { name: "exports" })
            ) return;

            // Case A: module.exports = ObjectExpression
            if (t.isObjectExpression(node.right)) {
                const props = node.right.properties;
                const defaultProp = props.find(
                    (p) =>
                        t.isObjectProperty(p) &&
                        t.isIdentifier(p.key, { name: "default" })
                );
                if (!defaultProp) return;

                // Only remove if the value IS the mongoose.model fallback (inline)
                // OR is an identifier whose binding initialiser is the fallback
                // AND the identifier is NOT used elsewhere (outside this prop).
                if (isMongooseModelFallback(defaultProp.value)) {
                    // Inline fallback — safe to drop.
                    node.right.properties = props.filter((p) => p !== defaultProp);
                    changed = true;
                    removedDefaultProp = true;
                    return;
                }

                if (t.isIdentifier(defaultProp.value)) {
                    const name = defaultProp.value.name;

                    // Look up the binding in the module scope.
                    const binding = pathNode.scope.getBinding(name);
                    if (!binding) return;

                    // Is the binding a const X = <mongoose.models[...] || mongoose.model(...)>?
                    const bindingInit =
                        binding.path.isVariableDeclarator() &&
                        binding.path.node.init;
                    if (!bindingInit || !isMongooseModelFallback(bindingInit)) {
                        return;
                    }

                    // Find if the same name is ALSO exported as its own property
                    // (e.g., `default: X, X` — consumer may destructure X).
                    const alsoExported = props.some(
                        (p) =>
                            p !== defaultProp &&
                            t.isObjectProperty(p) &&
                            t.isIdentifier(p.key, { name }) &&
                            (p.shorthand || t.isIdentifier(p.value, { name }))
                    );

                    // Is the identifier used anywhere EXCEPT the default/X
                    // properties we're about to remove? If yes, we can't drop
                    // the binding without breaking the rest of the module.
                    const references = binding.referencePaths;
                    const nonExportRefs = references.filter((rp) => {
                        const parent = rp.parentPath;
                        if (!parent) return true;
                        // default: X
                        if (
                            parent.isObjectProperty() &&
                            parent.node.value === rp.node &&
                            t.isIdentifier(parent.node.key, { name: "default" })
                        ) return false;
                        // X shorthand key/value
                        if (
                            parent.isObjectProperty() &&
                            parent.node.shorthand &&
                            parent.node.value === rp.node
                        ) return false;
                        return true;
                    });

                    if (nonExportRefs.length > 0 || alsoExported) {
                        // Identifier is used elsewhere — can't auto-drop.
                        // Flag for manual review (Phase 5f-C).
                        hadDangerousPattern = true;
                        reason = alsoExported
                            ? `intermediate var '${name}' is ALSO exported as a named property — consumers may destructure it`
                            : `intermediate var '${name}' has non-export references`;
                        return;
                    }

                    // Safe to drop: remove the default property AND the binding
                    // declaration.
                    node.right.properties = props.filter((p) => p !== defaultProp);
                    if (binding.path.parentPath.isVariableDeclaration() &&
                        binding.path.parent.declarations.length === 1) {
                        binding.path.parentPath.remove();
                    } else {
                        binding.path.remove();
                    }
                    changed = true;
                    removedDefaultProp = true;
                    return;
                }
            }

            // Case B: module.exports = mongoose.model("X", schema)  — direct export
            if (isMongooseModelFallback(node.right)) {
                hadDangerousPattern = true;
                reason = "direct module.exports = mongoose.model(...) — 5f-B scope";
                return;
            }
        },
    });

    if (!changed && !hadDangerousPattern) return { skipped: "no-matches" };

    if (!changed) {
        return { changed: false, hadDangerousPattern, reason };
    }

    // Step 2: if `const mongoose = require("mongoose")` is no longer used
    // anywhere in the file, remove it.
    traverse(ast, {
        VariableDeclarator(pathNode) {
            const node = pathNode.node;
            if (
                !t.isIdentifier(node.id, { name: "mongoose" }) ||
                !node.init ||
                !t.isCallExpression(node.init) ||
                !t.isIdentifier(node.init.callee, { name: "require" }) ||
                node.init.arguments.length !== 1 ||
                !t.isStringLiteral(node.init.arguments[0], { value: "mongoose" })
            ) return;

            const binding = pathNode.scope.getBinding("mongoose");
            if (!binding) return;
            if (binding.references === 0) {
                const parent = pathNode.parentPath;
                if (parent.isVariableDeclaration() && parent.node.declarations.length === 1) {
                    parent.remove();
                } else {
                    pathNode.remove();
                }
            }
        },
    });

    const output = generate(ast, { retainLines: false, compact: false }, src).code;

    if (!dryRun) {
        fs.writeFileSync(filePath, output);
    }

    return { changed: true, removedDefaultProp };
}

// ─── Main ───────────────────────────────────────────────────────────────────

const target = path.resolve(process.cwd(), targetArg);
const files = Array.from(walk(target));
console.log(`[codemod] Scanning ${files.length} files under ${target}`);
console.log(`[codemod] Mode: ${dryRun ? "DRY-RUN" : "APPLY"}`);

const totals = {
    filesChanged: 0,
    filesSkipped: 0,
    filesFlagged: 0,
    flaggedDetails: [],
};

for (const f of files) {
    const result = transformFile(f);
    if (result.skipped) {
        totals.filesSkipped++;
        continue;
    }
    if (result.hadDangerousPattern) {
        totals.filesFlagged++;
        totals.flaggedDetails.push({
            file: path.relative(process.cwd(), f),
            reason: result.reason,
        });
        if (verbose) {
            console.log(`  FLAG  ${path.relative(process.cwd(), f)}  (${result.reason})`);
        }
        continue;
    }
    if (result.changed) {
        totals.filesChanged++;
        if (verbose) {
            console.log(`  OK    ${path.relative(process.cwd(), f)}`);
        }
    }
}

console.log("");
console.log("─── Summary ───────────────────────────────────────────");
console.log(`Files changed      : ${totals.filesChanged}`);
console.log(`Files skipped      : ${totals.filesSkipped}`);
console.log(`Files FLAGGED      : ${totals.filesFlagged}  (manual review — Phase 5f-B/C)`);
console.log("");
if (totals.flaggedDetails.length > 0 && !verbose) {
    console.log("Flagged files:");
    for (const f of totals.flaggedDetails) {
        console.log(`  ${f.file}  —  ${f.reason}`);
    }
    console.log("");
}

if (dryRun) {
    console.log("[codemod] --dry-run: no files written.");
}
