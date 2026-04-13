/**
 * trialActivation.job.js
 * TDS — Hardened Trial Expiration + Pending Contract Activation
 *
 * Hardening:
 *   ✔ Distributed lock via cronLockService (MongoDB CronLock — multi-instance safe)
 *   ✔ Per-org MongoDB transaction (session passed to activateContract)
 *   ✔ Idempotency: re-checks trial + pending status inside transaction
 *   ✔ Suspension in transaction (no partial state possible)
 *   ✔ Per-org try/catch — one failure never blocks other orgs
 *   ✔ Indexed query: { contractStatus, trialDays, trialEndDate }
 *   ✔ Structured logs — no full document logging
 *   ✔ Duration tracking
 *
 * DB index required (declared in OrgContract.model.js):
 *   { contractStatus: 1, trialDays: 1, trialEndDate: 1 }
 *
 * Schedule: 00:10 UTC daily  (offset from contractRenewal.job at 00:05)
 * Lock key : "trial_activation_job"
 * Lock TTL : 5 minutes
 *
 * DO NOT call this job directly from server.js.
 * Register via: jobs/index.js → startAllJobs()
 *
 * PLANE: jobs
 */

"use strict";

const cron = require("node-cron");
const mongoose = require("mongoose");
const logger = require("../utils/logger");
const cronLock = require("../services/cronLockService");
const OrgContract = require("../platform/billing/models/OrgContract.model").default;
const Organization = require("../shared/models/Organization").default;
const PlatformInvoice = require("../platform/billing/models/PlatformInvoice.model").default;
const { activateContract, ContractActivationError } = require("../platform/billing/services/contractActivation.service");
// Sprint 8: BillingTimeline projection
const { emitBillingTimelineEvent } = require("../platform/billing/services/billingTimeline.service");

const JOB_NAME = "trial_activation_job";
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve the paid invoice for a pending_activation contract. */
async function resolveInvoice(pending, organizationId, session) {
    // First try the direct pointer on the contract
    if (pending.activatingInvoiceId) {
        return PlatformInvoice.findById(pending.activatingInvoiceId).session(session).lean();
    }
    // Fallback: most recent paid invoice linked to this contract
    return PlatformInvoice.findOne({
        organizationId,
        contractId: pending._id,
        status: "paid"
    })
        .sort({ createdAt: -1 })
        .session(session)
        .lean();
}

// ─── Per-Org Processing ───────────────────────────────────────────────────────

/**
 * processTrial
 *
 * Handles one expired trial.  Runs inside its own MongoDB transaction.
 * All reads are inside the transaction to prevent TOCTOU races.
 *
 * @returns {"activated"|"suspended"|"skipped"}
 */
async function processTrial(trialSummary) {
    const { _id: trialId, organizationId } = trialSummary;
    const now = new Date();

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // ── Idempotency Re-check ───────────────────────────────────────────────
        // Re-read inside transaction to prevent double-processing.
        const trial = await OrgContract.findOne({
            _id: trialId,
            contractStatus: "active",
            trialDays: { $gt: 0 },
            trialEndDate: { $lte: now }
        }).session(session);

        if (!trial) {
            // Already superseded or activated by another instance / previous run
            await session.abortTransaction();
            logger.info(
                { trialId, organizationId },
                "[TrialActivationJob] Trial already processed — skipping (idempotent)"
            );
            return "skipped";
        }

        // ── Look for queued paid contract ─────────────────────────────────────
        // Sprint 8: filter by previousContractId = trialId to match the exact
        // pending_activation contract scheduled at provisioning time.
        // Falls back to unfiltered query if no linked contract found (legacy orgs).
        let pending = await OrgContract.findOne({
            organizationId,
            previousContractId: trialId,                    // Sprint 8: exact chain link
            contractStatus: "pending_activation",
            effectiveFrom: { $lte: now }  // guard: effective date must have passed
        }).session(session);

        // Fallback: legacy pending contracts without previousContractId set
        if (!pending) {
            pending = await OrgContract.findOne({
                organizationId,
                previousContractId: { $in: [null, undefined] },
                contractStatus: "pending_activation",
                effectiveFrom: { $lte: now }
            }).session(session);
        }

        if (pending) {
            // ── Resolve Invoice ──────────────────────────────────────────────
            const invoice = await resolveInvoice(pending, organizationId, session);

            if (!invoice) {
                // No paid invoice found — cannot activate; suspend instead
                logger.error(
                    { pendingContractId: pending._id, organizationId },
                    "[TrialActivationJob] No paid invoice for pending contract — suspending org"
                );
                await suspendOrgInSession(organizationId, "trial_expired_no_invoice", session);
                await session.commitTransaction();
                return "suspended";
            }

            // ── Activate (passes external session — joins this transaction) ──
            await activateContract(pending._id, invoice._id, {
                activatedBy: null,  // system-triggered
                session,            // join the outer transaction
            });

            await session.commitTransaction();

            // Sprint 8: Emit billing timeline events — non-blocking, post-commit
            setImmediate(async () => {
                try {
                    await emitBillingTimelineEvent({
                        organizationId: String(organizationId),
                        contractId: String(trialId),
                        eventType: "TRIAL_ENDED",
                        source: "system",
                        payload: { outcome: "activated", pendingContractId: String(pending._id) }
                    });

                    await emitBillingTimelineEvent({
                        organizationId: String(organizationId),
                        contractId: String(pending._id),
                        eventType: "UPGRADE_APPLIED",
                        source: "system",
                        payload: {
                            fromContractId: String(trialId),
                            toContractId: String(pending._id),
                            planCode: pending.planCode,
                            planVersionTag: pending.planVersionTag
                        }
                    });

                    await emitBillingTimelineEvent({
                        organizationId: String(organizationId),
                        contractId: String(pending._id),
                        eventType: "CONTRACT_ACTIVATED",
                        source: "system",
                        payload: {
                            planCode: pending.planCode,
                            planVersionTag: pending.planVersionTag,
                            lockedPrice: pending.lockedPrice,
                            currency: pending.currency,
                            activatedBy: null
                        }
                    });
                } catch (evtErr) {
                    logger.warn(
                        { err: evtErr.message, organizationId },
                        "[TrialActivationJob] Post-commit timeline event failed (non-fatal)"
                    );
                }
            });

            logger.info(
                { organizationId, trialContractId: String(trialId), pendingContractId: String(pending._id) },
                "[TrialActivationJob] Pending contract activated — trial superseded"
            );
            return "activated";

        } else {
            // ── No paid contract — suspend org ───────────────────────────────
            await suspendOrgInSession(organizationId, "trial_expired_no_paid_plan", session);
            await session.commitTransaction();

            // Sprint 8: Emit TRIAL_ENDED — non-blocking, post-commit
            setImmediate(async () => {
                await emitBillingTimelineEvent({
                    organizationId: String(organizationId),
                    contractId: String(trialId),
                    eventType: "TRIAL_ENDED",
                    source: "system",
                    payload: { outcome: "suspended" }
                });
            });

            logger.warn(
                { organizationId, trialContractId: String(trialId) },
                "[TrialActivationJob] Trial expired — no pending plan — org suspended"
            );
            return "suspended";
        }

    } catch (err) {
        try { await session.abortTransaction(); } catch (_) { /* ignore secondary error */ }

        logger.error(
            { err: { message: err.message, code: err.code }, organizationId, trialId },
            "[TrialActivationJob] Error processing trial — transaction aborted"
        );
        throw err; // re-throw so caller increments errors counter

    } finally {
        session.endSession();
    }
}

/**
 * suspendOrgInSession
 *
 * Sets subscription.status = "suspended" inside an existing transaction session.
 * Does NOT modify the contract chain.
 */
async function suspendOrgInSession(organizationId, reason, session) {
    await Organization.findByIdAndUpdate(
        organizationId,
        {
            $set: {
                "subscription.status": "suspended",
                "subscription.suspendedAt": new Date(),
                "subscription.suspendReason": reason
            }
        },
        { session, new: false }
    );
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * processExpiredTrials
 *
 * Main job body. Called by cron and runNow().
 *
 * @returns {Promise<{ processed: number, activated: number, suspended: number, skipped: number, errors: number, durationMs: number }>}
 */
async function processExpiredTrials() {
    const startTime = Date.now();
    const stats = { processed: 0, activated: 0, suspended: 0, skipped: 0, errors: 0 };

    // ── Indexed scan — uses { contractStatus: 1, trialDays: 1, trialEndDate: 1 } ──
    const now = new Date();
    const expiredTrials = await OrgContract.find({
        contractStatus: "active",
        trialDays: { $gt: 0 },
        trialEndDate: { $lte: now }
    })
        .select("_id organizationId trialEndDate")   // minimal projection — no full doc
        .lean();

    if (expiredTrials.length === 0) {
        const durationMs = Date.now() - startTime;
        logger.info({ durationMs }, "[TrialActivationJob] No expired trials — nothing to do");
        return { ...stats, durationMs };
    }

    logger.info(
        { count: expiredTrials.length },
        "[TrialActivationJob] Expired trials found — processing"
    );

    // ── Per-org processing — isolated try/catch per org ──────────────────────
    for (const trial of expiredTrials) {
        stats.processed++;
        try {
            const outcome = await processTrial(trial);
            if (outcome === "activated") stats.activated++;
            else if (outcome === "suspended") stats.suspended++;
            else stats.skipped++;
        } catch (err) {
            stats.errors++;
            // Already logged inside processTrial. Continue to next org.
        }
    }

    stats.durationMs = Date.now() - startTime;
    logger.info(stats, "[TrialActivationJob] Run complete");
    return stats;
}

// ─── Lock-Guarded Wrapper ─────────────────────────────────────────────────────

/**
 * runWithLock
 *
 * Wraps processExpiredTrials with a distributed CronLock.
 * If another instance holds the lock → skip silently.
 * Lock is always released in finally, even on crash.
 */
async function runWithLock() {
    const acquired = await cronLock.acquireLock(JOB_NAME, LOCK_TTL_MS);

    if (!acquired) {
        logger.info(
            { job: JOB_NAME },
            "[TrialActivationJob] Lock held by another instance — skipping this run"
        );
        return null;
    }

    try {
        return await processExpiredTrials();
    } finally {
        await cronLock.releaseLock(JOB_NAME);
    }
}

// ─── Job Registration ─────────────────────────────────────────────────────────

let _job = null;

/**
 * start
 *
 * Registers the cron job. Called by jobs/index.js → startAllJobs().
 * Default schedule: 00:10 UTC daily (offset from contractRenewal at 00:05).
 */
function start(schedule = "10 0 * * *") {
    if (_job) {
        _job.stop();
        logger.info("[TrialActivationJob] Existing job stopped before restart");
    }

    _job = cron.schedule(schedule, async () => {
        logger.info(
            { job: JOB_NAME, at: new Date().toISOString() },
            "[TrialActivationJob] Starting scheduled run"
        );
        try {
            const stats = await runWithLock();
            if (stats) logger.info({ stats }, "[TrialActivationJob] Scheduled run complete");
        } catch (err) {
            logger.error({ err: { message: err.message } }, "[TrialActivationJob] Unhandled job error");
        }
    }, { scheduled: true, timezone: process.env.CRON_TIMEZONE || "UTC" });

    logger.info({ schedule }, "[TrialActivationJob] Registered");
}

function stop() {
    if (_job) {
        _job.stop();
        _job = null;
        logger.info("[TrialActivationJob] Stopped");
    }
}

/**
 * runNow
 *
 * Manual trigger (admin endpoint / seed script / test).
 * Also lock-guarded to prevent overlap with running cron.
 */
async function runNow() {
    logger.info("[TrialActivationJob] Manual trigger");
    return runWithLock();
}

module.exports = { start, stop, runNow, processExpiredTrials };
