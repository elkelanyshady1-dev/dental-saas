/**
 * replay.service.js
 * AccountingDomain — Projection Replay (Rebuild) (Phase 3.6)
 *
 * PURPOSE:
 *   Allows org-admins to rebuild accounting projections from source data
 *   when projections are stale, corrupted, or missing after a deployment.
 *
 * APPROACH:
 *   1. Clear existing projection documents for the org
 *   2. Clear the EventProcessingLog for the org (so replayed events re-register)
 *   3. Fetch source data from Pat ientInvoice / PatientPayment models (per-org DB)
 *   4. Re-apply the same projection logic as the live listeners
 *   5. Mark each replayed document in the EventProcessingLog
 *
 * CQRS INVARIANTS:
 *   ✅ Reads from PatientInvoice / PatientPayment (same org DB — NOT cross-tenant)
 *   ✅ Writes ONLY to accounting projection collections (not billing tables)
 *   ✅ Fully idempotent — safe to call multiple times
 *   ✅ Scoped to one org at a time
 *
 * PLANE: Org only
 * PERMISSION: P.ACCOUNTING_MANAGE (admin-only)
 *
 * @module accountingDomain/services/replay.service
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");
const { v4: uuidv4 } = require("uuid");

// ─── Projection imports ───────────────────────────────────────────────────────
const { RevenueSummaryDef, updateRevenueSummary } = require("../projections/revenueSummary.projection");
const { CashFlowSchema, updateCashFlow } = require("../projections/cashFlow.projection");
const EventProcessingLogSchema = require("../projections/_meta/EventProcessingLog.model");

// ─── Source model definitions (read from billingDomain — same org DB, NOT cross-tenant) ─────
const PatientInvoiceDef = require("@modules/billingDomain/organizationFinance/models/PatientInvoice.model");
const PatientPaymentDef = require("@modules/billingDomain/organizationFinance/models/PatientPayment.model");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bindModel(dbConnection, name, schema) {
    if (dbConnection.modelNames().includes(name)) return dbConnection.model(name);
    return dbConnection.model(name, schema);
}

// ─── Concurrency Lock (per-org) ───────────────────────────────────────────────
//
// Maps orgId → { startedAt: timestamp } while a rebuild is in progress.
// Prevents duplicate projection writes if two admin requests arrive concurrently.
// Different orgs rebuild independently (correct behaviour).
//
// CRASH SAFETY (Phase 3.7):
//   If the server crashes mid-rebuild, the in-memory lock persists until restart.
//   The 10-minute timeout allows automatic recovery without requiring manual
//   intervention or a server restart.
//
const _rebuildingOrgs   = new Map();
const LOCK_TIMEOUT_MS   = 10 * 60 * 1000; // 10 minutes

// ─── Main Replay Function ─────────────────────────────────────────────────────

/**
 * rebuildProjections
 *
 * Clears and rebuilds ALL accounting projections for a single org.
 * Reads source data from the org-specific DB (not a cross-tenant query).
 *
 * @param {mongoose.Connection} dbConnection — Org-specific DB connection
 * @param {string} organizationId — Target org
 * @returns {Object} Replay statistics
 */
async function rebuildProjections(dbConnection, organizationId) {
    const orgId = organizationId.toString();

    // ── Concurrency lock (crash-safe — Phase 3.7) ────────────────────────
    const existingLock = _rebuildingOrgs.get(orgId);

    if (existingLock) {
        if (Date.now() - existingLock.startedAt > LOCK_TIMEOUT_MS) {
            // Stale lock: server likely crashed mid-rebuild — clear and continue
            logger.warn({
                event:   "REPLAY_LOCK_EXPIRED",
                orgId,
                lockedSinceMs: Date.now() - existingLock.startedAt,
            }, "[accounting:replay] Stale replay lock expired — auto-cleared");
            _rebuildingOrgs.delete(orgId);
        } else {
            // Active lock — genuine concurrent request
            throw new Error("REPLAY_ALREADY_RUNNING");
        }
    }

    _rebuildingOrgs.set(orgId, { startedAt: Date.now() });

    try {
        return await _runRebuild(dbConnection, orgId);
    } finally {
        _rebuildingOrgs.delete(orgId);
    }
}

/**
 * _runRebuild — Internal rebuild implementation (called only by rebuildProjections).
 * Separated so the lock wrapper in rebuildProjections stays clean.
 */
async function _runRebuild(dbConnection, orgId) {
    logger.info({ orgId }, "[accounting:replay] Starting projection rebuild");

    const RevModel  = bindModel(dbConnection, "RevenueSummary", RevenueSummaryDef.schema);
    const CashModel = bindModel(dbConnection, "CashFlowProjection", CashFlowSchema);
    const LogModel  = bindModel(dbConnection, "EventProcessingLog", EventProcessingLogSchema);
    const InvModel  = bindModel(dbConnection, "PatientInvoice", PatientInvoiceDef.schema);
    const PayModel  = bindModel(dbConnection, "PatientPayment", PatientPaymentDef.schema);

    // ── Step 1: Clear existing projections ────────────────────────────────────
    const [revDel, cashDel, logDel] = await Promise.all([
        RevModel.deleteMany({}),
        CashModel.deleteMany({}),
        LogModel.deleteMany({ orgId }),
    ]);

    logger.info({
        orgId,
        revDeleted:  revDel.deletedCount,
        cashDeleted: cashDel.deletedCount,
        logCleared:  logDel.deletedCount,
    }, "[accounting:replay] Projections cleared");

    // ── Step 2: Fetch source data ──────────────────────────────────────────────
    // Cursor-based iteration to handle large datasets without loading all into memory
    const invoiceCursor = InvModel.find(
        { status: { $in: ["issued", "partially_paid", "paid"] } }
    ).lean().cursor();

    const paymentCursor = PayModel.find(
        { status: "active" }
    ).lean().cursor();

    // ── Step 3: Replay invoices → RevenueSummary ───────────────────────────────
    let invoicesProcessed = 0;
    let invoiceErrors = 0;

    for await (const invoice of invoiceCursor) {
        try {
            await updateRevenueSummary({ organizationId: orgId, dbConnection, invoice });

            // Register in processing log (synthetic eventId for replay tracking)
            const replayEventId = `replay-invoice-${invoice._id}`;
            try {
                await LogModel.create({
                    orgId,
                    eventId: replayEventId,
                    eventType: "invoice.created",
                    processedAt: new Date(),
                    sourceDocumentId: invoice._id.toString(),
                });
            } catch (dupErr) {
                if (dupErr.code !== 11000) throw dupErr;
            }

            invoicesProcessed++;
        } catch (err) {
            invoiceErrors++;
            logger.warn({
                orgId,
                invoiceId: invoice._id?.toString(),
                err: err.message,
            }, "[accounting:replay] Invoice replay error (continuing)");
        }
    }

    // ── Step 4: Replay payments → CashFlow ─────────────────────────────────────
    let paymentsProcessed = 0;
    let paymentErrors = 0;

    for await (const payment of paymentCursor) {
        try {
            await updateCashFlow({ organizationId: orgId, dbConnection, payment });

            const replayEventId = `replay-payment-${payment._id}`;
            try {
                await LogModel.create({
                    orgId,
                    eventId: replayEventId,
                    eventType: "payment.received",
                    processedAt: new Date(),
                    sourceDocumentId: payment._id.toString(),
                });
            } catch (dupErr) {
                if (dupErr.code !== 11000) throw dupErr;
            }

            paymentsProcessed++;
        } catch (err) {
            paymentErrors++;
            logger.warn({
                orgId,
                paymentId: payment._id?.toString(),
                err: err.message,
            }, "[accounting:replay] Payment replay error (continuing)");
        }
    }

    const stats = {
        organizationId: orgId,
        invoicesProcessed,
        invoiceErrors,
        paymentsProcessed,
        paymentErrors,
        completedAt: new Date().toISOString(),
    };

    logger.info({ ...stats }, "[accounting:replay] Projection rebuild complete");

    return stats;
}

// ─── Multi-Tenant Batch Replay ─────────────────────────────────────────────────

/**
 * rebuildAllOrgs
 *
 * Boot-time replay for ALL orgs when REBUILD_PROJECTIONS=true.
 * NOT for normal use — only for disaster recovery or first-time deploy.
 *
 * @param {Function} getOrgConnections — async fn() → [{ orgId, dbConnection }]
 */
async function rebuildAllOrgs(getOrgConnections) {
    logger.info("[accounting:replay] REBUILD_PROJECTIONS=true — starting multi-tenant rebuild");

    const connections = await getOrgConnections();

    if (!connections?.length) {
        logger.warn("[accounting:replay] No org connections available — skipping rebuild");
        return;
    }

    const results = [];

    for (const { orgId, dbConnection } of connections) {
        try {
            const stats = await rebuildProjections(dbConnection, orgId);
            results.push({ orgId, success: true, stats });
        } catch (err) {
            logger.error({ orgId, err: err.message }, "[accounting:replay] Org rebuild failed");
            results.push({ orgId, success: false, error: err.message });
        }
    }

    const succeeded = results.filter(r => r.success).length;
    const failed    = results.filter(r => !r.success).length;

    logger.info({
        total: results.length,
        succeeded,
        failed,
    }, "[accounting:replay] Multi-tenant rebuild complete");

    return results;
}

module.exports = {
    rebuildProjections,
    rebuildAllOrgs,
};
