/**
 * require-route-rbac.js — ESLint Rule
 *
 * ENFORCEMENT: All router.post/patch/put/delete calls in route files
 * must include requireOrgPermission() in their middleware chain.
 *
 * Catches:
 *   router.post("/", controller)                         ❌
 *   router.delete("/:id", controller)                    ❌
 *
 * Allows:
 *   router.post("/", requireOrgPermission(P.X), ctrl)    ✅
 *   router.get("/", ctrl)                                ✅ (reads exempt)
 *
 * SCOPE: Only applies to files in routes directories.
 */

"use strict";

const WRITE_METHODS = new Set(["post", "put", "patch", "delete"]);

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description: "Require requireOrgPermission() on all write route handlers",
            category: "Security",
        },
        messages: {
            missingRbac:
                "Route '{{method}}' handler is missing requireOrgPermission() middleware. " +
                "All write endpoints must enforce RBAC. Add requireOrgPermission(P.ORTHO_FULL) before the controller.",
        },
        schema: [],
    },

    create(context) {
        const filename = context.getFilename();

        // Only enforce in route files
        if (!filename.includes("routes")) return {};

        return {
            CallExpression(node) {
                // Match: router.post(...), router.patch(...), etc.
                if (
                    node.callee.type !== "MemberExpression" ||
                    node.callee.property.type !== "Identifier" ||
                    !WRITE_METHODS.has(node.callee.property.name)
                ) {
                    return;
                }

                // Skip router.use() — those are middleware stacks
                const args = node.arguments;
                if (args.length < 2) return; // no handler = likely router.use()

                // Check if any argument in the chain is requireOrgPermission(...)
                // or requireActiveVisit (which internally validates)
                const hasRbac = args.some((arg) => {
                    if (arg.type === "CallExpression") {
                        const callee = arg.callee;
                        if (callee.type === "Identifier") {
                            return callee.name === "requireOrgPermission" || callee.name === "requireActiveVisit";
                        }
                        if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
                            return callee.property.name === "requireOrgPermission" || callee.property.name === "requireActiveVisit";
                        }
                    }
                    return false;
                });

                if (!hasRbac) {
                    context.report({
                        node,
                        messageId: "missingRbac",
                        data: { method: node.callee.property.name.toUpperCase() },
                    });
                }
            },
        };
    },
};
