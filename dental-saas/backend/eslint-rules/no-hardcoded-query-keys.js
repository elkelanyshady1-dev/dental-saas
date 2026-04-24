/**
 * no-hardcoded-query-keys.js — ESLint Rule (Frontend)
 *
 * ENFORCEMENT: React Query keys must use the centralized QK registry.
 * Hardcoded string arrays as queryKey values are forbidden.
 *
 * Catches:
 *   useQuery({ queryKey: ["patients", id] })         ❌
 *   useQuery({ queryKey: ["clinicalEvents", ...] })   ❌
 *
 * Allows:
 *   useQuery({ queryKey: QK.patients.detail(id) })    ✅
 *   useQuery({ queryKey: QK.orthodontics.scans(id) }) ✅
 */

"use strict";

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description: "Disallow hardcoded React Query keys — use QK registry",
            category: "Architecture",
        },
        messages: {
            noHardcodedKey:
                "Hardcoded queryKey array detected. Use the centralized QK registry " +
                "from '@/lib/query/queryKeys' instead (e.g., QK.patients.detail(id)).",
        },
        schema: [],
    },

    create(context) {
        return {
            Property(node) {
                // Match: queryKey: [...]
                if (
                    node.key.type === "Identifier" &&
                    node.key.name === "queryKey" &&
                    node.value.type === "ArrayExpression"
                ) {
                    // Check if the first element is a string literal (hardcoded)
                    const firstEl = node.value.elements[0];
                    if (firstEl && firstEl.type === "Literal" && typeof firstEl.value === "string") {
                        context.report({
                            node: node.value,
                            messageId: "noHardcodedKey",
                        });
                    }
                }
            },
        };
    },
};
