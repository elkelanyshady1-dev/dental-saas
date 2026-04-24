#!/usr/bin/env node
/**
 * lazy-model-binding.ast.codemod.js
 * v9.4.2 — Option A lazy model binding refactor.
 *
 * Parse-only strategy: we use babel ONLY to identify targets, then do
 * byte-range string replacements on the source. Avoids babel-traverse
 * scope conflicts when the transformation adds a declaration with the
 * same name as the one it's replacing.
 *
 * Converts every module-scope
 *   const X = getPlatformModel(XDef);
 *   const X = getSharedModel(XDef);
 * into a lazy getter:
 *   let _X_cache = null;
 *   function X() { return _X_cache || (_X_cache = getPlatformModel(XDef)); }
 * and rewrites every reference to `X` (that's not a property key or the
 * declarator itself) so that `X.find(...)` becomes `X().find(...)` and
 * `new X(args)` becomes `new (X())(args)`.
 *
 * EXEMPTIONS (never touched):
 *   - /tests/, /__tests__/, /scripts/, /migrations/
 *   - /core/db/  (connection factories)
 *
 * USAGE
 *   node scripts/codemods/lazy-model-binding.ast.codemod.js --path src [--dry-run]
 */

"use strict";

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");
const targetArg = args[args.indexOf("--path") + 1] || "src";

const ROOT = path.resolve(process.cwd(), targetArg);
if (!fs.existsSync(ROOT)) {
    console.error("target does not exist:", ROOT);
    process.exit(2);
}

function isExempt(filePath) {
    const rel = filePath.replace(/\\/g, "/");
    if (/\/tests\//.test(rel)) return true;
    if (/\/__tests__\//.test(rel)) return true;
    if (rel.endsWith(".test.js")) return true;
    if (/\/scripts\//.test(rel)) return true;
    if (/\/migrations\//.test(rel)) return true;
    if (/\/core\/db\//.test(rel)) return true;
    return false;
}

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

// Walk a node tree by recursion, invoking visit(node, parent, key) for each AST node.
function walkAst(node, visit, parent = null, key = null) {
    if (!node || typeof node !== "object" || !node.type) return;
    visit(node, parent, key);
    for (const k of Object.keys(node)) {
        if (k === "loc" || k === "start" || k === "end" || k === "range" || k === "leadingComments" || k === "trailingComments") continue;
        const v = node[k];
        if (Array.isArray(v)) {
            for (const child of v) walkAst(child, visit, node, k);
        } else if (v && typeof v === "object" && v.type) {
            walkAst(v, visit, node, k);
        }
    }
}

const totals = {
    filesChanged: 0,
    filesSkipped: 0,
    declarationsRewritten: 0,
    referencesRewritten: 0,
    filesWithErrors: 0,
};

for (const file of walk(ROOT)) {
    if (isExempt(file)) { totals.filesSkipped++; continue; }

    const src = fs.readFileSync(file, "utf8");
    if (!/get(Platform|Shared)Model\s*\(/.test(src)) { totals.filesSkipped++; continue; }

    let ast;
    try {
        ast = parser.parse(src, {
            sourceType: "unambiguous",
            plugins: [
                "objectRestSpread", "optionalChaining", "nullishCoalescingOperator",
                "classProperties", "numericSeparator", "asyncGenerators", "dynamicImport",
            ],
            ranges: true,
        });
    } catch (err) {
        totals.filesWithErrors++;
        if (verbose) console.error("PARSE FAIL", file, err.message);
        continue;
    }

    // ── Step 1: find target declarations at program scope ──────────────────
    //   const X = getPlatformModel(XDef);   OR   const X = getSharedModel(XDef);
    // We only consider top-level VariableDeclaration (parent === Program).
    //
    // targets[identName] = { decl, declarator, getterName, defArg, programIndex }
    const targets = {};

    const body = ast.program.body;
    for (let i = 0; i < body.length; i++) {
        const node = body[i];
        if (node.type !== "VariableDeclaration" || node.kind !== "const") continue;

        // A const declaration can have multiple declarators — handle each.
        for (const d of node.declarations) {
            if (!d.id || d.id.type !== "Identifier") continue;
            if (!d.init || d.init.type !== "CallExpression") continue;
            const callee = d.init.callee;
            if (!callee || callee.type !== "Identifier") continue;
            if (callee.name !== "getPlatformModel" && callee.name !== "getSharedModel") continue;
            if (d.init.arguments.length !== 1 || d.init.arguments[0].type !== "Identifier") continue;

            targets[d.id.name] = {
                decl: node,
                declarator: d,
                getterName: callee.name,
                defArg: d.init.arguments[0].name,
                programIndex: i,
            };
        }
    }

    if (Object.keys(targets).length === 0) { totals.filesSkipped++; continue; }

    // ── Step 2: collect reference replacements (byte-range edits) ──────────
    // For each Identifier whose name matches a target AND is not the declarator id
    // AND is not a property key / member-expression property / import specifier / etc.
    //
    // We'll emit a patch for each: the Identifier range is replaced with
    //   `X()` for property-access or call targets, or
    //   `(X())` when used as NewExpression.callee.
    const edits = []; // { start, end, text }

    walkAst(ast, (node, parent, key) => {
        if (!node || node.type !== "Identifier") return;
        const name = node.name;
        if (!(name in targets)) return;
        if (!parent) return;

        // Skip the declarator id itself (will be replaced by its own patch).
        if (parent.type === "VariableDeclarator" && parent.id === node) return;
        // Property-key / member-expression property positions are not references.
        if (parent.type === "ObjectProperty" && parent.key === node && !parent.computed) return;
        if (parent.type === "ObjectMethod" && parent.key === node && !parent.computed) return;
        if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return;
        if (parent.type === "ClassProperty" && parent.key === node && !parent.computed) return;
        if (parent.type === "ClassMethod" && parent.key === node && !parent.computed) return;
        // Function/class identifier (not applicable here — target is module scope).
        if (parent.type === "FunctionDeclaration" && parent.id === node) return;
        if (parent.type === "ClassDeclaration" && parent.id === node) return;
        // Labels.
        if (parent.type === "LabeledStatement" && parent.label === node) return;
        if (parent.type === "BreakStatement" && parent.label === node) return;
        if (parent.type === "ContinueStatement" && parent.label === node) return;

        // NewExpression.callee → wrap in parens: `new X(...)` → `new (X())(...)`
        if (parent.type === "NewExpression" && parent.callee === node) {
            edits.push({ start: node.start, end: node.end, text: `(${name}())` });
            return;
        }

        // Otherwise `X` becomes `X()`.
        edits.push({ start: node.start, end: node.end, text: `${name}()` });
    });

    // ── Step 3: build patches for the declarations themselves ──────────────
    // For each target, replace the entire `const X = getXModel(Def);` line
    // (the VariableDeclaration when it has only that one declarator) OR just
    // the single declarator (when grouped with other declarators in one const).
    //
    // Simplest: group by declaration and rewrite each declaration once.
    const declsSeen = new Set();
    const declEdits = []; // { start, end, text }
    for (const [name, info] of Object.entries(targets)) {
        if (declsSeen.has(info.decl)) continue;
        declsSeen.add(info.decl);

        const decl = info.decl;
        const keptDeclarators = [];
        const functionBlocks = [];

        for (const d of decl.declarations) {
            const isTarget =
                d.id && d.id.type === "Identifier" &&
                d.init && d.init.type === "CallExpression" &&
                d.init.callee && d.init.callee.type === "Identifier" &&
                (d.init.callee.name === "getPlatformModel" || d.init.callee.name === "getSharedModel") &&
                d.init.arguments.length === 1 &&
                d.init.arguments[0].type === "Identifier";

            if (!isTarget) {
                // Preserve this declarator verbatim (slice from source).
                keptDeclarators.push(src.slice(d.start, d.end));
                continue;
            }

            const identName = d.id.name;
            const callee = d.init.callee.name;
            const defArg = d.init.arguments[0].name;
            const cache = "_" + identName + "_cache";

            functionBlocks.push(
                `let ${cache} = null;\n` +
                `function ${identName}() {\n` +
                `    return ${cache} || (${cache} = ${callee}(${defArg}));\n` +
                `}`
            );
        }

        const replacement = [];
        if (keptDeclarators.length > 0) {
            replacement.push(`${decl.kind} ${keptDeclarators.join(", ")};`);
        }
        replacement.push(...functionBlocks);

        declEdits.push({
            start: decl.start,
            end: decl.end,
            text: replacement.join("\n"),
        });
        totals.declarationsRewritten++;
    }

    // ── Step 4: apply all edits in descending order of `end` to preserve offsets ──
    const allEdits = [...edits, ...declEdits].sort((a, b) => b.end - a.end);
    let out = src;
    for (const e of allEdits) {
        out = out.slice(0, e.start) + e.text + out.slice(e.end);
    }

    totals.referencesRewritten += edits.length;

    if (!dryRun) fs.writeFileSync(file, out);
    totals.filesChanged++;

    if (verbose) {
        const rel = path.relative(process.cwd(), file);
        console.log(`${dryRun ? "[DRY] " : ""}${rel} — ${Object.keys(targets).length} decls, ${edits.length} refs`);
    }
}

console.log("");
console.log("─── Summary ───");
console.log("Files changed        :", totals.filesChanged);
console.log("Declarations fixed   :", totals.declarationsRewritten);
console.log("References rewritten :", totals.referencesRewritten);
console.log("Files skipped        :", totals.filesSkipped);
if (totals.filesWithErrors) console.log("Files with errors    :", totals.filesWithErrors);
if (dryRun) console.log("[--dry-run: nothing written]");
