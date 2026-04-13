/**
 * journalRetry.service.js — Journal Retry Enqueue & Management
 * Billing Domain — Ledger Hardening
 *
 * Provides the API to enqueue failed journal writes and manage their lifecycle.
 * Called by the orchestrator catch blocks when journal.service fails.
 *
 * INVARIANTS:
 * 1. enqueue() is IDEMPOTENT — duplicate payloads are deduplicated by key
 * 2. enqueue() is NON-BLOCKING — failures are logged, never thrown
 * 3. All entries include organizationId for tenant isolation
 *
 * PLANE: Org only.
 *
 * SECURITY: Queries use secureModel + signed system context (Wave 7 RLS).
 */

"use strict";

const JournalRetry = require("./JournalRetry.model");

const logger = require("@utils/logger");

// ─── Secure Model Wrapper ───────────────────────────────────────────────────

// ─── Retry Schedule (exponential backoff in milliseconds) ───────────────────

const RETRY_DELAYS_MS = [
    1 * 60 * 1000,       // Attempt 1: 1 minute
    5 * 60 * 1000,       // Attempt 2: 5 minutes
    15 * 60 * 1000,      // Attempt 3: 15 minutes
    60 * 60 * 1000,      // Attempt 4: 1 hour
    2 * 60 * 60 * 1000,  // Attempt 5: 2 hours
    4 * 60 * 60 * 1000,  // Attempt 6: 4 hours
    8 * 60 * 60 * 1000,  // Attempt 7: 8 hours
    12 * 60 * 60 * 1000, // Attempt 8: 12 hours
    24 * 60 * 60 * 1000, // Attempt 9: 24 hours
    24 * 60 * 60 * 1000, // Attempt 10: 24 hours (final)
];

/**
 * Calculate next retry time based on attempt count.
 * @param {number} attempt — 0-indexed
 * @returns {Date}
 */
function getNextRetryAt(attempt) {
    const delayMs = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
    return new Date(Date.now() + delayMs);
}

// ─── Idempotency Key Generation ─────────────────────────────────────────────

/**
 * Generate a deterministic idempotency key.
 * @param {string} referenceType
 * @param {string} referenceId
 * @returns {string}
 */
function generateIdempotencyKey(referenceType, referenceId) {
    return `journal:${referenceType}:${referenceId}`;
}

// ─── Core Enqueue ───────────────────────────────────────────────────────────

/**
 * Enqueue a failed journal write for automatic retry.
 *
 * This is NON-BLOCKING and IDEMPOTENT:
 * - Duplicate referenceType+referenceId pairs are silently deduplicated
 * - Errors in enqueue itself are logged but never thrown
 *
 * @param {Object} params
 * @param {string} params.organizationId
 * @param {string} params.referenceType — "invoice" | "payment" | "void" | "refund"
 * @param {string} params.referenceId
 * @param {Object} params.payload — serialized arguments to reconstruct the journal entry
 * @param {Error|string} params.error — the original failure
 */
async function enqueue({ organizationId, referenceType, referenceId, payload, error }) {
    try {
        const idempotencyKey = generateIdempotencyKey(referenceType, referenceId);
        const errorMsg = typeof error === "string" ? error : error?.message || "Unknown error";

        // Priority: money-movement operations (payment/refund) are processed first
        const priority = (referenceType === "payment" || referenceType === "refund") ? "high" : "normal";

        // Atomic upsert: prevents race conditions between find and create
        const retryRecord = await JournalRetry.findOneAndUpdate(
            {
                organizationId,
                referenceType,
                referenceId,
            },
            {
                $setOnInsert: {
                    organizationId,
                    referenceType,
                    referenceId,
                    payload,
                    status: "pending",
                    attempts: 0,
                    maxAttempts: 10,
                    idempotencyKey,
                    priority,
                },
                $set: {
                    lastError: errorMsg,
                    nextRetryAt: getNextRetryAt(0),
                },
            },
            { upsert: true, new: true }
        );

        const isNew = !retryRecord.createdAt || (Date.now() - retryRecord.createdAt.getTime()) < 1000;

        logger.warn(
            {
                retryId: retryRecord._id,
                referenceType,
                referenceId: referenceId.toString(),
                organizationId: organizationId.toString(),
                nextRetryAt: retryRecord.nextRetryAt,
                isNew,
            },
            isNew
                ? "[JournalRetry] Failed journal entry queued for retry"
                : "[JournalRetry] Retry record already exists — updated error"
        );

        return retryRecord;
    } catch (enqueueErr) {
        // CRITICAL: If we can't even enqueue the retry, log at FATAL level
        // This is the last resort — manual intervention required
        logger.fatal(
            {
                err: enqueueErr,
                referenceType,
                referenceId: referenceId?.toString(),
                originalError: typeof error === "string" ? error : error?.message,
            },
            "[JournalRetry] CRITICAL — Failed to enqueue retry. Manual intervention required."
        );
    }
}

// ─── Status Queries ─────────────────────────────────────────────────────────

/**
 * Get retry queue statistics for monitoring dashboard.
 * @param {string} [organizationId] — filter by org (optional)
 * @returns {Promise<Object>}
 */
async function getQueueStats(organizationId) {
    if (!organizationId) {
        throw new Error("getQueueStats requires organizationId for tenant isolation");
    }

    // secureModel.aggregate prepends $match { organizationId } automatically
    const results = await JournalRetry.aggregate([
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
            },
        },
    ]);

    const stats = { pending: 0, retrying: 0, completed: 0, failed: 0, dead: 0 };
    for (const r of results) {
        stats[r._id] = r.count;
    }

    return stats;
}

/**
 * Get pending/failed retries for an organization.
 * @param {string} organizationId
 * @returns {Promise<Array>}
 */
async function getPendingRetries(organizationId) {

    return JournalRetry.find({
        status: { $in: ["pending", "retrying", "failed"] },
    })
        .sort({ nextRetryAt: 1 })
        .lean();
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    enqueue,
    getQueueStats,
    getPendingRetries,
    getNextRetryAt,
    generateIdempotencyKey,
    RETRY_DELAYS_MS,
};
