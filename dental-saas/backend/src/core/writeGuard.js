/**
 * writeGuard.js
 * Write Contract Enforcement Engine v2.0 — Runtime Guards
 *
 * Assertion functions that services call at write-time to enforce
 * contract rules that cannot be caught statically (ESLint).
 *
 * Usage:
 *   const { assertInTransaction, assertIdempotency } = require("@core/writeGuard");
 *
 *   async function processPayment(req, payload) {
 *       assertIdempotency(payload.idempotencyKey);
 *       const session = await req.dbConnection.startSession();
 *       await session.withTransaction(async () => {
 *           assertInTransaction(session);
 *           // ... writes ...
 *       });
 *   }
 *
 * PLANE: Core Infrastructure (used by all planes)
 */

"use strict";

const logger = require("@utils/logger");

/**
 * assertInTransaction
 * Throws if the session is null/undefined or not in a transaction.
 * Call this before any DB write that MUST be transactional.
 *
 * @param {import('mongoose').ClientSession} session
 * @throws {Error} WRITE_OUTSIDE_TRANSACTION
 */
function assertInTransaction(session) {
    if (!session || !session.inTransaction || !session.inTransaction()) {
        const err = new Error(
            "[WriteGuard] WRITE_OUTSIDE_TRANSACTION — this write requires an active transaction. " +
            "Use session.withTransaction() to wrap all writes."
        );
        err.code = "WRITE_OUTSIDE_TRANSACTION";
        logger.error({ event: "WRITE_OUTSIDE_TRANSACTION", source: "writeGuard" }, err.message);
        throw err;
    }
}

/**
 * assertNoGlobalSession
 * Throws if the session was created from the global mongoose connection
 * rather than from req.dbConnection. This prevents cross-tenant writes.
 *
 * Heuristic: checks that the session's client is NOT the default mongoose client.
 *
 * @param {import('mongoose').ClientSession} session
 * @param {import('mongoose').Connection} expectedConnection — req.dbConnection
 * @throws {Error} INVALID_SESSION_SOURCE
 */
function assertNoGlobalSession(session, expectedConnection) {
    if (!session || !expectedConnection) return;

    // If session's client differs from the expected connection's client,
    // it was created from a different connection (likely mongoose.startSession()).
    try {
        const sessionClient = session.client || (session._client);
        const expectedClient = expectedConnection.client || expectedConnection.getClient?.();
        if (sessionClient && expectedClient && sessionClient !== expectedClient) {
            const err = new Error(
                "[WriteGuard] INVALID_SESSION_SOURCE — session was created from the wrong connection. " +
                "Use req.dbConnection.startSession() for org-plane sessions."
            );
            err.code = "INVALID_SESSION_SOURCE";
            logger.error({ event: "INVALID_SESSION_SOURCE", source: "writeGuard" }, err.message);
            throw err;
        }
    } catch (e) {
        if (e.code === "INVALID_SESSION_SOURCE") throw e;
        // Swallow introspection errors — the static ESLint rule is the primary guard
    }
}

/**
 * assertIdempotency
 * Throws if no idempotency key is provided for a financial operation.
 *
 * @param {string} key — The idempotency key (UUID, request ID, etc.)
 * @throws {Error} MISSING_IDEMPOTENCY_KEY
 */
function assertIdempotency(key) {
    if (!key || typeof key !== "string" || key.trim().length === 0) {
        const err = new Error(
            "[WriteGuard] MISSING_IDEMPOTENCY_KEY — financial operations require an idempotency key. " +
            "Pass a unique key (UUID or request ID) to prevent double-processing."
        );
        err.code = "MISSING_IDEMPOTENCY_KEY";
        logger.error({ event: "MISSING_IDEMPOTENCY_KEY", source: "writeGuard" }, err.message);
        throw err;
    }
}

module.exports = {
    assertInTransaction,
    assertNoGlobalSession,
    assertIdempotency,
};
