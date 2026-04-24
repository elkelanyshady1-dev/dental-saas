/**
 * idempotency.js
 * Write Contract Enforcement Engine v2.0 — Request-Level Idempotency
 *
 * Provides atomic check-or-create idempotency enforcement for financial
 * operations (payments, refunds, contract activations). This prevents
 * double-processing of the same request even under concurrent retries.
 *
 * DIFFERENT from idempotency.service.js:
 *   - idempotency.service.js → event-level (subscriber dedup via EventProcessingLedger)
 *   - idempotency.js → request-level (API call dedup via IdempotencyRecord model)
 *
 * Usage:
 *   const { ensureIdempotent } = require("@core/idempotency");
 *
 *   async function processPayment(req, payload) {
 *       const existing = await ensureIdempotent(
 *           IdempotencyRecord, payload.idempotencyKey, session
 *       );
 *       if (existing) return existing; // Already processed — return cached result
 *       // ... proceed with payment ...
 *   }
 *
 * PLANE: Core Infrastructure
 */

"use strict";

/**
 * ensureIdempotent
 * Checks if an operation with the given idempotency key has already been processed.
 * Uses findOne with session for transactional consistency.
 *
 * @param {import('mongoose').Model} Model — The model storing idempotency records
 * @param {string} key — The idempotency key (UUID, request ID, etc.)
 * @param {import('mongoose').ClientSession} session — Active transaction session
 * @returns {Promise<Object|null>} — The existing record if found, null otherwise
 */
async function ensureIdempotent(Model, key, session) {
    if (!key) return null;

    const existing = await Model.findOne({ idempotencyKey: key }).session(session).lean();

    if (existing) {
        return existing;
    }

    return null;
}

module.exports = { ensureIdempotent };
