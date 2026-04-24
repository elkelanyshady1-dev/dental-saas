#!/usr/bin/env node
/**
 * migrate-default-imports.ast.codemod.js
 * Step 5e-B · Phase 2 · AST call-site migration.
 *
 * Rewrites legacy `.default` imports of Mongoose models to the connection-
 * bound getter for the model's plane.
 *
 * Input patterns handled:
 *   const X      = require("path").default;
 *   const { default: X }     = require("path");
 *   const { default: X, Y }  = require("path");   // mixed destructure
 *
 * Plane-driven transform (via model-ownership.json):
 *
 *   platform →
 *       const XDef = require("path");
 *       const X    = getPlatformModel(XDef);
 *
 *   shared →
 *       const XDef = require("path");
 *       const X    = getSharedModel(XDef);
 *
 *   tenant:
 *     · file uses `req`, has _getModels(req) helper → add binding to helper
 *     · file uses `req`, no helper                   → emit TODO, leave .default
 *     · file has no req access (worker/utility)      → emit TODO, leave .default
 *     (module-scope `getModel(req.dbConnection, Def)` is NEVER injected)
 *
 *   unknown → emit TODO, leave .default
 *
 * Auto-injects `const getPlatformModel = require("@core/db/getPlatformModel");`
 * / `getSharedModel` once per file when first needed and not already present.
 *
 * USAGE
 *   node scripts/codemods/migrate-default-imports.ast.codemod.js \
 *     --ownership model-ownership.json \
 *     --path src/platform/billing \
 *     --dry-run
 *
 *   node scripts/codemods/migrate-default-imports.ast.codemod.js \
 *     --ownership model-ownership.json \
 *     --path src/platform/billing
 *
 * EXEMPTIONS (skipped automatically):
 *   - any __tests__ or tests directory, or .test.js file
 *   - any scripts or migrations directory
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
const flag = (n) => args.includes(n);
const arg  = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
};

const dryRun = flag("--dry-run");
const verbose = flag("--verbose");
// --strict: throw if any .default import is found that maps to plane "unknown".
// Tenant-flagged sites are intentional (per the "never module-scope" rule) and
// do NOT trigger strict mode. Use this on A2+ to catch ownership-map gaps.
const strict = flag("--strict");
const ownershipPath = arg("--ownership") || "model-ownership.json";
const targetArg = arg("--path");
// --exclude: comma-separated subpath names to skip under --path (e.g. "billing").
const excludeArg = arg("--exclude");
const excludeList = excludeArg ? excludeArg.split(",").map(s => s.trim()).filter(Boolean) : [];

if (!targetArg) {
    console.error("[codemod] --path is required");
    process.exit(2);
}

if (!fs.existsSync(ownershipPath)) {
    console.error(`[codemod] Ownership map not found: ${ownershipPath}`);
    process.exit(2);
}

const ownership = JSON.parse(fs.readFileSync(ownershipPath, "utf-8"));
// Build lookup: modelName → plane, AND normalized source path → plane.
const modelNameToPlane = {};
const pathToPlane = {};
for (const [filePath, entry] of Object.entries(ownership.models || {})) {
    modelNameToPlane[entry.modelName] = entry.plane;
    // Normalize: strip leading "backend/" and ".js" for matching require() paths
    const norm = filePath.replace(/^backend\//, "").replace(/\.js$/, "");
    pathToPlane[norm] = entry.plane;
    pathToPlane["/" + norm] = entry.plane;
    pathToPlane[norm.replace(/^src\//, "")] = entry.plane;
}

const target = path.resolve(process.cwd(), targetArg);
if (!fs.existsSync(target)) {
    console.error(`[codemod] Target does not exist: ${target}`);
    process.exit(2);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the plane for a given require() path. Tries several normalizations
 * because consumers use different styles:
 *   - relative: "../shared/models/Organization"
 *   - alias:    "@shared/models/Organization"
 *   - absolute: "/src/shared/models/Organization"
 */
function planeForRequire(reqPath, fromFile) {
    // First: last-segment model name (cheapest)
    const last = reqPath.split("/").pop().replace(/\.js$/, "").replace(/\.model$/, "").replace(/\.models$/, "");

    // Common alias expansions
    const aliasExpanded = reqPath
        .replace(/^@shared\//, "src/shared/")
        .replace(/^@platform\//, "src/platform/")
        .replace(/^@billing\//, "src/platform/billing/")
        .replace(/^@core\//, "src/core/")
        .replace(/^@modules\//, "src/modules/")
        .replace(/^@infra\//, "src/infrastructure/")
        .replace(/^@utils\//, "src/utils/");

    // Try direct path match
    if (pathToPlane[aliasExpanded]) return { plane: pathToPlane[aliasExpanded], via: "path:alias" };

    // Resolve relative paths against the importing file
    if (reqPath.startsWith(".")) {
        const abs = path.resolve(path.dirname(fromFile), reqPath);
        const rel = path.relative(process.cwd(), abs).replace(/\\/g, "/");
        const relNorm = rel.replace(/^backend\//, "").replace(/\.js$/, "");
        if (pathToPlane[relNorm]) return { plane: pathToPlane[relNorm], via: "path:relative" };
    }

    // Fallback: model-name lookup from the last segment of the path
    // (e.g., "Organization", "PlanVersion.model" → "PlanVersion")
    const nameCandidates = [
        last,
        last.charAt(0).toUpperCase() + last.slice(1),
    ];
    for (const n of nameCandidates) {
        if (modelNameToPlane[n]) return { plane: modelNameToPlane[n], via: `modelName:${n}` };
    }

    return { plane: "unknown", via: "no-match" };
}

function fileUsesReq(ast) {
    let found = false;
    traverse(ast, {
        Identifier(pathNode) {
            if (pathNode.node.name === "req") {
                found = true;
                pathNode.stop();
            }
        },
    });
    return found;
}

function hasGetModelsHelper(ast) {
    let found = false;
    traverse(ast, {
        FunctionDeclaration(pathNode) {
            if (pathNode.node.id && pathNode.node.id.name === "_getModels") {
                found = true;
                pathNode.stop();
            }
        },
    });
    return found;
}

// ─── CLI exemptions ─────────────────────────────────────────────────────────

function isExempt(filePath) {
    const rel = filePath.replace(/\\/g, "/");
    if (/\/__tests__\//.test(rel)) return true;
    if (/\/tests\//.test(rel)) return true;
    if (rel.endsWith(".test.js")) return true;
    if (/\/scripts\//.test(rel)) return true;
    if (/\/migrations\//.test(rel)) return true;
    return false;
}

// ─── Walker ─────────────────────────────────────────────────────────────────

function* walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules") continue;
            if (excludeList.includes(entry.name)) continue;
            yield* walk(full);
        } else if (entry.isFile() && full.endsWith(".js")) {
            yield full;
        }
    }
}

// ─── Per-file transform ─────────────────────────────────────────────────────

function transformFile(filePath) {
    if (isExempt(filePath)) return { skipped: "exempt" };

    const src = fs.readFileSync(filePath, "utf-8");
    if (!src.includes(".default")) return { skipped: "no-default-imports" };

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

    // Pre-scan: does this file use req anywhere?
    const usesReq = fileUsesReq(ast);
    const hasHelper = hasGetModelsHelper(ast);

    const stats = {
        platformRewrites: 0,
        sharedRewrites: 0,
        tenantFlagged: 0,
        unknownFlagged: 0,
    };

    const platformNamesUsed = new Set();
    const sharedNamesUsed = new Set();
    const toFlag = []; // { identName, reqPath, reason }

    // Collect declarations to transform; mutate after traverse.
    const rewrites = []; // { path, replacement }

    traverse(ast, {
        VariableDeclarator(pathNode) {
            const node = pathNode.node;
            if (!node.init) return;

            // Case 1: const X = require("...").default;
            const isCase1 =
                node.id.type === "Identifier" &&
                node.init.type === "MemberExpression" &&
                !node.init.computed &&
                node.init.property.type === "Identifier" &&
                node.init.property.name === "default" &&
                node.init.object.type === "CallExpression" &&
                node.init.object.callee.type === "Identifier" &&
                node.init.object.callee.name === "require" &&
                node.init.object.arguments.length === 1 &&
                t.isStringLiteral(node.init.object.arguments[0]);

            // Case 2: const { default: X, ...rest } = require("...");
            const isCase2 =
                node.id.type === "ObjectPattern" &&
                node.init.type === "CallExpression" &&
                node.init.callee.type === "Identifier" &&
                node.init.callee.name === "require" &&
                node.init.arguments.length === 1 &&
                t.isStringLiteral(node.init.arguments[0]) &&
                node.id.properties.some(
                    (p) =>
                        t.isObjectProperty(p) &&
                        t.isIdentifier(p.key) &&
                        p.key.name === "default" &&
                        t.isIdentifier(p.value)
                );

            if (!isCase1 && !isCase2) return;

            let identName, reqPath, otherProps = [];
            if (isCase1) {
                identName = node.id.name;
                reqPath = node.init.object.arguments[0].value;
            } else {
                const defaultProp = node.id.properties.find(
                    (p) => t.isObjectProperty(p) && t.isIdentifier(p.key) && p.key.name === "default"
                );
                identName = defaultProp.value.name;
                reqPath = node.init.arguments[0].value;
                otherProps = node.id.properties.filter((p) => p !== defaultProp);
            }

            const { plane, via } = planeForRequire(reqPath, filePath);

            if (plane === "platform" || plane === "shared") {
                const getterName = plane === "platform" ? "getPlatformModel" : "getSharedModel";
                (plane === "platform" ? platformNamesUsed : sharedNamesUsed).add(getterName);

                // Build replacement: two consecutive VariableDeclarations:
                //   const XDef = require("path");
                //   const X = getPlatformModel(XDef);
                const defIdent = identName + "Def";
                const requireCall = t.callExpression(
                    t.identifier("require"),
                    [t.stringLiteral(reqPath)]
                );

                const defDecl = t.variableDeclaration("const", [
                    t.variableDeclarator(t.identifier(defIdent), requireCall),
                ]);
                const useDecl = t.variableDeclaration("const", [
                    t.variableDeclarator(
                        t.identifier(identName),
                        t.callExpression(t.identifier(getterName), [t.identifier(defIdent)])
                    ),
                ]);

                const replacements = [defDecl, useDecl];

                // Preserve any other destructured properties from Case 2
                if (otherProps.length > 0) {
                    const keepPattern = t.objectPattern(otherProps);
                    const otherDecl = t.variableDeclaration("const", [
                        t.variableDeclarator(
                            keepPattern,
                            t.callExpression(t.identifier("require"), [t.stringLiteral(reqPath)])
                        ),
                    ]);
                    replacements.push(otherDecl);
                }

                rewrites.push({ path: pathNode.parentPath, replacements, plane });
                stats[plane + "Rewrites"]++;
            } else if (plane === "tenant") {
                // NEVER module-scope a tenant model. Flag.
                const reason = usesReq
                    ? (hasHelper
                        ? "tenant + _getModels(req) exists → consider moving binding into helper"
                        : "tenant + req present but no _getModels(req) helper")
                    : "tenant + no req access (worker/utility)";
                toFlag.push({ identName, reqPath, reason });
                stats.tenantFlagged++;
            } else {
                toFlag.push({ identName, reqPath, reason: `unknown plane (${via})` });
                stats.unknownFlagged++;
            }
        },
    });

    if (rewrites.length === 0 && toFlag.length === 0) {
        return { skipped: "no-matches" };
    }

    // Apply AST rewrites
    for (const r of rewrites) {
        r.path.replaceWithMultiple(r.replacements);
    }

    // Inject helper imports if missing
    function fileImports(bodyName) {
        return ast.program.body.some((node) => {
            if (!t.isVariableDeclaration(node)) return false;
            return node.declarations.some((d) => t.isIdentifier(d.id) && d.id.name === bodyName);
        });
    }
    function addRequireAtTop(ident, modulePath) {
        if (fileImports(ident)) return;
        const decl = t.variableDeclaration("const", [
            t.variableDeclarator(
                t.identifier(ident),
                t.callExpression(t.identifier("require"), [t.stringLiteral(modulePath)])
            ),
        ]);
        // Insert after "use strict" if present, else at top.
        const body = ast.program.body;
        let insertAt = 0;
        if (body[0] && t.isExpressionStatement(body[0]) &&
            t.isStringLiteral(body[0].expression) &&
            body[0].expression.value === "use strict") {
            insertAt = 1;
        }
        body.splice(insertAt, 0, decl);
    }
    if (platformNamesUsed.has("getPlatformModel")) {
        addRequireAtTop("getPlatformModel", "@core/db/getPlatformModel");
    }
    if (sharedNamesUsed.has("getSharedModel")) {
        addRequireAtTop("getSharedModel", "@core/db/getSharedModel");
    }

    const output = generate(ast, { retainLines: false, compact: false }, src).code;

    // Append TODO markers for flagged sites as a comment block at file top.
    // (We DON'T modify the source positions for these — just surface them.)
    const flagBlock = toFlag.length > 0
        ? `// TODO(5e-B-manual): ${toFlag.length} .default import(s) not auto-migrated:\n` +
          toFlag.map((f) => `//   - ${f.identName} (${f.reqPath}) — ${f.reason}`).join("\n") +
          "\n"
        : "";

    const finalOutput = flagBlock + output;

    if (!dryRun) {
        fs.writeFileSync(filePath, finalOutput);
    }

    return { changed: true, stats, flagged: toFlag.length };
}

// ─── Main ───────────────────────────────────────────────────────────────────

const files = Array.from(walk(target));
console.log(`[codemod] Scanning ${files.length} files under ${target}`);
console.log(`[codemod] Mode: ${dryRun ? "DRY-RUN" : "APPLY"}`);

const totals = {
    filesChanged: 0,
    filesSkipped: 0,
    platformRewrites: 0,
    sharedRewrites: 0,
    tenantFlagged: 0,
    unknownFlagged: 0,
    filesFlaggedOnly: 0,
};

const flaggedFiles = [];

for (const f of files) {
    const result = transformFile(f);
    if (result.skipped) {
        totals.filesSkipped++;
        continue;
    }
    if (result.changed) {
        totals.filesChanged++;
        totals.platformRewrites += result.stats.platformRewrites;
        totals.sharedRewrites   += result.stats.sharedRewrites;
        totals.tenantFlagged    += result.stats.tenantFlagged;
        totals.unknownFlagged   += result.stats.unknownFlagged;

        if (result.flagged > 0) {
            flaggedFiles.push({ file: f, count: result.flagged });
            if (result.stats.platformRewrites + result.stats.sharedRewrites === 0) {
                totals.filesFlaggedOnly++;
            }
        }

        if (verbose) {
            const rel = path.relative(process.cwd(), f);
            console.log(
                `  ${rel}  platform=${result.stats.platformRewrites} shared=${result.stats.sharedRewrites} ` +
                `tenant-flagged=${result.stats.tenantFlagged} unknown-flagged=${result.stats.unknownFlagged}`
            );
        }
    }
}

console.log("\n─── Summary ───────────────────────────────────────────");
console.log("Files changed          :", totals.filesChanged);
console.log("Files skipped          :", totals.filesSkipped);
console.log("Platform rewrites      :", totals.platformRewrites);
console.log("Shared rewrites        :", totals.sharedRewrites);
console.log("Tenant sites FLAGGED   :", totals.tenantFlagged);
console.log("Unknown sites FLAGGED  :", totals.unknownFlagged);
console.log("Files flagged-only     :", totals.filesFlaggedOnly);

if (flaggedFiles.length > 0 && verbose) {
    console.log("\n─── Flagged files (manual review) ───");
    for (const f of flaggedFiles) {
        const rel = path.relative(process.cwd(), f.file);
        console.log(`   ${f.count} flag(s)  ${rel}`);
    }
}

if (dryRun) {
    console.log("\n[codemod] --dry-run: no files written.");
}

// Strict mode: fail the process if any .default import couldn't be auto-
// resolved to a plane (ownership-map gap). Tenant-flagged sites are
// intentional and do NOT fail strict — those are the designed "manual review"
// flow per the never-module-scope rule. Use --strict on A2+ to force map
// completeness before applying.
if (strict && totals.unknownFlagged > 0) {
    console.error("\n[codemod] STRICT MODE: " + totals.unknownFlagged +
        " unresolved .default import(s) — add to EXPLICIT_OVERRIDES in " +
        "generate-model-ownership.js, regenerate the map, then re-run.");
    process.exit(3);
}
