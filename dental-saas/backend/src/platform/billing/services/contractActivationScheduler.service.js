/**
 * contractActivationScheduler.service.js
 * Platform Billing — Scheduled Contract Activation Processor
 *
 * Section 6: ContractActivationScheduler
 *
 * Polls for OrgContract documents in status "pending_activation"
 * whose effectiveFrom date has now passed, and runs the full
 * activate → generateInvoice → issueInvoice → applyPayment pipeline.
 *
 * Designed to run on a periodic schedule (e.g. every 5 minutes via cron or setInterval).
 * Each run is atomic per-contract: a failure on one contract does NOT block others.
 *
 * Integration:
 *   In the billing module index or app startup:
 *
 *   const { startContractActivationScheduler } = require('./services/contractActivationScheduler.service');
 *   startContractActivationScheduler({ intervalMs: 5 * 60 * 1000 });
 *
 * PLANE: Platform Billing
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");

// ─── Lazy loaders (avoid circular deps) ──────────────────────────────────────

let _OrgContract;
function getOrgContract() {
    if (!_OrgContract) _OrgContract = require("../models/OrgContract.model");
    return _OrgContract;
}

let _InvoiceEngine;
function inv() {
    if (!_InvoiceEngine) _InvoiceEngine = require("../engines/InvoiceEngine.service");
    return _InvoiceEngine;
}

let _PaymentEngine;
function pay() {
    if (!_PaymentEngine) _PaymentEngine = require("../engines/PaymentEngine.service");
    return _PaymentEngine;
}

let _SubscriptionEngine;
function sub() {
    if (!_SubscriptionEngine) _SubscriptionEngine = require("../engines/SubscriptionEngine.service");
    return _SubscriptionEngine;
}

let _LedgerEngine;
function led() {
    if (!_LedgerEngine) _LedgerEngine = require("../engines/LedgerEngine.service");
    return _LedgerEngine;
}

// ─── In-memory guard: prevent overlapping runs ────────────────────────────────
let _isRunning = false;

// ─── Core processor ──────────────────────────────────────────────────────────

/**
 * activateScheduledContracts
 *
 * Finds all OrgContracts in "pending_activation" with effectiveFrom <= now
 * and runs the activation pipeline for each.
 *
 * @returns {Promise<{ processed: number, failed: number, skipped: number }>}
 */
async function activateScheduledContracts() {
    if (_isRunning) {
        logger.warn("[ContractActivationScheduler] Previous run still in progress — skipping this cycle");
        return { processed: 0, failed: 0, skipped: 1 };
    }

    _isRunning = true;
    const OrgContract = getOrgContract();
    const now = new Date();

    let processed = 0, failed = 0;

    try {
        // Find all pending_activation contracts whose time has come
        const due = await OrgContract.find({
            contractStatus: "pending_activation",
            effectiveFrom: { $lte: now }
        })
            .select("_id organizationId planVersionId billingInterval paymentProvider")
            .lean();

        if (due.length === 0) {
            logger.debug({ now: now.toISOString() }, "[ContractActivationScheduler] No contracts due for activation");
            return { processed: 0, failed: 0, skipped: 0 };
        }

        logger.info(
            { count: due.length, now: now.toISOString() },
            "[ContractActivationScheduler] Contracts due for activation"
        );

        for (const contractDoc of due) {
            const contractId = String(contractDoc._id);
            const organizationId = String(contractDoc.organizationId);

            try {
                await _activateSingleContract({ contractId, organizationId, contractDoc });
                processed++;
            } catch (err) {
                failed++;
                logger.error(
                    { err, contractId, organizationId },
                    "[ContractActivationScheduler] Failed to activate contract — skipping to next"
                );
            }
        }

    } finally {
        _isRunning = false;
    }

    logger.info(
        { processed, failed },
        "[ContractActivationScheduler] Cycle complete"
    );

    return { processed, failed, skipped: 0 };
}

/**
 * _activateSingleContract
 *
 * Activates one scheduled contract atomically:
 *   activateContract → generateInvoice → issueInvoice → applyPayment
 *
 * Each step is wrapped in a single Mongoose session/transaction.
 *
 * @param {{ contractId: string, organizationId: string, contractDoc: object }} params
 */
async function _activateSingleContract({ contractId, organizationId, contractDoc }) {
    const correlationId = `sched-${contractId}-${Date.now()}`;
    const billingInterval = contractDoc.billingInterval || "monthly";

    logger.info(
        { contractId, organizationId, correlationId, billingInterval },
        "[ContractActivationScheduler] contract.activationStarted"
    );

    const session = await mongoose.startSession();
    session.startTransaction();

    let invoice, payment;
    let currentStep = "start";

    try {
        // ── Step 1: Activate ────────────────────────────────────────────────────
        // Legacy pending_activation path (scheduled future-date contracts).
        // skipInvoiceCheck=true is permitted here because this is a system-initiated
        // activation that was never part of the invoice-first flow — these contracts
        // were created before v3.0 or via the legacy scheduler path.
        currentStep = "activateContract";
        await sub().activateContract(
            contractId,
            null,   // invoiceId: null — skipInvoiceCheck bypasses INVOICE_NOT_PAID guard
            { activatedBy: null, session, skipInvoiceCheck: true, correlationId }
        );
        logger.info({ contractId, correlationId }, "[ContractActivationScheduler] contract.activated");

        // ── Step 2: Generate invoice ────────────────────────────────────────────
        currentStep = "generateInvoice";
        const invoiceResult = await inv().generateInvoice(contractId, {
            session,
            billingInterval,
            invoiceType: "subscription"
        });
        invoice = invoiceResult.invoice || invoiceResult;
        logger.info(
            { contractId, invoiceId: String(invoice._id), amount: invoice.totalAmount, correlationId },
            "[ContractActivationScheduler] invoice.generated"
        );

        // ── Step 3: Issue invoice ───────────────────────────────────────────────
        currentStep = "issueInvoice";
        invoice = await inv().issueInvoice(String(invoice._id), { session });
        logger.info({ invoiceId: String(invoice._id), status: invoice.status, correlationId }, "[ContractActivationScheduler] invoice.issued");

        // ── Step 4: Apply payment ───────────────────────────────────────────────
        currentStep = "applyPayment";
        payment = await pay().applyPayment({
            invoiceId: String(invoice._id),
            amount: invoice.totalAmount,
            method: contractDoc.paymentProvider || "manual",
            provider: contractDoc.paymentProvider || "manual",
            requestId: correlationId,
            session
        });
        logger.info(
            { invoiceId: String(invoice._id), paymentId: payment?.payment?._id, correlationId },
            "[ContractActivationScheduler] payment.applied"
        );

        // ── Commit ──────────────────────────────────────────────────────────────
        currentStep = "commit";
        await session.commitTransaction();
        logger.info({ contractId, correlationId }, "[ContractActivationScheduler] contract.activationComplete");

    } catch (err) {
        try { await session.abortTransaction(); } catch (_) { /* swallow cleanup error */ }
        logger.error(
            { err, contractId, organizationId, failedStep: currentStep, correlationId },
            `[ContractActivationScheduler] contract.activationFailed at step "${currentStep}": ${err.message}`
        );
        throw err; // re-throw so caller can count as failed
    } finally {
        session.endSession();
    }

    // ── Post-commit: ledger write (non-blocking) ──────────────────────────────
    setImmediate(async () => {
        try {
            await led().writeLedgerEntry({
                eventType: "contract.activated",
                organizationId,
                contractId,
                invoiceId: invoice ? String(invoice._id) : null,
                paymentAttemptId: payment?.payment?._id ? String(payment.payment._id) : null,
                amount: invoice?.totalAmount ?? 0,
                currency: invoice?.currency ?? null,
                provider: contractDoc.paymentProvider || "manual",
                source: "contractActivationScheduler",
                actorType: "system",
                metadata: { correlationId, billingInterval, scheduledActivation: true }
            });
        } catch (ledErr) {
            logger.error(
                { ledErr, contractId, correlationId },
                "[ContractActivationScheduler] ledger write failed (non-fatal)"
            );
        }
    });
}

// ─── Scheduler lifecycle ──────────────────────────────────────────────────────

let _schedulerHandle = null;

/**
 * startContractActivationScheduler
 *
 * Starts a repeating interval that calls activateScheduledContracts().
 * Safe to call multiple times — only one interval will be registered.
 *
 * @param {object} [opts]
 * @param {number} [opts.intervalMs=300000]  Poll interval in milliseconds (default: 5 min)
 * @param {boolean} [opts.runImmediately=false]  Run one cycle immediately on start
 */
function startContractActivationScheduler({ intervalMs = 5 * 60 * 1000, runImmediately = false } = {}) {
    if (_schedulerHandle) {
        logger.warn("[ContractActivationScheduler] Already started — ignoring duplicate start call");
        return;
    }

    logger.info(
        { intervalMs, runImmediately },
        "[ContractActivationScheduler] Starting — polling for scheduled contract activations"
    );

    if (runImmediately) {
        activateScheduledContracts().catch(err =>
            logger.error({ err }, "[ContractActivationScheduler] Initial run failed")
        );
    }

    // ALLOWED_POLLING: SCHEDULER
    _schedulerHandle = setInterval(() => {
        activateScheduledContracts().catch(err =>
            logger.error({ err }, "[ContractActivationScheduler] Scheduled run failed")
        );
    }, intervalMs);

    // Prevent the interval from keeping the process alive in test environments
    if (_schedulerHandle.unref) _schedulerHandle.unref();
}

/**
 * stopContractActivationScheduler
 * Clears the polling interval. Idempotent.
 */
function stopContractActivationScheduler() {
    if (_schedulerHandle) {
        clearInterval(_schedulerHandle);
        _schedulerHandle = null;
        logger.info("[ContractActivationScheduler] Stopped");
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    activateScheduledContracts,   // callable directly (e.g. for one-off admin trigger)
    startContractActivationScheduler,
    stopContractActivationScheduler,
    // Exposed for testing
    _getIsRunning: () => _isRunning,
};
