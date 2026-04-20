/**
 * journalRetry.worker.js — Journal Retry Background Processor
 * Billing Domain — Ledger Hardening
 *
 * Polls the JournalRetry collection for pending jobs and retries
 * the journal write using the stored payload.
 *
 * ARCHITECTURE:
 * - Runs as a periodic task (setInterval or cron-triggered)
 * - Processes one job at a time to avoid thundering herd
 * - Uses MongoDB findOneAndUpdate for atomic claim (prevents double-processing)
 * - Exponential backoff: 1m → 5m → 15m → 1h → 2h → 4h → 8h → 12h → 24h → 24h
 *
 * INVARIANTS:
 * 1. Each job is claimed atomically before processing
 * 2. Successful retry creates journal entry with idempotency check
 * 3. Exhausted jobs (attempts >= maxAttempts) move to "dead" status
 * 4. Worker is safe to run on multiple instances (atomic claim)
 *
 * PLANE: Org only.
 * Phase 3.2 — Connection-aware model resolution via getModel.
 *
 * @per-org-transactional — Internal worker. Runs as system process.
 */

"use strict";

const JournalRetryDef = require("./JournalRetry.model");
const PatientInvoiceDef = require("../organizationFinance/models/PatientInvoice.model");
const PatientPaymentDef = require("../organizationFinance/models/PatientPayment.model");
const RefundDef = require("../refunds/Refund.model");
const journalService = require("../services/journal.service");
const { getNextRetryAt } = require("./journalRetry.service");
const { resolveOrgConnection, resolveModelForOrg } = require("@core/db/connectionResolver");

const logger = require("@utils/logger");

// ─── Worker Configuration ───────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30 * 1000; // 30 seconds
const BATCH_SIZE = 5;               // Process up to 5 jobs per poll cycle

let workerTimer = null;
let isProcessing = false;

// ─── Core Processing ────────────────────────────────────────────────────────

/**
 * Claim and process a single retry job atomically.
 * Uses findOneAndUpdate to prevent double-processing in multi-instance deployments.
 *
 * NOTE: The JournalRetry queue itself uses the default (shared) connection
 * because it's a cross-org infrastructure concern. The actual journal write
 * resolves the org-specific connection from the job's organizationId.
 *
 * @returns {boolean} — true if a job was processed, false if queue is empty
 */
async function processOne() {
    // Use default model for polling — JournalRetry is infrastructure-level
    const JournalRetry = JournalRetryDef.default;

    // Atomic claim: find oldest ready job and set status=retrying
    const job = await JournalRetry.findOneAndUpdate(
        {
            status: { $in: ["pending", "failed"] },
            nextRetryAt: { $lte: new Date() },
        },
        {
            $set: {
                status: "retrying",
                lastAttemptAt: new Date(),
            },
            $inc: { attempts: 1 },
        },
        {
            sort: { priority: -1, nextRetryAt: 1 },
            new: true,
        }
    );

    if (!job) return false; // No jobs ready

    logger.info(
        {
            retryId: job._id,
            referenceType: job.referenceType,
            referenceId: job.referenceId,
            attempt: job.attempts,
            maxAttempts: job.maxAttempts,
            organizationId: job.organizationId,
        },
        "[JournalRetryWorker] Processing retry job"
    );

    try {
        // Reconstruct and execute journal write
        await executeJournalWrite(job);

        // SUCCESS: Mark as completed
        await JournalRetry.updateOne(
            { _id: job._id },
            {
                $set: {
                    status: "completed",
                    completedAt: new Date(),
                    lastError: null,
                },
            }
        );

        logger.info(
            { retryId: job._id, referenceType: job.referenceType, attempt: job.attempts },
            "[JournalRetryWorker] ✅ Journal entry created successfully on retry"
        );

        return true;
    } catch (err) {
        // FAILURE: Check if exhausted
        if (job.attempts >= job.maxAttempts) {
            await JournalRetry.updateOne(
                { _id: job._id },
                {
                    $set: {
                        status: "dead",
                        lastError: err.message,
                    },
                }
            );

            logger.error(
                {
                    retryId: job._id,
                    referenceType: job.referenceType,
                    referenceId: job.referenceId,
                    attempts: job.attempts,
                    err: err.message,
                },
                "[JournalRetryWorker] 💀 DEAD — All retry attempts exhausted. Manual intervention required."
            );
        } else {
            // Schedule next retry with exponential backoff
            const nextRetry = getNextRetryAt(job.attempts);

            await JournalRetry.updateOne(
                { _id: job._id },
                {
                    $set: {
                        status: "failed",
                        lastError: err.message,
                        nextRetryAt: nextRetry,
                    },
                }
            );

            logger.warn(
                {
                    retryId: job._id,
                    attempt: job.attempts,
                    nextRetryAt: nextRetry,
                    err: err.message,
                },
                "[JournalRetryWorker] ⚠ Retry failed — scheduling next attempt"
            );
        }

        return true; // We did process a job (even if it failed)
    }
}

// ─── Journal Write Execution ────────────────────────────────────────────────

/**
 * Execute the journal write using the stored payload.
 * Creates its own MongoDB session on the ORG connection since
 * the original transaction is long gone.
 *
 * Phase 3.2: Resolves the org-specific connection from the job's
 * organizationId to ensure the journal entry lands in the correct database.
 *
 * @param {Object} job — JournalRetry document
 */
async function executeJournalWrite(job) {
    const { referenceType, payload, organizationId } = job;

    // Resolve the correct connection for this organization
    // Phase 3.4: resolveOrgConnection is now async (dedup + throttled)
    const connection = await resolveOrgConnection(organizationId);
    if (!connection) {
        throw new Error(`[JournalRetryWorker] resolveOrgConnection returned null for org ${organizationId} — cannot execute journal write`);
    }
    const session = await connection.startSession();
    session.startTransaction();

    try {
        switch (referenceType) {
            case "invoice": {
                const PatientInvoice = await resolveModelForOrg(organizationId, PatientInvoiceDef);
                // @per-org-transactional — connection-bound model via resolveModelForOrg, background worker context
                const invoice = await PatientInvoice.findById(payload.invoiceId).session(session).lean();
                if (!invoice) throw new Error(`Invoice ${payload.invoiceId} not found`);
                await journalService.recordInvoiceEntry(invoice, session, connection);
                break;
            }

            case "payment": {
                const PatientPayment = await resolveModelForOrg(organizationId, PatientPaymentDef);
                // @per-org-transactional — connection-bound model via resolveModelForOrg, background worker context
                const payment = await PatientPayment.findById(payload.paymentId).session(session).lean();
                if (!payment) throw new Error(`Payment ${payload.paymentId} not found`);
                await journalService.recordPaymentEntry(payment, session, connection);
                break;
            }

            case "void": {
                const PatientInvoice = await resolveModelForOrg(organizationId, PatientInvoiceDef);
                // @per-org-transactional — connection-bound model via resolveModelForOrg, background worker context
                const invoice = await PatientInvoice.findById(payload.invoiceId).session(session).lean();
                if (!invoice) throw new Error(`Invoice ${payload.invoiceId} not found for void`);
                await journalService.recordVoidEntry(invoice, payload.voidedByUserId, session, connection);
                break;
            }

            case "refund": {
                const Refund = await resolveModelForOrg(organizationId, RefundDef);
                // @per-org-transactional — connection-bound model via resolveModelForOrg, background worker context
                const refund = await Refund.findById(payload.refundId).session(session).lean();
                if (!refund) throw new Error(`Refund ${payload.refundId} not found`);
                await journalService.recordRefundEntry(refund, session, connection);
                break;
            }

            default:
                throw new Error(`Unknown referenceType: ${referenceType}`);
        }

        await session.commitTransaction();
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

// ─── Poll Cycle ─────────────────────────────────────────────────────────────

/**
 * Single poll cycle: process up to BATCH_SIZE jobs.
 */
async function pollCycle() {
    if (isProcessing) return; // Prevent overlapping cycles
    isProcessing = true;

    try {
        let processed = 0;
        for (let i = 0; i < BATCH_SIZE; i++) {
            const didWork = await processOne();
            if (!didWork) break;
            processed++;
        }

        if (processed > 0) {
            logger.info({ processed }, "[JournalRetryWorker] Poll cycle completed");
        }
    } catch (err) {
        logger.error({ err }, "[JournalRetryWorker] Poll cycle error");
    } finally {
        isProcessing = false;
    }
}

// ─── Worker Lifecycle ───────────────────────────────────────────────────────

/**
 * Start the retry worker polling loop.
 */
function start() {
    if (workerTimer) return; // Already running

    logger.info(
        { intervalMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE },
        "[JournalRetryWorker] Starting journal retry worker"
    );

    // Run immediately on start, then poll
    pollCycle();
    // ALLOWED_POLLING: OUTBOX
    workerTimer = setInterval(pollCycle, POLL_INTERVAL_MS);
}

/**
 * Stop the retry worker.
 */
function stop() {
    if (workerTimer) {
        clearInterval(workerTimer);
        workerTimer = null;
        logger.info("[JournalRetryWorker] Stopped");
    }
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    start,
    stop,
    pollCycle,
    processOne,
    // Exposed for testing
    _executeJournalWrite: executeJournalWrite,
};

