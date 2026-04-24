/**
 * require-transaction-multi-write.js — ESLint Rule
 *
 * RULE 2 — Write Contract Enforcement System
 *
 * ENFORCEMENT: Any function performing 2+ DB write operations MUST
 * use session.withTransaction() to ensure atomicity.
 *
 * Triggered when a function body contains:
 *   - 2 or more awaited write calls (create, save, updateOne, etc.)
 *   - Without a corresponding withTransaction() in the same scope
 *
 * This is a HEURISTIC rule — it detects the pattern but cannot verify
 * all control flow paths. Manual review is still required for complex cases.
 *
 * Pattern blocked:
 *   async function x() {
 *     await Model.create(...)       // write 1
 *     await Model.updateOne(...)    // write 2
 *     // No withTransaction!        ❌
 *   }
 *
 * Pattern required:
 *   async function x() {
 *     const session = await conn.startSession();
 *     await session.withTransaction(async () => {
 *       await Model.create([...], { session })
 *       await Model.updateOne(..., { session })
 *     });                           ✅
 *   }
 *
 * NOTE: This rule does NOT flag loops containing writes (e.g., for-each stock item)
 * because they are harder to detect without full control flow analysis.
 * Those cases MUST be caught by code review.
 */

"use strict";

const WRITE_METHODS = new Set([
    "create",
    "save",
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "findByIdAndUpdate",
    "findOneAndDelete",
    "findByIdAndDelete",
    "deleteOne",
    "deleteMany",
    "insertMany",
    "replaceOne",
    "bulkWrite",
]);

/**
 * Count direct (non-nested) await write calls in a block statement body.
 * We only look at the top level of the function body, not inside nested
 * callbacks (those would have their own withTransaction).
 */
function countDirectWrites(body) {
    let count = 0;
    for (const stmt of body) {
        if (countWritesInStatement(stmt)) count += countWritesInStatement(stmt);
    }
    return count;
}

function countWritesInStatement(stmt) {
    if (!stmt) return 0;
    let count = 0;

    // ExpressionStatement: await Model.create(...)
    if (
        stmt.type === "ExpressionStatement" &&
        stmt.expression.type === "AwaitExpression"
    ) {
        const arg = stmt.expression.argument;
        if (
            arg.type === "CallExpression" &&
            arg.callee.type === "MemberExpression" &&
            WRITE_METHODS.has(arg.callee.property.name)
        ) {
            count++;
        }
    }

    // VariableDeclaration: const x = await Model.create(...)
    if (stmt.type === "VariableDeclaration") {
        for (const decl of stmt.declarations) {
            if (
                decl.init &&
                decl.init.type === "AwaitExpression"
            ) {
                const arg = decl.init.argument;
                if (
                    arg.type === "CallExpression" &&
                    arg.callee.type === "MemberExpression" &&
                    WRITE_METHODS.has(arg.callee.property.name)
                ) {
                    count++;
                }
            }
        }
    }

    return count;
}

/**
 * Returns true if the body contains a withTransaction() call at any depth.
 */
function hasWithTransaction(body) {
    return bodyContainsMethod(body, "withTransaction");
}

function bodyContainsMethod(node, methodName) {
    if (!node) return false;
    if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === methodName
    ) {
        return true;
    }
    for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const child = node[key];
        if (Array.isArray(child)) {
            for (const item of child) {
                if (item && typeof item === "object" && item.type) {
                    if (bodyContainsMethod(item, methodName)) return true;
                }
            }
        } else if (child && typeof child === "object" && child.type) {
            if (bodyContainsMethod(child, methodName)) return true;
        }
    }
    return false;
}

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Functions with 2+ DB write operations must use session.withTransaction(). " +
                "Rule 2 of Write Contract Enforcement System v1.0.",
            category: "Architecture",
        },
        messages: {
            missingTransaction:
                "[WriteContract R2] Function has {{count}} DB write operations without session.withTransaction(). " +
                "All multi-step writes MUST be atomic. " +
                "Wrap with: const s = await conn.startSession(); await s.withTransaction(async () => { ... }). " +
                "See write-contract-enforcement.md Rule 2.",
        },
        schema: [],
    },

    create(context) {
        function check(node) {
            const body =
                node.body &&
                node.body.type === "BlockStatement" &&
                node.body.body;
            if (!body || !Array.isArray(body)) return;

            // Only check async functions
            if (!node.async) return;

            const writeCount = countDirectWrites(body);
            if (writeCount >= 2 && !hasWithTransaction(node.body)) {
                context.report({
                    node,
                    messageId: "missingTransaction",
                    data: { count: writeCount },
                });
            }
        }

        return {
            FunctionDeclaration: check,
            FunctionExpression: check,
            ArrowFunctionExpression: check,
        };
    },
};
