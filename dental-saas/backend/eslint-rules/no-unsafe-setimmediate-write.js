/**
 * no-unsafe-setimmediate-write.js — ESLint Rule
 *
 * RULE 3 — Write Contract Enforcement System
 *
 * ENFORCEMENT: setImmediate(async () => { DB_WRITE }) is FORBIDDEN unless the
 * write is classified as non-critical (logging, notifications, analytics).
 *
 * Pattern blocked:
 *   setImmediate(async () => { await Model.create(...) })     ❌
 *   setImmediate(async () => { await Model.updateOne(...) })  ❌
 *   (async () => { await Model.create(...) })()               ❌  (IIFE)
 *
 * Allowed state-affecting patterns:
 *   → Move inside session.withTransaction()                   ✅
 *   → Use transactional outbox (emitViaOutbox)                ✅
 *   → Use job queue (BullMQ) for retryable side effects       ✅
 *
 * Non-critical (allowed with comment annotation):
 *   setImmediate(() => logger.info(...))                      ✅
 *   setImmediate(() => eventBus.emit(...))                    ✅
 *   setImmediate(() => emitBillingTimelineEvent(...))         ✅
 *
 * To suppress for a KNOWN non-critical case, add:
 *   // eslint-disable-next-line ortho-enforce/no-unsafe-setimmediate-write
 *   setImmediate(async () => { await logBillingEvent(...) })
 *
 * RULE: Suppressions MUST include a justification comment explaining why it
 * is non-critical (logging, notification, analytics — never financial state).
 */

"use strict";

/**
 * DB write method names — if any of these appear inside a setImmediate
 * or IIFE async callback, it's a violation.
 */
const DB_WRITE_METHODS = new Set([
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
    "withTransaction",     // only flagged inside setImmediate
]);

/**
 * Known-safe non-critical method names — these are allowed inside setImmediate
 * because they do NOT affect primary domain state.
 */
const SAFE_METHODS = new Set([
    "emit",           // eventBus.emit (in-process only)
    "emitToOrg",      // socket notification
    "deleteDraft",    // draft cleanup (non-blocking, non-critical)
    "sendHeartbeat",  // lock heartbeat
    "info",           // logger.info
    "warn",           // logger.warn
    "error",          // logger.error
    "debug",          // logger.debug
]);

/**
 * Walks an AST node and returns true if it contains any call to a DB write method
 * that is NOT in the safe list.
 */
function containsUnsafeDbWrite(node) {
    if (!node) return false;

    // Direct call: Model.create(...), doc.save(), session.withTransaction(...)
    if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.property.type === "Identifier"
    ) {
        const method = node.callee.property.name;
        if (DB_WRITE_METHODS.has(method) && !SAFE_METHODS.has(method)) {
            return true;
        }
    }

    // Recurse through all child properties
    for (const key of Object.keys(node)) {
        if (key === "parent") continue;
        const child = node[key];
        if (Array.isArray(child)) {
            for (const item of child) {
                if (item && typeof item === "object" && item.type) {
                    if (containsUnsafeDbWrite(item)) return true;
                }
            }
        } else if (child && typeof child === "object" && child.type) {
            if (containsUnsafeDbWrite(child)) return true;
        }
    }

    return false;
}

/**
 * Returns true if the node is an async function (ArrowFunctionExpression or FunctionExpression)
 */
function isAsyncFn(node) {
    return (
        node &&
        (node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression") &&
        node.async === true
    );
}

module.exports = {
    meta: {
        type: "problem",
        docs: {
            description:
                "setImmediate(async () => DB_WRITE) and async IIFEs with DB writes are forbidden. " +
                "Rule 3 of Write Contract Enforcement System v1.0. " +
                "Move state-affecting writes into session.withTransaction() or use the outbox pattern.",
            category: "Architecture",
        },
        messages: {
            unsafeSetImmediate:
                "[WriteContract R3] setImmediate(async () => DB_WRITE) is forbidden. " +
                "State-affecting DB writes must be inside session.withTransaction() or use the outbox pattern. " +
                "Add eslint-disable comment ONLY for non-critical writes (logging/notifications/analytics) " +
                "with a justification comment explaining why.",
            unsafeAsyncIIFE:
                "[WriteContract R3] Async IIFE (async () => DB_WRITE)() with DB write is forbidden. " +
                "Use await directly or move write into session.withTransaction().",
        },
        schema: [],
    },

    create(context) {
        return {
            // Pattern: setImmediate(async () => { ... WRITE ... })
            CallExpression(node) {
                // setImmediate(...)
                if (
                    node.callee.type === "Identifier" &&
                    node.callee.name === "setImmediate" &&
                    node.arguments.length > 0
                ) {
                    const callback = node.arguments[0];
                    if (isAsyncFn(callback) && containsUnsafeDbWrite(callback.body)) {
                        context.report({ node, messageId: "unsafeSetImmediate" });
                    }
                }

                // Async IIFE: (async () => { ... })()
                if (
                    node.callee.type === "ArrowFunctionExpression" ||
                    node.callee.type === "FunctionExpression"
                ) {
                    if (isAsyncFn(node.callee) && containsUnsafeDbWrite(node.callee.body)) {
                        context.report({ node, messageId: "unsafeAsyncIIFE" });
                    }
                }
            },
        };
    },
};
