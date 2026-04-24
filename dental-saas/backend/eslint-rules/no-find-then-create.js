/**
 * no-find-then-create.js — ESLint Rule
 *
 * RULE 6 — Write Contract Enforcement System
 *
 * ENFORCEMENT: The check-then-act pattern (findOne → if (!exists) create) is
 * a race condition. Use atomic findOneAndUpdate with $setOnInsert + upsert:true.
 *
 * Pattern blocked (in sequence within same function):
 *   const x = await Model.findOne(...)
 *   if (!x) await Model.create(...)      ❌
 *
 * Also blocked:
 *   if (!existing) { await Model.create(...) }    ❌
 *   if (!existing) { await new Model({}).save() } ❌
 *
 * Required pattern:
 *   await Model.findOneAndUpdate(
 *     filter,
 *     { $setOnInsert: data },
 *     { upsert: true, returnDocument: "after", session }
 *   )                                             ✅
 *
 * Note: This rule uses heuristics — it flags .create() calls inside if-blocks
 * that test a negated variable (likely an "if not found" pattern). It may have
 * false positives in complex flows. Suppress with a documented eslint-disable
 * comment explaining why the pattern is safe in that specific case.
 */

"use strict";

const FIND_METHODS = new Set([
    "findOne",
    "findById",
    "find",
    "exists",
]);

const CREATE_METHODS = new Set([
    "create",
    "save",
    "insertMany",
]);

/**
 * Returns true if node is a call to one of the FIND_METHODS
 */
function isFindCall(node) {
    return (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.property.type === "Identifier" &&
        FIND_METHODS.has(node.callee.property.name)
    );
}

/**
 * Returns true if node is a call to one of the CREATE_METHODS
 */
function isCreateCall(node) {
    if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.property.type === "Identifier" &&
        CREATE_METHODS.has(node.callee.property.name)
    ) {
        return true;
    }
    // new Model({}).save()
    if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.property.name === "save"
    ) {
        return true;
    }
    return false;
}

/**
 * Walks an AST body (array of statements) and returns all await expressions
 * that wrap a find call, capturing the variable name they are assigned to.
 */
function collectFindVars(body) {
    const findVars = new Set();
    for (const stmt of body) {
        if (
            stmt.type === "VariableDeclaration" &&
            stmt.declarations.length > 0
        ) {
            for (const decl of stmt.declarations) {
                const init = decl.init;
                if (
                    init &&
                    init.type === "AwaitExpression" &&
                    isFindCall(init.argument)
                ) {
                    if (decl.id && decl.id.name) {
                        findVars.add(decl.id.name);
                    }
                }
            }
        }
        // Also catch: existing = await Model.findOne(...)
        if (
            stmt.type === "ExpressionStatement" &&
            stmt.expression.type === "AssignmentExpression"
        ) {
            const right = stmt.expression.right;
            if (
                right.type === "AwaitExpression" &&
                isFindCall(right.argument)
            ) {
                if (stmt.expression.left.type === "Identifier") {
                    findVars.add(stmt.expression.left.name);
                }
            }
        }
    }
    return findVars;
}

/**
 * Checks if an if-statement tests for the absence of a find-result variable.
 * e.g., if (!x) or if (!existing) or if (x === null)
 */
function testsFindVarAbsence(test, findVars) {
    // !x
    if (
        test.type === "UnaryExpression" &&
        test.operator === "!" &&
        test.argument.type === "Identifier" &&
        findVars.has(test.argument.name)
    ) {
        return true;
    }
    // x === null
    if (
        test.type === "BinaryExpression" &&
        (test.operator === "===" || test.operator === "==") &&
        ((test.left.type === "Identifier" && findVars.has(test.left.name) &&
          test.right.type === "Literal" && test.right.value === null) ||
         (test.right.type === "Identifier" && findVars.has(test.right.name) &&
          test.left.type === "Literal" && test.left.value === null))
    ) {
        return true;
    }
    // !x.found, x == undefined
    if (
        test.type === "BinaryExpression" &&
        (test.operator === "===" || test.operator === "==") &&
        test.right.type === "UnaryExpression" &&
        test.right.operator === "void"
    ) {
        return true;
    }
    return false;
}

/**
 * Walks the consequent (then-block) of an if statement to find create calls.
 */
function containsCreateCall(node) {
    if (!node) return false;
    if (isCreateCall(node)) return true;
    if (
        node.type === "AwaitExpression" &&
        isCreateCall(node.argument)
    ) {
        return true;
    }
    for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const child = node[key];
        if (Array.isArray(child)) {
            for (const item of child) {
                if (item && typeof item === "object" && item.type) {
                    if (containsCreateCall(item)) return true;
                }
            }
        } else if (child && typeof child === "object" && child.type) {
            if (containsCreateCall(child)) return true;
        }
    }
    return false;
}

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Disallow check-then-create (find + if not found + create) race-condition pattern. " +
                "Rule 6 of Write Contract Enforcement System v1.0. " +
                "Use findOneAndUpdate with { upsert: true, $setOnInsert } for atomic upserts.",
            category: "Architecture",
        },
        messages: {
            findThenCreate:
                "[WriteContract R6] find-then-create race condition detected. " +
                "Use findOneAndUpdate(..., { $setOnInsert: data }, { upsert: true }) " +
                "for atomic upsert. See write-contract-enforcement.md Rule 6.",
        },
        schema: [],
    },

    create(context) {
        return {
            // Check function bodies for the pattern
            "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression"(node) {
                const body =
                    node.body &&
                    node.body.type === "BlockStatement" &&
                    node.body.body;
                if (!body || !Array.isArray(body)) return;

                const findVars = collectFindVars(body);
                if (findVars.size === 0) return;

                for (const stmt of body) {
                    if (
                        stmt.type === "IfStatement" &&
                        testsFindVarAbsence(stmt.test, findVars) &&
                        containsCreateCall(stmt.consequent)
                    ) {
                        context.report({
                            node: stmt,
                            messageId: "findThenCreate",
                        });
                    }
                }
            },
        };
    },
};
