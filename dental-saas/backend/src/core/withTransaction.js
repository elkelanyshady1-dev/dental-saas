/**
 * withTransaction.js
 * Write Contract Enforcement Engine v2.0 — Auto Transaction Wrapper
 *
 * Provides a safe, standard pattern for wrapping multi-write operations
 * in a MongoDB transaction using the per-org connection from req.dbConnection.
 *
 * Usage:
 *   const withTransaction = require("@core/withTransaction");
 *
 *   // In a service:
 *   async function transferStock(req, payload) {
 *       return withTransaction(req, async ({ session }) => {
 *           await SourceModel.updateOne(..., { session });
 *           await DestModel.updateOne(..., { session });
 *           return { success: true };
 *       });
 *   }
 *
 * Benefits:
 *   - Session is always created from req.dbConnection (per-org isolation)
 *   - Transaction auto-retries on transient errors (MongoDB driver handles this)
 *   - Session is always ended in finally block (no leaks)
 *   - Consistent error handling across all services
 *
 * PLANE: Core Infrastructure (used by all planes)
 */

"use strict";

const logger = require("@utils/logger");

/**
 * withTransaction
 * Executes a handler inside a MongoDB transaction.
 *
 * @param {Object} req — Express request (must have dbConnection)
 * @param {Function} handler — async function({ session, req }) => result
 * @returns {Promise<*>} — Whatever the handler returns
 * @throws {Error} — If req.dbConnection is missing or handler throws
 */
async function withTransaction(req, handler) {
    if (!req || !req.dbConnection) {
        throw new Error(
            "[withTransaction] req.dbConnection is required. " +
            "Ensure dbContext middleware has run before calling this function."
        );
    }

    const session = await req.dbConnection.startSession();

    try {
        const result = await session.withTransaction(async () => {
            return await handler({ session, req });
        });

        return result;
    } catch (err) {
        logger.error(
            {
                err: err.message,
                source: "withTransaction",
            },
            "[withTransaction] Transaction failed"
        );
        throw err;
    } finally {
        await session.endSession();
    }
}

module.exports = withTransaction;
