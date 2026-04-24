/**
 * no-unsafe-zod-record.js — ESLint Rule
 *
 * ENFORCEMENT: Blocks z.record(z.unknown()) patterns in validator and controller files.
 *
 * Forbidden patterns:
 *   z.record(z.unknown())                ❌
 *   z.record(z.string(), z.unknown())    ❌
 *
 * Allowed patterns:
 *   z.record(z.string(), z.number())     ✅ (typed values)
 *   z.record(z.string(), jsonValue)      ✅ (named typed union)
 *   z.object({ key: z.any() }).strict()  ✅ (explicit keys)
 *
 * Scope: *.validator.js, *.controller.js
 */

"use strict";

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description: "Disallow z.record(z.unknown()) — use typed schemas instead",
            category: "Best Practices",
        },
        messages: {
            unsafeRecord:
                "z.record(z.unknown()) is forbidden — use explicit z.object() with named keys, " +
                "or z.record(z.string(), <typed_value>) with a specific value type.",
        },
        schema: [],
    },

    create(context) {
        const filename = context.getFilename?.() || context.filename || "";

        // Only apply to validator and controller files
        if (!filename.includes("validator") && !filename.includes("controller")) {
            return {};
        }

        return {
            // Match: z.record(z.unknown())
            // AST: CallExpression where callee is z.record and first arg is z.unknown()
            CallExpression(node) {
                if (!_isZodCall(node, "record")) return;

                const args = node.arguments;
                if (args.length === 0) return;

                // z.record(z.unknown()) — single arg
                if (args.length === 1 && _isZodCall(args[0], "unknown")) {
                    context.report({ node, messageId: "unsafeRecord" });
                    return;
                }

                // z.record(z.string(), z.unknown()) — two args, value is unknown
                if (args.length === 2 && _isZodCall(args[1], "unknown")) {
                    context.report({ node, messageId: "unsafeRecord" });
                }
            },
        };
    },
};

/**
 * Checks if a node is a z.<method>() call expression.
 */
function _isZodCall(node, method) {
    if (!node || node.type !== "CallExpression") return false;
    const callee = node.callee;
    return (
        callee.type === "MemberExpression" &&
        callee.object?.name === "z" &&
        callee.property?.name === method
    );
}
