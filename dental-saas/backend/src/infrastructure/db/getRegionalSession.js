/**
 * getRegionalSession.js
 * DDD Migration — Phase 1
 *
 * Creates MongoDB sessions from regional connections instead of the
 * global mongoose instance. This eliminates cross-connection transaction
 * hazards in the multi-region architecture.
 *
 * CRITICAL: Also returns regional models (compiled on the same connection)
 * to prevent "ClientSession must be from the same MongoClient" errors.
 *
 * Usage:
 *   const { session, models } = await getRegionalSession(regionCode);
 *   const patient = new models.Patient(data);
 *   await patient.save({ session });
 *   await session.endSession();
 *
 * Or with convenience wrapper:
 *   await withRegionalTransaction(regionCode, async (session, models) => {
 *       const p = new models.Patient(data);
 *       await p.save({ session });
 *   });
 *
 * INVARIANT: All domain transactions MUST use this utility.
 *            Direct use of mongoose.startSession() is PROHIBITED.
 */

"use strict";

const { getRegionContext } = require("../regionRouter");
const { getRegionalModels } = require("./regionalModelRegistry");

/**
 * getRegionalSession
 *
 * @param {string} regionCode  Region code (MEA, EU, US, APAC)
 * @returns {Promise<{ session: import("mongoose").ClientSession, models: object }>}
 */
async function getRegionalSession(regionCode) {
    if (!regionCode) {
        throw new Error(
            "[getRegionalSession] regionCode is required. " +
            "All domain transactions must target a specific region."
        );
    }

    const { mongooseConnection } = await getRegionContext(regionCode);
    const session = await mongooseConnection.startSession();
    const models = await getRegionalModels(regionCode);

    return { session, models };
}

/**
 * withRegionalTransaction
 *
 * Convenience wrapper that creates a regional session, executes the handler
 * inside a transaction, and ensures the session is always ended.
 *
 * @param {string} regionCode
 * @param {function(import("mongoose").ClientSession, object): Promise<*>} handler
 *        handler receives (session, models)
 * @param {object} [txnOpts]  Transaction options
 * @returns {Promise<*>}  Return value of the handler
 */
async function withRegionalTransaction(regionCode, handler, txnOpts = {}) {
    const { session, models } = await getRegionalSession(regionCode);
    try {
        const defaultOpts = {
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority" }
        };
        const mergedOpts = { ...defaultOpts, ...txnOpts };

        let result;
        await session.withTransaction(async () => {
            result = await handler(session, models);
        }, mergedOpts);

        return result;
    } finally {
        await session.endSession();
    }
}

module.exports = {
    getRegionalSession,
    withRegionalTransaction
};
