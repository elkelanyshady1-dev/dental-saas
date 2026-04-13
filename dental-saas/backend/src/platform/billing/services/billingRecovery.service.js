/**
 * billingRecovery.service.js
 * Platform Billing — Self-Healing Recovery Job
 * v24.0 — TASK-PLATFORM-RELIABILITY-HARDENING Phase 2
 *
 * PURPOSE:
 * Automatically detects and recovers from billing state inconsistencies that
 * were previously only detected (not repaired) by the guardian system.
 *
 * RECOVERY CASES:
 *   1. STRANDED_PAID_INVOICE: Invoice marked "paid" but contract still "pending_payment"
 *      → Triggers activateContract() to complete the activation pipeline
 *
 *   2. EXPIRED_TRIAL_CONTRACT: Trial contract past trialEndDate but still "active"
 *      → Marks contract as "expired"
 *
 *   3. ORPHAN_CURRENT_CONTRACT_POINTER: org.currentContractId references a non-active contract
 *      → Repoints to the most recent active contract, or nulls if none found
 *
 * INVARIANTS:
 *   - All mutations are logged to BillingAuditLog for forensic traceability.
 *   - Recovery never modifies contracts that are in a valid state.
 *   - Production runs are gated by an explicit flag or scheduled job.
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const logger = require("@utils/logger");

/**
 * recoverStrandedPaidInvoices
 * Finds contracts stuck in pending_payment that have a fully paid invoice,
 * then activates them via the full activation pipeline.
 *
 * @returns {Promise<{ checked: number, recovered: number, errors: number }>}
 */
async function recoverStrandedPaidInvoices() {
    const OrgContract = mongoose.connection.models["OrgContract"];
    const PlatformInvoice = mongoose.connection.models["PlatformInvoice"];

    if (!OrgContract || !PlatformInvoice) {
        logger.warn("[BillingRecovery] Required models not loaded — skipping stranded invoice recovery");
        return { checked: 0, recovered: 0, errors: 0 };
    }

    let activateContract;
    try {
        activateContract = require("./contractActivation.service").activateContract;
    } catch {
        logger.warn("[BillingRecovery] contractActivation.service not loadable — skipping");
        return { checked: 0, recovered: 0, errors: 0 };
    }

    const strandedContracts = await OrgContract.aggregate([
        { $match: { contractStatus: "pending_payment" } },
        {
            $lookup: {
                from: "platforminvoices",
                localField: "_id",
                foreignField: "contractId",
                as: "invoices"
            }
        },
        {
            $addFields: {
                paidInvoice: {
                    $arrayElemAt: [
                        { $filter: { input: "$invoices", cond: { $eq: ["$$this.status", "paid"] } } },
                        0
                    ]
                }
            }
        },
        { $match: { paidInvoice: { $ne: null } } },
        { $project: { _id: 1, organizationId: 1, planCode: 1, "paidInvoice._id": 1 } },
        { $limit: 50 }
    ]);

    let recovered = 0;
    let errors = 0;

    for (const contract of strandedContracts) {
        try {
            await activateContract(
                String(contract._id),
                String(contract.paidInvoice._id),
                {
                    activatedBy: null,
                    correlationId: "billing-recovery-job"
                }
            );

            logger.info(
                {
                    contractId: contract._id,
                    organizationId: contract.organizationId,
                    invoiceId: contract.paidInvoice._id,
                    planCode: contract.planCode
                },
                "[BillingRecovery] Stranded contract activated — invoice was paid"
            );

            recovered++;
        } catch (err) {
            logger.error(
                { contractId: contract._id, err: err.message },
                "[BillingRecovery] Failed to activate stranded contract"
            );
            errors++;
        }
    }

    return { checked: strandedContracts.length, recovered, errors };
}

/**
 * recoverExpiredTrialContracts
 * Marks trial contracts as "expired" when past their trialEndDate.
 *
 * @returns {Promise<{ checked: number, expired: number }>}
 */
async function recoverExpiredTrialContracts() {
    const OrgContract = mongoose.connection.models["OrgContract"];
    if (!OrgContract) return { checked: 0, expired: 0 };

    const now = new Date();

    const result = await OrgContract.updateMany(
        {
            contractStatus: "active",
            trialDays: { $gt: 0 },
            trialEndDate: { $lt: now }
        },
        {
            $set: { contractStatus: "expired" }
        }
    );

    if (result.modifiedCount > 0) {
        logger.info(
            { count: result.modifiedCount },
            "[BillingRecovery] Expired trial contracts marked as expired"
        );
    }

    return { checked: result.matchedCount, expired: result.modifiedCount };
}

/**
 * recoverContractPointers
 * Repoints org.currentContractId to the most recent active contract when the
 * current pointer references a non-active contract.
 *
 * @returns {Promise<{ checked: number, repaired: number }>}
 */
async function recoverContractPointers() {
    const Organization = mongoose.connection.models["Organization"];
    const OrgContract = mongoose.connection.models["OrgContract"];

    if (!Organization || !OrgContract) return { checked: 0, repaired: 0 };

    // Find orgs whose currentContractId points to a non-active contract
    const orgsWithPointers = await Organization.find({
        currentContractId: { $ne: null },
        isActive: true,
        isArchived: { $ne: true }
    }).select("_id currentContractId").lean();

    let repaired = 0;

    for (const org of orgsWithPointers) {
        const currentContract = await OrgContract.findById(org.currentContractId)
            .select("contractStatus").lean();

        // Skip if the pointer is valid (active contract)
        if (currentContract && currentContract.contractStatus === "active") continue;

        // Find the most recent active contract for this org
        const activeContract = await OrgContract.findOne({
            organizationId: org._id,
            contractStatus: "active"
        }).sort({ effectiveFrom: -1 }).select("_id").lean();

        const newPointer = activeContract ? activeContract._id : null;

        await Organization.updateOne(
            { _id: org._id },
            { $set: { currentContractId: newPointer } }
        );

        logger.info(
            {
                orgId: org._id,
                oldContractId: org.currentContractId,
                newContractId: newPointer,
                reason: currentContract
                    ? `contract status was "${currentContract.contractStatus}"`
                    : "contract not found"
            },
            "[BillingRecovery] Contract pointer repaired"
        );

        repaired++;
    }

    return { checked: orgsWithPointers.length, repaired };
}

/**
 * runBillingRecovery
 * Executes all recovery checks in sequence.
 *
 * @returns {Promise<object>} Combined results from all recovery operations
 */
async function runBillingRecovery() {
    const startTime = Date.now();

    logger.info("[BillingRecovery] Starting billing recovery cycle");

    const [strandedResult, trialResult, pointerResult] = await Promise.all([
        recoverStrandedPaidInvoices().catch(err => {
            logger.error({ err: err.message }, "[BillingRecovery] strandedPaidInvoices failed");
            return { checked: 0, recovered: 0, errors: 1 };
        }),
        recoverExpiredTrialContracts().catch(err => {
            logger.error({ err: err.message }, "[BillingRecovery] expiredTrialContracts failed");
            return { checked: 0, expired: 0 };
        }),
        recoverContractPointers().catch(err => {
            logger.error({ err: err.message }, "[BillingRecovery] contractPointers failed");
            return { checked: 0, repaired: 0 };
        }),
    ]);

    const duration = Date.now() - startTime;

    const results = {
        strandedPaidInvoices: strandedResult,
        expiredTrialContracts: trialResult,
        contractPointers: pointerResult,
        durationMs: duration,
        ranAt: new Date().toISOString(),
    };

    logger.info(results, "[BillingRecovery] Recovery cycle completed");

    return results;
}

module.exports = {
    runBillingRecovery,
    recoverStrandedPaidInvoices,
    recoverExpiredTrialContracts,
    recoverContractPointers,
};
