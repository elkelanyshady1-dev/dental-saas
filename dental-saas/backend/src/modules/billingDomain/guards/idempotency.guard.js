/**
 * idempotency.guard.js — Journal Entry Idempotency Protection
 * Billing Domain — Ledger Hardening
 *
 * Prevents duplicate journal entries for the same financial event.
 * Each financial event (invoice, payment, void, refund) should create
 * EXACTLY ONE journal entry.
 *
 * USAGE:
 * Call checkAndPrevent() before creating a journal entry.
 * If a journal entry already exists for the given reference, returns it
 * instead of creating a duplicate.
 *
 * INVARIANTS:
 * 1. referenceType + referenceId = unique journal entry
 * 2. Returns existing entry if found (idempotent)
 * 3. Returns null if no existing entry (proceed with creation)
 *
 * PLANE: Org only.
 * Phase 3.2 — Connection-aware model resolution via getModel.
 *
 * @per-org-transactional — Internal guard used by journal.service.
 */

"use strict";

const JournalEntryDef = require("../models/JournalEntry.model");
const getModel = require("@core/db/getModel");
const logger = require("@utils/logger");

// ─── Strict Per-Org Model Resolver (Phase 3.3) ──────────────────────────────
function _getJournalEntry(connection) {
    if (!connection) throw new Error("[IdempotencyGuard] connection is REQUIRED — per-org mode does not allow fallback");
    return getModel(connection, JournalEntryDef);
}

/**
 * Generate a deterministic idempotency key from reference.
 * @param {string} referenceType
 * @param {string} referenceId
 * @returns {string}
 */
function generateKey(referenceType, referenceId) {
    return `${referenceType}:${referenceId}`;
}

/**
 * Check if a journal entry already exists for the given reference.
 * If yes, returns the existing entry (idempotent behavior).
 * If no, returns null (caller should proceed with creation).
 *
 * @param {string} referenceType — "invoice" | "payment" | "void" | "refund"
 * @param {string|ObjectId} referenceId
 * @param {import("mongoose").ClientSession} [session] — optional session for transactional reads
 * @param {mongoose.Connection} [connection] — optional org DB connection (Phase 3.2)
 * @returns {Promise<Object|null>} — existing JournalEntry or null
 */
async function checkAndPrevent(referenceType, referenceId, session, connection) {
    const JournalEntry = _getJournalEntry(connection);
    // @per-org-transactional — idempotency guard — cross-org deduplication check
    const query = JournalEntry.findOne({ referenceType, referenceId });

    if (session) {
        query.session(session);
    }

    const existing = await query.lean();

    if (existing) {
        logger.info(
            {
                journalEntryId: existing._id,
                referenceType,
                referenceId: referenceId.toString(),
                key: generateKey(referenceType, referenceId),
            },
            "[IdempotencyGuard] Journal entry already exists — returning existing (no duplicate created)"
        );
        return existing;
    }

    return null;
}

/**
 * Verify that exactly one journal entry exists for a reference.
 * Used by the integrity checker to detect duplicates.
 *
 * @param {string} referenceType
 * @param {string|ObjectId} referenceId
 * @param {mongoose.Connection} [connection] — optional org DB connection (Phase 3.2)
 * @returns {Promise<{exists: boolean, count: number, isDuplicate: boolean}>}
 */
async function verifyUniqueness(referenceType, referenceId, connection) {
    const JournalEntry = _getJournalEntry(connection);
    // @per-org-transactional — idempotency guard — cross-org deduplication check
    const count = await JournalEntry.countDocuments({ referenceType, referenceId });
    return {
        exists: count > 0,
        count,
        isDuplicate: count > 1,
    };
}

module.exports = {
    generateKey,
    checkAndPrevent,
    verifyUniqueness,
};
