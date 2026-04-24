/**
 * require-idempotency-financial.js — ESLint Rule
 *
 * RULE 5 — Write Contract Enforcement System
 *
 * ENFORCEMENT: Financial write operations MUST include idempotency
 * protection to prevent double-processing of payments, invoices,
 * ledger entries, and other monetary transactions.
 *
 * Applies only to files in billing/payment/refund/invoice/ledger/
 * contract/dunning/renewal paths (service-layer files).
 *
 * Skips: tests, scripts, models, validators, DTOs, controllers,
 * routes, projections, and writeContract.js.
 *
 * Pattern blocked:
 *   async function chargeCustomer(req, payload) {
 *     await Invoice.create(data);   // write without idempotency ❌
 *   }
 *
 * Pattern required:
 *   async function chargeCustomer(req, payload) {
 *     const { idempotencyKey } = payload;
 *     await IdempotencyService.process(idempotencyKey, async () => {
 *       await Invoice.create(data);
 *     });                            // ✅
 *   }
 */

"use strict";

const WRITE_METHODS = new Set([
    "create",
    "save",
    "updateOne",
    "findOneAndUpdate",
    "insertMany",
    "bulkWrite",
    "deleteOne",
    "findByIdAndUpdate",
]);

/**
 * Financial domain path patterns (case-insensitive matching).
 */
const FINANCIAL_PATTERNS = [
    /[/\\]billing/i,
    /[/\\]payment/i,
    /[/\\]refund/i,
    /[/\\]invoice/i,
    /[/\\]ledger/i,
    /[/\\]contract/i,
    /[/\\]dunning/i,
    /[/\\]renewal/i,
    /billing/i,
    /payment/i,
    /refund/i,
    /invoice/i,
    /ledger/i,
    /contract/i,
    /dunning/i,
    /renewal/i,
];

/**
 * Exempted file patterns — these files don't perform direct writes.
 */
const EXEMPT_PATTERNS = [
    /[/\\]tests?[/\\]/i,
    /[/\\]scripts?[/\\]/i,
    /[/\\]models?[/\\]/i,
    /[/\\]validators?[/\\]/i,
    /\.model\.js$/i,
    /\.validator\.js$/i,
    /\.dto\.js$/i,
    /\.routes\.js$/i,
    /\.route\.js$/i,
    /\.projection\.js$/i,
    /\.controller\.js$/i,
    /[/\\]controllers?[/\\]/i,
    /[/\\]routes?[/\\]/i,
    /writeContract\.js$/i,
];

/**
 * Determine if a file is subject to this rule.
 */
function isEnforcedFile(filename) {
    // Normalize backslashes to forward slashes
    const normalized = filename.replace(/\\/g, "/");

    // Must match at least one financial pattern
    const isFinancial = FINANCIAL_PATTERNS.some((p) => p.test(normalized));
    if (!isFinancial) return false;

    // Must NOT match any exempt pattern
    const isExempt = EXEMPT_PATTERNS.some((p) => p.test(normalized));
    if (isExempt) return false;

    return true;
}

/**
 * Recursively check if a node tree contains a DB write call.
 */
function containsWriteCall(node) {
    if (!node || typeof node !== "object") return false;

    if (
        node.type === "CallExpression" &&
        node.callee &&
        node.callee.type === "MemberExpression" &&
        node.callee.property &&
        node.callee.property.type === "Identifier" &&
        WRITE_METHODS.has(node.callee.property.name)
    ) {
        return true;
    }

    for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const child = node[key];
        if (Array.isArray(child)) {
            for (const item of child) {
                if (item && typeof item === "object" && item.type) {
                    if (containsWriteCall(item)) return true;
                }
            }
        } else if (child && typeof child === "object" && child.type) {
            if (containsWriteCall(child)) return true;
        }
    }
    return false;
}

/**
 * Recursively check if a node tree references idempotency
 * (via Identifier named idempotencyKey/idempotency, or string literals).
 */
function containsIdempotencyRef(node) {
    if (!node || typeof node !== "object") return false;

    // Check Identifier nodes
    if (
        node.type === "Identifier" &&
        (node.name === "idempotencyKey" || node.name === "idempotency")
    ) {
        return true;
    }

    // Check string literals containing "idempotency" (case-insensitive)
    if (
        node.type === "Literal" &&
        typeof node.value === "string" &&
        /idempotency/i.test(node.value)
    ) {
        return true;
    }

    // Check template literals
    if (node.type === "TemplateLiteral" && node.quasis) {
        for (const quasi of node.quasis) {
            if (quasi.value && /idempotency/i.test(quasi.value.raw)) {
                return true;
            }
        }
    }

    for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const child = node[key];
        if (Array.isArray(child)) {
            for (const item of child) {
                if (item && typeof item === "object" && item.type) {
                    if (containsIdempotencyRef(item)) return true;
                }
            }
        } else if (child && typeof child === "object" && child.type) {
            if (containsIdempotencyRef(child)) return true;
        }
    }
    return false;
}

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description:
                "Financial write operations must include idempotency protection. " +
                "Rule 5 of Write Contract Enforcement System v2.0.",
            category: "Architecture",
        },
        messages: {
            missingIdempotency:
                "[WriteContract R5] Financial write operation without idempotency protection. " +
                "Add an idempotencyKey parameter and use ensureIdempotent() or " +
                "IdempotencyService.process() to prevent double-processing.",
        },
        schema: [],
    },

    create(context) {
        const filename = context.getFilename?.() || context.filename || "";
        if (!isEnforcedFile(filename)) return {};

        function check(node) {
            const body = node.body;
            if (!body) return;

            // Check if function body contains any DB write calls
            if (!containsWriteCall(body)) return;

            // Check if function body references idempotency
            if (containsIdempotencyRef(body)) return;

            // Writes found but no idempotency reference — report
            context.report({
                node,
                messageId: "missingIdempotency",
            });
        }

        return {
            FunctionDeclaration: check,
            FunctionExpression: check,
            ArrowFunctionExpression: check,
        };
    },
};
