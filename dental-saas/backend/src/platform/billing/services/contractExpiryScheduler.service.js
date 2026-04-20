/**
 * contractExpiryScheduler.service.js
 * Platform Billing — Contract Expiry + Auto-Renewal Scheduler
 *
 * PURPOSE:
 *   Runs every hour (configurable) to deterministically enforce contract lifecycle
 *   correctness at the DB level. Runtime invariant (enforceContractInvariant) provides
 *   per-read safety, but this cron is the authoritative DB correction layer.
 *
 * WHAT IT DOES:
 *   1. EXPIRE: contracts where autoRenew=false AND effectiveTo < now → "expired"
 *   2. RENEW:  contracts where autoRenew=true AND effectiveTo < now  → extend 30 days
 *
 * WHAT IT DOES NOT DO:
 *   - Does NOT generate invoices (InvoiceEngine handles that)
 *   - Does NOT update entitlements (contractActivation.service handles that)
 *   - Does NOT write to the ledger (pure contract status correction)
 *
 * INTEGRATION (in app startup — matches contractActivationScheduler pattern):
 *   const { startContractExpiryScheduler } = require('./services/contractExpiryScheduler.service');
 *   startContractExpiryScheduler({ intervalMs: 60 * 60 * 1000 });
 *
 * PLANE: Platform Billing — NO org-plane imports.
 */

"use strict";

const logger = require("@utils/logger");
const { getPlatformConnection } = require("@core/db/dbResolver");

// Lazy model access — avoids circular dependency issues at startup
function getOrgContract() {
    const conn = getPlatformConnection();
    return conn?.models?.["OrgContract"] || null;
}

// ─── In-memory overlap guard ───────────────────────────────────────────────────
let _isRunning = false;

// ─── Per-session violation log (suppress repeat CRITICAL logs within a window) ─
let _lastViolationCount = 0;

// ─── Core processor ──────────────────────────────────────────────────────────

/**
 * processContractExpiry
 *
 * Main work unit — called once per scheduler tick.
 * Idempotent: safe to call multiple times or concurrently (guarded by _isRunning).
 *
 * @returns {Promise<{ expired: number, renewed: number, skipped: number }>}
 */
async function processContractExpiry() {
    if (_isRunning) {
        logger.warn("[ContractExpiryScheduler] Previous run still in progress — skipping this cycle");
        return { expired: 0, renewed: 0, skipped: 1 };
    }

    _isRunning = true;
    const OrgContract = getOrgContract();

    if (!OrgContract) {
        logger.warn("[ContractExpiryScheduler] OrgContract model not yet loaded — deferring");
        _isRunning = false;
        return { expired: 0, renewed: 0, skipped: 1 };
    }

    const now = new Date();
    let expired = 0, renewedCount = 0;

    try {
        // ── 1. EXPIRE: autoRenew=false, effectiveTo past ──────────────────────────
        // These are definitively over — no renewal, just terminal state correction.
        const expireResult = await OrgContract.updateMany(
            {
                autoRenew: false,
                contractStatus: "active",
                effectiveTo: { $lt: now },
            },
            {
                $set: { contractStatus: "expired", updatedAt: now },
            }
        );
        expired = expireResult.modifiedCount;

        if (expired > 0) {
            logger.warn(
                { expired, runAt: now.toISOString() },
                "[ContractExpiryScheduler] STUCK_EXPIRED_CONTRACTS corrected in DB"
            );
        }

        // ── 2. RENEW: autoRenew=true, effectiveTo past ────────────────────────────
        // These missed their renewal — extend by 30 days as a recovery measure.
        // NOTE: For production billing, the InvoiceEngine should be triggered here.
        //       This is a safety extension — prevents involuntary service interruption.
        const renewalCandidates = await OrgContract.find(
            {
                autoRenew: true,
                contractStatus: "active",
                effectiveTo: { $lt: now },
            },
            { _id: 1, organizationId: 1, effectiveTo: 1 }
        ).lean();

        for (const contract of renewalCandidates) {
            try {
                const newEffectiveTo = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                await OrgContract.updateOne(
                    { _id: contract._id },
                    {
                        $set: {
                            effectiveFrom: now,
                            effectiveTo: newEffectiveTo,
                            updatedAt: now,
                        },
                    }
                );
                renewedCount++;
                logger.info(
                    {
                        contractId: contract._id,
                        organizationId: contract.organizationId,
                        previousEffectiveTo: contract.effectiveTo,
                        newEffectiveTo,
                    },
                    "[ContractExpiryScheduler] Auto-renewed contract"
                );
            } catch (renewErr) {
                logger.error(
                    { err: renewErr, contractId: contract._id },
                    "[ContractExpiryScheduler] Failed to renew single contract — continuing"
                );
            }
        }

        // ── Observability: guardian violation tracking ────────────────────────────
        const violationCount = expired;
        if (violationCount > 0 && violationCount !== _lastViolationCount) {
            _lastViolationCount = violationCount;
            logger.error(
                { violationCount, runAt: now.toISOString() },
                "[ContractExpiryScheduler] ⚠️  GUARDIAN: STUCK_EXPIRED_CONTRACTS violation detected — cron self-healed"
            );
        } else if (violationCount === 0 && _lastViolationCount > 0) {
            // Violation cleared
            _lastViolationCount = 0;
            logger.info(
                { runAt: now.toISOString() },
                "[ContractExpiryScheduler] ✅ GUARDIAN: STUCK_EXPIRED_CONTRACTS cleared — no violations"
            );
        }

        logger.info(
            { expired, renewed: renewedCount, runAt: now.toISOString() },
            "[ContractExpiryScheduler] Cycle complete"
        );

    } catch (err) {
        logger.error({ err }, "[ContractExpiryScheduler] Unhandled error in processContractExpiry");
    } finally {
        _isRunning = false;
    }

    return { expired, renewed: renewedCount, skipped: 0 };
}

// ─── Scheduler lifecycle ──────────────────────────────────────────────────────

let _schedulerHandle = null;

/**
 * startContractExpiryScheduler
 *
 * Starts a repeating interval that calls processContractExpiry().
 * Idempotent — safe to call multiple times (only one interval registered).
 * Matches contractActivationScheduler.service.js pattern.
 *
 * @param {object} [opts]
 * @param {number}  [opts.intervalMs=3600000]     Poll interval (default: 1 hour)
 * @param {boolean} [opts.runImmediately=false]   Run one cycle on start
 */
function startContractExpiryScheduler({ intervalMs = 60 * 60 * 1000, runImmediately = true } = {}) {
    if (_schedulerHandle) {
        logger.warn("[ContractExpiryScheduler] Already started — ignoring duplicate start call");
        return;
    }

    logger.info(
        { intervalMs, runImmediately },
        "[ContractExpiryScheduler] Starting — enforcing contract expiry lifecycle"
    );

    if (runImmediately) {
        processContractExpiry().catch(err =>
            logger.error({ err }, "[ContractExpiryScheduler] Initial run failed")
        );
    }

    // ALLOWED_POLLING: SCHEDULER
    _schedulerHandle = setInterval(() => {
        processContractExpiry().catch(err =>
            logger.error({ err }, "[ContractExpiryScheduler] Scheduled run failed")
        );
    }, intervalMs);

    // Prevent the interval from keeping the process alive in test environments
    if (_schedulerHandle.unref) _schedulerHandle.unref();
}

/**
 * stopContractExpiryScheduler
 * Clears the polling interval. Idempotent.
 */
function stopContractExpiryScheduler() {
    if (_schedulerHandle) {
        clearInterval(_schedulerHandle);
        _schedulerHandle = null;
        logger.info("[ContractExpiryScheduler] Stopped");
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    processContractExpiry,            // callable directly for one-off admin trigger
    startContractExpiryScheduler,
    stopContractExpiryScheduler,
    // Exposed for testing
    _getIsRunning: () => _isRunning,
};
