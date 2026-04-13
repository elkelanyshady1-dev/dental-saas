/**
 * integrityChecker.service.js — On-Demand Financial System Audit
 * Billing Domain — Ledger Hardening
 *
 * Performs a comprehensive integrity scan of the double-entry journal.
 * Unlike reconciliation (which compares ledger vs source), this checks
 * the INTERNAL consistency of the journal itself.
 *
 * CHECKS:
 * 1. Missing journal entries (invoices/payments without journal records)
 * 2. Duplicate journal entries (multiple entries for same reference)
 * 3. Unbalanced entries (debit ≠ credit — should never happen)
 * 4. Orphaned entries (journal entries without source documents)
 * 5. Retry queue health (pending/dead jobs)
 *
 * PLANE: Org only.
 * Phase 3.2 — Connection-aware model resolution via getModel.
 *
 * SECURITY: All queries use secureModel + signed system context (Wave 7 RLS).
 */

"use strict";

const mongoose = require("mongoose");
const JournalEntryDef = require("../models/JournalEntry.model");
const PatientInvoiceDef = require("../organizationFinance/models/PatientInvoice.model");
const PatientPaymentDef = require("../organizationFinance/models/PatientPayment.model");
const JournalRetryDef = require("../resilience/JournalRetry.model");
const getModel = require("@core/db/getModel");
const { idempotencyGuard } = require("../guards/idempotency.guard");
const reconciliationService = require("./reconciliation.service");
const driftAlertService = require("./driftAlert.service");

const logger = require("@utils/logger");

// ─── Strict Per-Org Model Resolvers (Phase 3.3) ─────────────────────────────
function _getSecureJournal(connection) {
    if (!connection) throw new Error("[IntegrityChecker] connection is REQUIRED — per-org mode does not allow fallback");
    return getModel(connection, JournalEntryDef);
}

function _getSecureRetry(connection) {
    if (!connection) throw new Error("[IntegrityChecker] connection is REQUIRED — per-org mode does not allow fallback");
    return getModel(connection, JournalRetryDef);
}

// ─── Full Financial Audit ───────────────────────────────────────────────────

/**
 * Run a comprehensive financial integrity audit for an organization.
 *
 * @param {string} organizationId
 * @returns {Promise<Object>} — audit report
 */
async function runFullFinancialAudit(organizationId, connection = null) {
    const timestamp = new Date();

    logger.info({ organizationId }, "[IntegrityChecker] Starting full financial audit");

    const results = {
        organizationId,
        timestamp,
        checks: {},
        issues: [],
        summary: {},
    };

    // ─── Check 1: Unbalanced Entries ────────────────────────────────

    const unbalanced = await checkUnbalancedEntries(ctx, connection);
    results.checks.unbalancedEntries = unbalanced;
    if (unbalanced.count > 0) {
        results.issues.push({
            severity: "fatal",
            type: "unbalanced_journal_entry",
            description: `${unbalanced.count} journal entries have debit ≠ credit`,
            entries: unbalanced.entries,
        });
    }

    // ─── Check 2: Duplicate Entries ─────────────────────────────────

    const duplicates = await checkDuplicateEntries(ctx, connection);
    results.checks.duplicateEntries = duplicates;
    if (duplicates.count > 0) {
        results.issues.push({
            severity: "critical",
            type: "duplicate_journal_entry",
            description: `${duplicates.count} references have multiple journal entries`,
            duplicates: duplicates.entries,
        });
    }

    // ─── Check 3: Missing Entries (Coverage) ────────────────────────

    const coverage = await reconciliationService.checkJournalCoverage(organizationId, connection);
    results.checks.journalCoverage = coverage;
    if (coverage.gaps.length > 0) {
        results.issues.push({
            severity: "critical",
            type: "missing_journal_entry",
            description: `${coverage.gaps.length} source documents without journal entries`,
            gaps: coverage.gaps,
        });
    }

    // ─── Check 4: Orphaned Entries ──────────────────────────────────

    const orphans = await checkOrphanedEntries(ctx, connection);
    results.checks.orphanedEntries = orphans;
    if (orphans.count > 0) {
        results.issues.push({
            severity: "warning",
            type: "orphaned_journal_entry",
            description: `${orphans.count} journal entries reference non-existent documents`,
            orphans: orphans.entries,
        });
    }

    // ─── Check 5: Retry Queue Health ────────────────────────────────

    const retryHealth = await checkRetryQueueHealth(ctx, connection);
    results.checks.retryQueue = retryHealth;
    if (retryHealth.deadJobs > 0) {
        results.issues.push({
            severity: "fatal",
            type: "retry_exhausted",
            description: `${retryHealth.deadJobs} journal retry jobs exhausted all attempts`,
            deadJobs: retryHealth.details,
        });
    }

    // ─── Check 6: Reconciliation ────────────────────────────────────

    const reconciliation = await reconciliationService.reconcileOrganization(organizationId, connection);
    results.checks.reconciliation = reconciliation;

    // ─── Build Summary ──────────────────────────────────────────────

    const hasFatal = results.issues.some(i => i.severity === "fatal");
    const hasCritical = results.issues.some(i => i.severity === "critical");

    results.summary = {
        totalChecks: 6,
        totalIssues: results.issues.length,
        fatalIssues: results.issues.filter(i => i.severity === "fatal").length,
        criticalIssues: results.issues.filter(i => i.severity === "critical").length,
        warningIssues: results.issues.filter(i => i.severity === "warning").length,
        overallStatus: hasFatal ? "FAIL" : hasCritical ? "DEGRADED" : results.issues.length > 0 ? "WARNING" : "PASS",
        reconciliationStatus: reconciliation.status,
    };

    // Raise alerts for any issues
    if (results.issues.length > 0) {
        await driftAlertService.processReconciliationReport(reconciliation);

        logger.error(
            { organizationId, summary: results.summary },
            "[IntegrityChecker] ⚠ Financial audit completed with issues"
        );
    } else {
        logger.info(
            { organizationId },
            "[IntegrityChecker] ✅ Financial audit PASSED — zero issues"
        );
    }

    return results;
}

// ─── Individual Checks ──────────────────────────────────────────────────────

/**
 * Check 1: Find journal entries where totalDebit ≠ totalCredit.
 * This should NEVER happen if model validation is working correctly.
 */
async function checkUnbalancedEntries(ctx, connection = null) {
    // secureModel.aggregate prepends $match { organizationId } automatically
    const entries = await _getSecureJournal(connection).aggregate([
        {
            $match: {
                $expr: { $ne: ["$totalDebitMinor", "$totalCreditMinor"] },
            },
        },
        {
            $project: {
                _id: 1,
                referenceType: 1,
                referenceId: 1,
                totalDebitMinor: 1,
                totalCreditMinor: 1,
                createdAt: 1,
            },
        },
    ]);

    return {
        status: entries.length === 0 ? "pass" : "fail",
        count: entries.length,
        entries,
    };
}

/**
 * Check 2: Find references with more than one journal entry.
 */
async function checkDuplicateEntries(ctx, connection = null) {
    // secureModel.aggregate prepends $match { organizationId } automatically
    const results = await _getSecureJournal(connection).aggregate([
        {
            $group: {
                _id: { referenceType: "$referenceType", referenceId: "$referenceId" },
                count: { $sum: 1 },
                entryIds: { $push: "$_id" },
            },
        },
        { $match: { count: { $gt: 1 } } },
    ]);

    return {
        status: results.length === 0 ? "pass" : "fail",
        count: results.length,
        entries: results.map(r => ({
            referenceType: r._id.referenceType,
            referenceId: r._id.referenceId,
            duplicateCount: r.count,
            entryIds: r.entryIds,
        })),
    };
}

/**
 * Check 4: Find journal entries whose source documents no longer exist.
 */
async function checkOrphanedEntries(ctx, connection = null) {
    // secureModel.aggregate prepends $match { organizationId } automatically
    // Check invoice-type entries
    const invoiceOrphans = await _getSecureJournal(connection).aggregate([
        { $match: { referenceType: "invoice" } },
        {
            $lookup: {
                from: "patientinvoices",
                localField: "referenceId",
                foreignField: "_id",
                as: "source",
            },
        },
        { $match: { source: { $size: 0 } } },
        { $project: { _id: 1, referenceType: 1, referenceId: 1, createdAt: 1 } },
    ]);

    // Check payment-type entries
    const paymentOrphans = await _getSecureJournal(connection).aggregate([
        { $match: { referenceType: "payment" } },
        {
            $lookup: {
                from: "patientpayments",
                localField: "referenceId",
                foreignField: "_id",
                as: "source",
            },
        },
        { $match: { source: { $size: 0 } } },
        { $project: { _id: 1, referenceType: 1, referenceId: 1, createdAt: 1 } },
    ]);

    const allOrphans = [...invoiceOrphans, ...paymentOrphans];

    return {
        status: allOrphans.length === 0 ? "pass" : "fail",
        count: allOrphans.length,
        entries: allOrphans,
    };
}

/**
 * Check 5: Retry queue health — pending/dead jobs.
 */
async function checkRetryQueueHealth(ctx, connection = null) {
    // secureModel.aggregate prepends $match { organizationId } automatically
    const stats = await _getSecureRetry(connection).aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const statusMap = { pending: 0, retrying: 0, failed: 0, dead: 0, completed: 0 };
    for (const s of stats) {
        statusMap[s._id] = s.count;
    }

    // Get dead job details via secureModel.find
    const deadDetails = await _getSecureRetry(connection).find(
        { status: "dead" }
    ).select("referenceType referenceId attempts lastError createdAt").lean();

    return {
        status: statusMap.dead === 0 ? "pass" : "fail",
        ...statusMap,
        deadJobs: statusMap.dead,
        details: deadDetails,
    };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
    runFullFinancialAudit,
    checkUnbalancedEntries,
    checkDuplicateEntries,
    checkOrphanedEntries,
    checkRetryQueueHealth,
};
