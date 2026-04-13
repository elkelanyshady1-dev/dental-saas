/**
 * idempotency.service.js
 * 
 * Global Event Idempotency Enforcer (v4.0)
 * Ensures that domain events are processed exactly once per subscriber.
 *
 * v4.0 — DDD Migration:
 *   - Accepts optional `regionCode` parameter.
 *   - When regionCode is provided, creates sessions on the regional connection
 *     via getRegionalSession() instead of the global mongoose connection.
 *   - Backward compatible: callers without regionCode still use global connection.
 */

const mongoose = require("mongoose");
const EventProcessingLedger = require("./eventProcessingLedger.model");

class IdempotencyService {
    /**
     * process()
     * Wraps a subscriber handler in an idempotency lock.
     * 
     * @param {Object} params
     * @param {string} params.organizationId - Target tenant
     * @param {string} params.subscriber - Name of the executing subscriber
     * @param {string} params.eventId - Unique ID of the event
     * @param {string} [params.regionCode] - Optional region for regional session
     * @param {import('mongoose').Connection} [params.dbConnection] - Optional per-org DB connection
     * @param {Function} params.handler - Async function(session) containing the mutation logic
     */
    async process({ organizationId, subscriber, eventId, regionCode, dbConnection, handler }) {
        if (!organizationId || !subscriber || !eventId) {
            console.error(`[IdempotencyService] Missing required parameters for event lock: ${subscriber}`);
            throw new Error("Missing idempotency parameters");
        }

        // v5.0 — Connection priority: dbConnection → regionCode → global mongoose (platform fallback)
        let session;
        if (dbConnection) {
            session = await dbConnection.startSession();
        } else if (regionCode) {
            const { getRegionalSession } = require("../infrastructure/db/getRegionalSession");
            session = await getRegionalSession(regionCode);
        } else {
            session = await mongoose.startSession();
        }
        session.startTransaction();

        try {
            // 1. Atomic Lock Acquisition
            const lock = await EventProcessingLedger.findOneAndUpdate(
                { organizationId, subscriber, eventId },
                {
                    $setOnInsert: {
                        organizationId,
                        subscriber,
                        eventId,
                        processedAt: new Date()
                    }
                },
                { upsert: true, returnDocument: 'before', session }
            );

            // If a document was returned, it already existed before our attempt.
            if (lock) {
                console.log(`[IdempotencyService] Duplicate execution prevented for ${subscriber} (Event: ${eventId})`);
                await session.abortTransaction();
                return { skipped: true, reason: "ALREADY_PROCESSED" };
            }

            // 2. Execute Domain Handler
            await handler(session);

            // 3. Commit Atomically
            await session.commitTransaction();
            return { skipped: false, success: true };

        } catch (error) {
            await session.abortTransaction();

            if (error.code === 11000 || error.code === 112) {
                console.log(`[IdempotencyService] Concurrent write conflict prevented for ${subscriber} (Event: ${eventId})`);
                return { skipped: true, reason: "CONCURRENT_DUPLICATE" };
            }

            console.error(`[IdempotencyService] Handler failed for ${subscriber} (Event: ${eventId}):`, error.message);
            throw error;
        } finally {
            session.endSession();
        }
    }
}

module.exports = new IdempotencyService();

