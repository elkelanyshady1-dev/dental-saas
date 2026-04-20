/**
 * runtime.guardian.js
 * Platform Guardian Layer — Periodic Runtime Integrity Checker
 *
 * startRuntimeGuardian(intervalMs)
 *
 * Runs DB-backed invariant checks on a periodic interval.
 * Detects corruption that could accumulate silently between requests.
 *
 * Checks performed:
 *   1. No org has more than 1 active contract simultaneously
 *   2. All active contracts have a non-null, non-negative lockedPrice
 *   3. No active contract has autoRenew=true AND effectiveTo in the past
 *      AND contractStatus still "active" (stuck expired contracts)
 *   4. Contract chain integrity: no superseded contract still has active successors missing
 *   5. No orphan drafts (draft contracts older than 30 days with no activation attempt)
 *
 * Behavior:
 *   - Permissive: logs CRITICAL on violation, continues
 *   - Strict:     logs CRITICAL, does NOT crash (runtime corruption is logged, not fatal
 *                 at runtime — startup is the only crash gate)
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const { getPlatformConnection } = require("@core/db/dbResolver");
const {
    guardianLogger,
    incrementMetric,
    setMetric
} = require("./observability.guardian");

// v21.0+v21.1+v22.0: Billing-specific invariant checks
const {
    checkInvoiceTotalMatch,
    checkPaymentNotGreaterThanInvoice,
    checkContractSingleActive,
    checkLedgerAppendOnly,
    checkPlanVersionValid,
    checkLedgerHashChainValid,
    checkRefundNotGreaterThanPayment   // v22.0
} = require("./billing.invariants");

// Lazy-load models to avoid registration-order issues at module load time
const getOrgContract = () => getPlatformConnection().models["OrgContract"];
const getOrganization = () => getPlatformConnection().models["Organization"];

// ─── Checks ───────────────────────────────────────────────────────────────────

/**
 * Check 1: No org has >1 active contract.
 * Uses MongoDB aggregation to find groups with count > 1.
 */
async function checkNoMultipleActiveContracts() {
    const OrgContract = getOrgContract();
    if (!OrgContract) return { pass: true, skipped: "model not loaded" };

    const duplicates = await OrgContract.aggregate([
        { $match: { contractStatus: "active" } },
        { $group: { _id: "$organizationId", count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }
    ]);

    if (duplicates.length > 0) {
        const orgIds = duplicates.map(d => d._id.toString());
        return {
            pass: false,
            violation: "MULTIPLE_ACTIVE_CONTRACTS",
            detail: `${duplicates.length} org(s) have >1 active contract: ${orgIds.join(", ")}`
        };
    }
    return { pass: true };
}

/**
 * Check 2: All active contracts have lockedPrice >= 0 and non-null.
 */
async function checkLockedPriceNotNull() {
    const OrgContract = getOrgContract();
    if (!OrgContract) return { pass: true, skipped: "model not loaded" };

    const corrupt = await OrgContract.countDocuments({
        contractStatus: "active",
        $or: [
            { lockedPrice: null },
            { lockedPrice: { $lt: 0 } },
            { lockedPrice: { $exists: false } }
        ]
    });

    if (corrupt > 0) {
        return {
            pass: false,
            violation: "NULL_OR_NEGATIVE_LOCKED_PRICE",
            detail: `${corrupt} active contract(s) have null/negative lockedPrice — revenue at risk`
        };
    }
    return { pass: true };
}

/**
 * Check 3: No active contract is "stuck expired" — autoRenew=false and effectiveTo < now.
 * These should have been moved to "expired" or "terminated" by the renewal cron.
 * If they accumulate, it means the renewal cron is not running.
 */
async function checkNoStuckExpiredContracts() {
    const OrgContract = getOrgContract();
    if (!OrgContract) return { pass: true, skipped: "model not loaded" };

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3 days grace

    const stuck = await OrgContract.countDocuments({
        contractStatus: "active",
        autoRenew: false,
        effectiveTo: { $lt: staleThreshold }
    });

    if (stuck > 0) {
        return {
            pass: false,
            violation: "STUCK_EXPIRED_CONTRACTS",
            detail: `${stuck} contract(s) are autoRenew=false with effectiveTo >3 days in past but still "active". Renewal cron may be stalled.`
        };
    }
    return { pass: true };
}

/**
 * Check 4: Contract chain integrity.
 * Every "superseded" contract must have a valid supersededById pointing to a real contract.
 */
async function checkContractChainIntegrity() {
    const OrgContract = getOrgContract();
    if (!OrgContract) return { pass: true, skipped: "model not loaded" };

    // Find superseded contracts where supersededById doesn't exist
    const superseded = await OrgContract.find(
        { contractStatus: "superseded", supersededById: { $ne: null } },
        { supersededById: 1, _id: 1 }
    ).lean().limit(500);

    if (superseded.length === 0) return { pass: true };

    const successorIds = [...new Set(superseded.map(c => c.supersededById.toString()))];
    const existingSuccessors = await OrgContract.find(
        { _id: { $in: successorIds } },
        { _id: 1 }
    ).lean();

    const existingSet = new Set(existingSuccessors.map(c => c._id.toString()));
    const orphans = superseded.filter(c => !existingSet.has(c.supersededById.toString()));

    if (orphans.length > 0) {
        return {
            pass: false,
            violation: "BROKEN_CONTRACT_CHAIN",
            detail: `${orphans.length} superseded contract(s) point to non-existent successor contracts`
        };
    }
    return { pass: true };
}

/**
 * Check 5: No orphan drafts older than 30 days.
 * Drafts that were never activated and are very old indicate a provisioning failure.
 */
async function checkNoOrphanDrafts() {
    const OrgContract = getOrgContract();
    if (!OrgContract) return { pass: true, skipped: "model not loaded" };

    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days

    const orphanCount = await OrgContract.countDocuments({
        contractStatus: "draft",
        createdAt: { $lt: cutoff }
    });

    if (orphanCount > 0) {
        return {
            pass: false,
            violation: "ORPHAN_DRAFT_CONTRACTS",
            detail: `${orphanCount} draft contract(s) are older than 30 days and were never activated`
        };
    }
    return { pass: true };
}

// ─── Runtime Check Runner ─────────────────────────────────────────────────────

async function runRuntimeChecks() {
    if (getPlatformConnection().readyState !== 1) {
        guardianLogger.warn({ state: getPlatformConnection().readyState }, "Runtime Guardian skipped — DB not connected");
        return;
    }

    incrementMetric("runtimeGuardianRuns");
    setMetric("lastRuntimeCheckAt", new Date().toISOString());

    const checks = [
        { name: "NO_MULTIPLE_ACTIVE_CONTRACTS", fn: checkNoMultipleActiveContracts },
        { name: "LOCKED_PRICE_NOT_NULL", fn: checkLockedPriceNotNull },
        { name: "NO_STUCK_EXPIRED_CONTRACTS", fn: checkNoStuckExpiredContracts },
        { name: "CONTRACT_CHAIN_INTEGRITY", fn: checkContractChainIntegrity },
        { name: "NO_ORPHAN_DRAFTS", fn: checkNoOrphanDrafts },
        // v21.0: Billing engine invariants
        { name: "INVOICE_TOTAL_MATCH", fn: checkInvoiceTotalMatch },
        { name: "PAYMENT_NOT_GREATER_THAN_INVOICE", fn: checkPaymentNotGreaterThanInvoice },
        { name: "CONTRACT_SINGLE_ACTIVE", fn: checkContractSingleActive },
        { name: "LEDGER_APPEND_ONLY", fn: checkLedgerAppendOnly },
        { name: "PLAN_VERSION_VALID", fn: checkPlanVersionValid },
        { name: "LEDGER_HASH_CHAIN_VALID", fn: checkLedgerHashChainValid },
        // v22.0: Refund safety invariant
        { name: "REFUND_NOT_GREATER_THAN_PAYMENT", fn: checkRefundNotGreaterThanPayment }
    ];

    const results = [];

    for (const { name, fn } of checks) {
        try {
            const result = await fn();
            results.push({ name, ...result });
        } catch (err) {
            results.push({ name, pass: false, violation: "CHECK_ERROR", detail: err.message });
        }
    }

    const violations = results.filter(r => !r.pass && !r.skipped);

    if (violations.length === 0) {
        guardianLogger.debug(
            { checks: results.length, at: new Date().toISOString() },
            "Runtime Guardian: all checks clean"
        );
        return;
    }

    for (const v of violations) {
        incrementMetric("invariantViolations");
        guardianLogger.critical(
            { violation: v.violation, detail: v.detail },
            `RUNTIME INVARIANT VIOLATION: ${v.violation} — ${v.detail}`
        );
    }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

let _guardianTimer = null;

/**
 * startRuntimeGuardian
 *
 * Starts the periodic runtime guardian on the given interval.
 * Safe to call after server boot — runs immediately then on interval.
 *
 * @param {number} [intervalMs=5 * 60 * 1000]  - Check interval (default: 5 minutes)
 * @returns {void}
 */
function startRuntimeGuardian(intervalMs = 5 * 60 * 1000) {
    if (_guardianTimer) {
        guardianLogger.warn({}, "startRuntimeGuardian called more than once — skipping duplicate registration");
        return;
    }

    guardianLogger.info(
        { intervalMs, mode: process.env.PLATFORM_GUARDIAN_MODE || "permissive" },
        `Runtime Guardian started (interval: ${intervalMs / 1000}s)`
    );

    // First run immediately (after a short delay to let DB stabilize)
    setTimeout(() => {
        runRuntimeChecks().catch(err => {
            guardianLogger.error({ err: err.message }, "Runtime Guardian first-run error (non-fatal)");
        });
    }, 5000);

    // Then on interval
    // ALLOWED_POLLING: HEALTH
    _guardianTimer = setInterval(() => {
        runRuntimeChecks().catch(err => {
            guardianLogger.error({ err: err.message }, "Runtime Guardian interval error (non-fatal)");
        });
    }, intervalMs);

    // Don't hold the event loop open
    if (_guardianTimer.unref) _guardianTimer.unref();
}

/**
 * stopRuntimeGuardian
 * Stops the interval (useful for graceful shutdown and tests).
 */
function stopRuntimeGuardian() {
    if (_guardianTimer) {
        clearInterval(_guardianTimer);
        _guardianTimer = null;
        guardianLogger.info({}, "Runtime Guardian stopped");
    }
}

// Exported for testing
module.exports = {
    startRuntimeGuardian,
    stopRuntimeGuardian,
    runRuntimeChecks,
    // individual checks exported for test isolation
    _checks: {
        checkNoMultipleActiveContracts,
        checkLockedPriceNotNull,
        checkNoStuckExpiredContracts,
        checkContractChainIntegrity,
        checkNoOrphanDrafts,
        // v21.0+v21.1: billing invariants
        checkInvoiceTotalMatch,
        checkPaymentNotGreaterThanInvoice,
        checkContractSingleActive,
        checkLedgerAppendOnly,
        checkPlanVersionValid,
        checkLedgerHashChainValid,
        // v22.0: refund safety invariant
        checkRefundNotGreaterThanPayment
    }
};
