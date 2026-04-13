/**
 * billing.invariants.js
 * Platform Guardian — Billing-specific Runtime Invariants
 * v21.0 — Financial Lifecycle Invariants
 *
 * New invariant checks for the upgraded billing engine:
 *
 *   INVOICE_TOTAL_MATCH
 *     - All non-void invoices: amountPaid + amountRemaining == totalAmount
 *     - Threshold: 1-cent tolerance for float arithmetic
 *
 *   PAYMENT_NOT_GREATER_THAN_INVOICE
 *     - No invoice has amountPaid > totalAmount (overpayment)
 *
 *   CONTRACT_SINGLE_ACTIVE
 *     - No org has more than 1 active-or-grace contract simultaneously
 *     (Extends the existing NO_MULTIPLE_ACTIVE_CONTRACTS check)
 *
 *   LEDGER_APPEND_ONLY
 *     - Verify: no BillingLedger document has updatedAt field set
 *       (Schema uses timestamps: { createdAt: true, updatedAt: false }
 *        so updatedAt should always be undefined/null)
 *
 * PLANE: Platform
 */

"use strict";

const mongoose = require("mongoose");
const { getPlatformConnection } = require("@core/db/dbResolver");
// v21.1: Hash verification for LEDGER_HASH_CHAIN_VALID invariant
const { verifyLedgerHash } = require("../billing/utils/ledgerHash");

const getBillingLedger = () => getPlatformConnection().models["BillingLedger"];
const getInvoice = () => getPlatformConnection().models["PlatformInvoice"];
const getContract = () => getPlatformConnection().models["OrgContract"];
const getPlanVersion = () => getPlatformConnection().models["PlanVersion"];

/**
 * INVOICE_TOTAL_MATCH
 * Ensures amountPaid + amountRemaining ≈ totalAmount for all invoices
 * that have amountRemaining populated (i.e., at least one payment applied).
 */
async function checkInvoiceTotalMatch() {
    const PlatformInvoice = getInvoice();
    if (!PlatformInvoice) return { pass: true, skipped: "model not loaded" };

    // Only check invoices where amountRemaining has been populated
    const invoices = await PlatformInvoice.find(
        {
            amountRemaining: { $ne: null, $exists: true },
            status: { $nin: ["void", "draft"] }
        },
        { amountPaid: 1, amountRemaining: 1, totalAmount: 1, invoiceNumber: 1 }
    ).limit(5000).lean();

    const violations = [];
    for (const inv of invoices) {
        const computed = (inv.amountPaid || 0) + (inv.amountRemaining || 0);
        const diff = Math.abs(computed - (inv.totalAmount || 0));
        if (diff > 0.02) {  // 2-cent tolerance
            violations.push({
                invoiceId: inv._id,
                invoiceNumber: inv.invoiceNumber,
                totalAmount: inv.totalAmount,
                amountPaid: inv.amountPaid,
                amountRemaining: inv.amountRemaining,
                discrepancy: diff.toFixed(4)
            });
        }
    }

    if (violations.length > 0) {
        return {
            pass: false,
            violation: "INVOICE_TOTAL_MATCH",
            detail: `${violations.length} invoice(s) have amountPaid+amountRemaining ≠ totalAmount`,
            violations: violations.slice(0, 10)  // cap for log readability
        };
    }

    return { pass: true, checked: invoices.length };
}

/**
 * PAYMENT_NOT_GREATER_THAN_INVOICE
 * Ensures no invoice has amountPaid > totalAmount (overpayment guard).
 */
async function checkPaymentNotGreaterThanInvoice() {
    const PlatformInvoice = getInvoice();
    if (!PlatformInvoice) return { pass: true, skipped: "model not loaded" };

    // Find invoices where amountPaid > totalAmount by more than 1 cent
    const overpaid = await PlatformInvoice.find(
        { $expr: { $gt: ["$amountPaid", { $add: ["$totalAmount", 0.01] }] } },
        { invoiceNumber: 1, totalAmount: 1, amountPaid: 1 }
    ).limit(100).lean();

    if (overpaid.length > 0) {
        return {
            pass: false,
            violation: "PAYMENT_NOT_GREATER_THAN_INVOICE",
            detail: `${overpaid.length} invoice(s) have amountPaid > totalAmount`,
            violations: overpaid.map(i => ({
                invoiceId: i._id,
                invoiceNumber: i.invoiceNumber,
                totalAmount: i.totalAmount,
                amountPaid: i.amountPaid,
                excess: ((i.amountPaid || 0) - (i.totalAmount || 0)).toFixed(2)
            }))
        };
    }

    return { pass: true };
}

/**
 * CONTRACT_SINGLE_ACTIVE
 * Extended check: no org has >1 contract in active OR grace status simultaneously.
 * (The partial-unique DB index enforces active-only, this check adds grace.)
 */
async function checkContractSingleActive() {
    const OrgContract = getContract();
    if (!OrgContract) return { pass: true, skipped: "model not loaded" };

    const duplicates = await OrgContract.aggregate([
        { $match: { contractStatus: { $in: ["active", "grace"] } } },
        { $group: { _id: "$organizationId", count: { $sum: 1 }, statuses: { $push: "$contractStatus" } } },
        { $match: { count: { $gt: 1 } } }
    ]);

    if (duplicates.length > 0) {
        return {
            pass: false,
            violation: "CONTRACT_SINGLE_ACTIVE",
            detail: `${duplicates.length} org(s) have >1 active/grace contract simultaneously`,
            violations: duplicates.map(d => ({
                orgId: d._id,
                count: d.count,
                statuses: d.statuses
            }))
        };
    }

    return { pass: true };
}

/**
 * LEDGER_APPEND_ONLY
 * Verifies that no BillingLedger document has been modified after creation.
 * The schema uses { timestamps: { createdAt: true, updatedAt: false } } so
 * `updatedAt` should never exist. We check for any document with updatedAt set.
 */
async function checkLedgerAppendOnly() {
    const BillingLedger = getBillingLedger();
    if (!BillingLedger) return { pass: true, skipped: "model not loaded" };

    // Check for any documents with updatedAt set (should be 0 in a clean ledger)
    const mutated = await BillingLedger.countDocuments({
        updatedAt: { $exists: true, $ne: null }
    });

    if (mutated > 0) {
        return {
            pass: false,
            violation: "LEDGER_APPEND_ONLY",
            detail: `${mutated} BillingLedger document(s) have updatedAt set — possible ledger mutation detected`
        };
    }

    return { pass: true };
}

/**
 * PLAN_VERSION_VALID
 * Ensures all active/grace/suspended contracts reference a PlanVersion that exists.
 * A dangling planVersionId (pointing to a deleted PlanVersion) would corrupt
 * entitlement resolution and renewal pricing.
 */
async function checkPlanVersionValid() {
    const OrgContract = getContract();
    const PlanVersion = getPlanVersion();
    if (!OrgContract || !PlanVersion) return { pass: true, skipped: "models not loaded" };

    // Only check non-terminal contracts with a planVersionId set
    const activeContracts = await OrgContract.find(
        {
            contractStatus: { $in: ["active", "grace", "suspended", "pending_activation"] },
            planVersionId: { $exists: true, $ne: null }
        },
        { _id: 1, planVersionId: 1, organizationId: 1, contractStatus: 1 }
    ).limit(5000).lean();

    if (activeContracts.length === 0) return { pass: true, checked: 0 };

    // Collect all unique planVersionIds referenced
    const pvIds = [...new Set(activeContracts.map(c => String(c.planVersionId)))];

    // Find which ones actually exist
    const existingIds = new Set(
        (await PlanVersion.find({ _id: { $in: pvIds } }, { _id: 1 }).lean())
            .map(p => String(p._id))
    );

    const violations = activeContracts.filter(c => !existingIds.has(String(c.planVersionId)));

    if (violations.length > 0) {
        return {
            pass: false,
            violation: "PLAN_VERSION_VALID",
            detail: `${violations.length} contract(s) reference a non-existent PlanVersion`,
            violations: violations.slice(0, 10).map(c => ({
                contractId: c._id,
                organizationId: c.organizationId,
                contractStatus: c.contractStatus,
                planVersionId: c.planVersionId
            }))
        };
    }

    return { pass: true, checked: activeContracts.length };
}

/**
 * LEDGER_HASH_CHAIN_VALID  (v21.1)
 * Traverses BillingLedger entries in chronological order per organization
 * and verifies that each entry's hash is consistent with its contents.
 *
 * Strategy:
 *   - Sample up to 100 organizations that have at least one hashed entry
 *   - For each org, fetch the most recent 500 hashed entries (oldest first)
 *   - Recompute each hash via verifyLedgerHash()
 *   - Report first 10 violations found
 *
 * Backward compatibility:
 *   - Entries with hash === null are pre-chain entries and are skipped.
 *   - The chain is only validated for entries that carry a hash value.
 */
async function checkLedgerHashChainValid() {
    const BillingLedger = getBillingLedger();
    if (!BillingLedger) return { pass: true, skipped: "model not loaded" };

    // Find orgs that have at least one hashed entry
    const orgs = await BillingLedger.distinct(
        "organizationId",
        { hash: { $ne: null, $exists: true } }
    ).then(r => r.slice(0, 100));   // cap at 100 orgs to bound runtime

    if (!orgs || orgs.length === 0) {
        return { pass: true, skipped: "no hashed entries found (pre-chain ledger)" };
    }

    const violations = [];
    let totalChecked = 0;

    for (const orgId of orgs) {
        if (violations.length >= 10) break;   // stop early once we have 10 violations

        // Fetch hashed entries for this org, oldest first
        const entries = await BillingLedger.find(
            { organizationId: orgId, hash: { $ne: null } },
            {
                hash: 1, previousHash: 1, eventType: 1, organizationId: 1,
                invoiceId: 1, amount: 1, currency: 1, source: 1, createdAt: 1
            }
        )
            .sort({ createdAt: 1 })
            .limit(500)
            .lean();

        for (const entry of entries) {
            if (violations.length >= 10) break;
            totalChecked++;

            const result = verifyLedgerHash(entry);
            if (result.skipped) continue;  // pre-chain entry, skip

            if (!result.valid) {
                violations.push({
                    organizationId: orgId,
                    ledgerId: entry._id,
                    eventType: entry.eventType,
                    createdAt: entry.createdAt,
                    expectedHash: result.expected,
                    actualHash: result.actual
                });
            }
        }
    }

    if (violations.length > 0) {
        return {
            pass: false,
            violation: "LEDGER_HASH_CHAIN_VALID",
            detail: `${violations.length} ledger entry/entries failed hash verification — possible tampering or data corruption`,
            checked: totalChecked,
            violations
        };
    }

    return { pass: true, checked: totalChecked, orgsScanned: orgs.length };
}

/**
 * REFUND_NOT_GREATER_THAN_PAYMENT  (v22.0)
 * Ensures no captured payment has been refunded more than its original amount.
 *
 * Strategy:
 *   - Aggregate PaymentAttempt records in 'captured' status
 *   - For each captured payment, sum all associated 'refunded'/'partially_refunded' PaymentAttempts
 *     by matching on providerPaymentId or a direct refundOfId reference
 *   - Flag any where totalRefunded > paymentAmount + 1-cent tolerance
 *
 * NOTE: Uses invoice.refundedAmountMinor vs totalAmountMinor as a surrogate
 * (simpler than joining PaymentAttempt records; catches over-refund at invoice level).
 */
async function checkRefundNotGreaterThanPayment() {
    const PlatformInvoice = getInvoice();
    if (!PlatformInvoice) return { pass: true, skipped: "model not loaded" };

    // Find invoices where refundedAmountMinor > totalAmountMinor (over-refunded)
    const overRefunded = await PlatformInvoice.find(
        {
            refundedAmountMinor: { $exists: true, $ne: null, $gt: 0 },
            $expr: { $gt: ["$refundedAmountMinor", { $add: ["$totalAmountMinor", 1] }] }
        },
        { invoiceNumber: 1, totalAmountMinor: 1, refundedAmountMinor: 1 }
    ).limit(100).lean();

    if (overRefunded.length > 0) {
        return {
            pass: false,
            violation: "REFUND_NOT_GREATER_THAN_PAYMENT",
            detail: `${overRefunded.length} invoice(s) have refundedAmount > totalAmount`,
            violations: overRefunded.map(i => ({
                invoiceId: i._id,
                invoiceNumber: i.invoiceNumber,
                totalAmountMinor: i.totalAmountMinor,
                refundedAmountMinor: i.refundedAmountMinor,
                excessMinor: (i.refundedAmountMinor - i.totalAmountMinor)
            }))
        };
    }

    return { pass: true };
}

module.exports = {
    checkInvoiceTotalMatch,
    checkPaymentNotGreaterThanInvoice,
    checkContractSingleActive,
    checkLedgerAppendOnly,
    checkPlanVersionValid,
    checkLedgerHashChainValid,
    checkRefundNotGreaterThanPayment  // v22.0
};
