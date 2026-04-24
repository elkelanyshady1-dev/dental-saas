#!/usr/bin/env node
/**
 * enforceWriteContract.js
 * Write Contract Enforcement Engine v2.0 — AST-Based Scanner
 *
 * Detects write contract violations across the codebase using @babel/parser.
 *
 * Usage:
 *   node scripts/enforceWriteContract.js          # report mode
 *   node scripts/enforceWriteContract.js --fix     # auto-fix where possible
 */
"use strict";

const fs = require("fs");
const path = require("path");
const glob = require("glob");
const parser = require("@babel/parser");

// ─── Configuration ───────────────────────────────────────────────────────────

const SRC_ROOT = path.resolve(__dirname, "..", "src");

const DB_WRITE_METHODS = new Set([
  "create",
  "save",
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findByIdAndUpdate",
  "deleteOne",
  "deleteMany",
  "insertMany",
  "bulkWrite",
]);

const FIND_METHODS = new Set(["findOne", "findById", "find"]);

const FIX_MODE = process.argv.includes("--fix");

// ─── AST Walker ──────────────────────────────────────────────────────────────

function walk(node, visitors, parent) {
  if (!node || typeof node !== "object") return;
  if (node.type && visitors[node.type]) {
    visitors[node.type](node, parent);
  }
  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((c) => {
        if (c && c.type) walk(c, visitors, node);
      });
    } else if (child && child.type) {
      walk(child, visitors, node);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseFile(filePath) {
  const source = fs.readFileSync(filePath, "utf-8");
  try {
    return {
      ast: parser.parse(source, {
        sourceType: "module",
        plugins: ["jsx"],
        allowReturnOutsideFunction: true,
        allowImportExportEverywhere: true,
        errorRecovery: true,
      }),
      source,
    };
  } catch {
    return null;
  }
}

function relPath(absPath) {
  return path.relative(path.resolve(__dirname, ".."), absPath).replace(/\\/g, "/");
}

function isOrgPlane(filePath) {
  const rel = relPath(filePath);
  return rel.includes("/modules/") || rel.includes("/organization/");
}

function isControllerOrRoute(filePath) {
  const base = path.basename(filePath).toLowerCase();
  return base.includes("controller") || base.includes("route");
}

/**
 * Extract the callee method name from a CallExpression node.
 * Handles both obj.method() and method() forms.
 */
function getCalleeMethodName(node) {
  if (!node || node.type !== "CallExpression") return null;
  const callee = node.callee;
  if (callee.type === "MemberExpression" && callee.property) {
    return callee.property.name || callee.property.value || null;
  }
  if (callee.type === "Identifier") {
    return callee.name;
  }
  return null;
}

/**
 * Check whether a CallExpression is mongoose.startSession()
 */
function isMongooseStartSession(node) {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  if (
    callee.type === "MemberExpression" &&
    callee.object &&
    callee.object.type === "Identifier" &&
    callee.object.name === "mongoose" &&
    callee.property &&
    (callee.property.name || callee.property.value) === "startSession"
  ) {
    return true;
  }
  return false;
}

/**
 * Check if a subtree contains any DB write method calls.
 */
function containsDbWrite(node) {
  let found = false;
  walk(
    node,
    {
      CallExpression(n) {
        const method = getCalleeMethodName(n);
        if (method && DB_WRITE_METHODS.has(method)) {
          found = true;
        }
      },
    },
    null
  );
  return found;
}

/**
 * Check if a node is a setImmediate call with a callback.
 */
function isSetImmediateCall(node) {
  if (node.type !== "CallExpression") return false;
  const callee = node.callee;
  return callee.type === "Identifier" && callee.name === "setImmediate";
}

/**
 * Detect find-then-create pattern:
 *   const x = await Model.findOne(...)
 *   if (!x) { ... Model.create() / new Model().save() ... }
 */
function detectFindThenCreate(ast) {
  const violations = [];

  walk(
    ast,
    {
      BlockStatement(blockNode) {
        const body = blockNode.body;
        if (!Array.isArray(body)) return;

        for (let i = 0; i < body.length - 1; i++) {
          const stmt = body[i];
          // Look for: const x = await Model.findOne/findById/find(...)
          if (stmt.type !== "VariableDeclaration") continue;

          for (const decl of stmt.declarations) {
            if (!decl.id || decl.id.type !== "Identifier") continue;
            const varName = decl.id.name;

            let init = decl.init;
            // Unwrap await
            if (init && init.type === "AwaitExpression") {
              init = init.argument;
            }
            if (!init || init.type !== "CallExpression") continue;

            const method = getCalleeMethodName(init);
            if (!method || !FIND_METHODS.has(method)) continue;

            // Now look at subsequent statements for if (!varName) { ...create/save... }
            for (let j = i + 1; j < body.length; j++) {
              const next = body[j];
              if (next.type !== "IfStatement") continue;

              if (isNegationOf(next.test, varName)) {
                // Check if consequent contains create/save
                if (containsDbWrite(next.consequent)) {
                  violations.push({
                    line: stmt.loc ? stmt.loc.start.line : 0,
                    rule: "R6",
                    message: "[R6] find-then-create race condition",
                  });
                }
              }
            }
          }
        }
      },
    },
    null
  );

  return violations;
}

/**
 * Check if a test expression is a negation of a variable name.
 * Handles: !x, x === null, x === undefined, !x, x == null
 */
function isNegationOf(test, varName) {
  if (!test) return false;

  // !x
  if (
    test.type === "UnaryExpression" &&
    test.operator === "!" &&
    test.argument &&
    test.argument.type === "Identifier" &&
    test.argument.name === varName
  ) {
    return true;
  }

  // x === null, x === undefined, x == null, x == undefined
  if (
    test.type === "BinaryExpression" &&
    (test.operator === "===" || test.operator === "==")
  ) {
    const isVarLeft =
      test.left.type === "Identifier" && test.left.name === varName;
    const isVarRight =
      test.right.type === "Identifier" && test.right.name === varName;
    const isNullish = (n) =>
      (n.type === "NullLiteral") ||
      (n.type === "Identifier" && n.name === "undefined");

    if (isVarLeft && isNullish(test.right)) return true;
    if (isVarRight && isNullish(test.left)) return true;
  }

  return false;
}

// ─── Rule Scanners ───────────────────────────────────────────────────────────

function scanFile(filePath) {
  const result = parseFile(filePath);
  if (!result) return [];

  const { ast } = result;
  const violations = [];
  const orgPlane = isOrgPlane(filePath);
  const controllerOrRoute = isControllerOrRoute(filePath);

  walk(
    ast.program,
    {
      CallExpression(node) {
        // R8: mongoose.startSession() in org-plane files
        if (orgPlane && isMongooseStartSession(node)) {
          violations.push({
            line: node.loc ? node.loc.start.line : 0,
            rule: "R8",
            message:
              "[R8] mongoose.startSession() found — use req.dbConnection.startSession()",
          });
        }

        // R3: setImmediate with DB writes
        if (isSetImmediateCall(node) && node.arguments.length > 0) {
          const callback = node.arguments[0];
          if (containsDbWrite(callback)) {
            violations.push({
              line: node.loc ? node.loc.start.line : 0,
              rule: "R3",
              message: "[R3] setImmediate contains DB write",
            });
          }
        }

        // R1: Direct DB write in controller/route
        if (controllerOrRoute) {
          const method = getCalleeMethodName(node);
          if (method && DB_WRITE_METHODS.has(method)) {
            violations.push({
              line: node.loc ? node.loc.start.line : 0,
              rule: "R1",
              message: "[R1] Direct DB write in controller/route",
            });
          }
        }
      },
    },
    null
  );

  // R6: find-then-create
  const r6 = detectFindThenCreate(ast.program);
  violations.push(...r6);

  return violations;
}

// ─── Fix Mode ────────────────────────────────────────────────────────────────

function applyFixes(filePath, violations) {
  if (!violations.length) return;

  const r8Violations = violations.filter((v) => v.rule === "R8");
  const otherViolations = violations.filter((v) => v.rule !== "R8");

  // Auto-fix R8: mongoose.startSession() -> req.dbConnection.startSession()
  if (r8Violations.length > 0 && isOrgPlane(filePath)) {
    let source = fs.readFileSync(filePath, "utf-8");

    // Check if any enclosing function has `req` as a parameter
    const result = parseFile(filePath);
    if (result) {
      let hasReqParam = false;
      walk(
        result.ast.program,
        {
          FunctionDeclaration(node) {
            if (
              node.params &&
              node.params.some(
                (p) => p.type === "Identifier" && p.name === "req"
              )
            ) {
              hasReqParam = true;
            }
          },
          FunctionExpression(node) {
            if (
              node.params &&
              node.params.some(
                (p) => p.type === "Identifier" && p.name === "req"
              )
            ) {
              hasReqParam = true;
            }
          },
          ArrowFunctionExpression(node) {
            if (
              node.params &&
              node.params.some(
                (p) => p.type === "Identifier" && p.name === "req"
              )
            ) {
              hasReqParam = true;
            }
          },
        },
        null
      );

      if (hasReqParam) {
        const updated = source.replace(
          /mongoose\.startSession\(\)/g,
          "req.dbConnection.startSession()"
        );
        if (updated !== source) {
          fs.writeFileSync(filePath, updated, "utf-8");
          console.log(
            `  [FIXED] ${relPath(filePath)} — replaced mongoose.startSession() with req.dbConnection.startSession()`
          );
        }
      } else {
        console.log(
          `  [FIX REQUIRED] ${relPath(filePath)} — mongoose.startSession() found but no \`req\` parameter in scope. Add \`req\` param or refactor to use req.dbConnection manually.`
        );
      }
    }
  }

  // Manual fix instructions for other rules
  for (const v of otherViolations) {
    const rel = relPath(filePath);
    switch (v.rule) {
      case "R1":
        console.log(
          `  [FIX REQUIRED] ${rel}:${v.line} — Move DB write call to a service layer function. Controllers must only call services.`
        );
        break;
      case "R3":
        console.log(
          `  [FIX REQUIRED] ${rel}:${v.line} — Remove setImmediate wrapper around DB write. Use await or include in transaction.`
        );
        break;
      case "R6":
        console.log(
          `  [FIX REQUIRED] ${rel}:${v.line} — Replace find-then-create with upsert or handle E11000 duplicate key error.`
        );
        break;
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const separator = "══════════════════════════════════════════════════════════════";

  console.log(separator);
  console.log(" Write Contract Enforcement Engine v2.0 — AST Scan Report");
  console.log(separator);
  console.log();

  // Gather files
  const pattern = path.join(SRC_ROOT, "**", "*.js").replace(/\\/g, "/");
  const allFiles = glob.sync(pattern, {
    ignore: [
      "**/node_modules/**",
      "**/tests/**",
      "**/test/**",
      "**/__tests__/**",
      "**/scripts/**",
    ],
  });

  const ruleResults = {
    R1: { label: "No direct DB writes in controllers/routes", violations: [] },
    R3: { label: "No DB writes inside setImmediate", violations: [] },
    R6: { label: "No find-then-create race conditions", violations: [] },
    R8: { label: "No mongoose.startSession() in org-plane", violations: [] },
  };

  let totalViolations = 0;

  for (const filePath of allFiles) {
    const violations = scanFile(filePath);
    if (!violations.length) continue;

    for (const v of violations) {
      ruleResults[v.rule].violations.push({
        file: relPath(filePath),
        line: v.line,
        message: v.message,
      });
      totalViolations++;
    }

    if (FIX_MODE) {
      applyFixes(filePath, violations);
    }
  }

  // Print rule-level pass/fail
  console.log("Rule Status:");
  console.log("─".repeat(60));
  for (const [code, rule] of Object.entries(ruleResults)) {
    const status =
      rule.violations.length === 0 ? "\x1b[32m[PASS]\x1b[0m" : "\x1b[31m[FAIL]\x1b[0m";
    console.log(`  ${status} ${code}: ${rule.label} (${rule.violations.length} violations)`);
  }
  console.log();

  // Print file-by-file violations
  if (totalViolations > 0) {
    console.log("Violations:");
    console.log("─".repeat(60));
    for (const [, rule] of Object.entries(ruleResults)) {
      for (const v of rule.violations) {
        console.log(`  ${v.file}:${v.line} — ${v.message}`);
      }
    }
    console.log();
  }

  // Summary
  console.log("Summary:");
  console.log("─".repeat(60));
  console.log(`  Total files scanned: ${allFiles.length}`);
  console.log(`  Violations found:    ${totalViolations}`);
  console.log(`  Rules checked:       ${Object.keys(ruleResults).length}`);
  console.log();

  if (FIX_MODE) {
    console.log("Fix mode was active. Review changes above.");
    console.log();
  }

  process.exit(totalViolations > 0 ? 1 : 0);
}

main();
