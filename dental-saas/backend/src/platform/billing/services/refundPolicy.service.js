/**
 * refundPolicy.service.js
 * Sprint 7.2 — Policy-Driven Refund Eligibility Engine
 *
 * All refund eligibility decisions pass through validateRefundEligibility().
 * Policy is loaded from BillingSettings (DB singleton) — no hardcoded rules.
 *
 * Policy fields (added to BillingSettings in this sprint):
 *   refundWindowDays       — days after invoice payment within which refund is allowed
 *   allowAfterRecognition  — whether refunds are allowed after revenue recognition begins
 *   requireManualApproval  — always require manual approval regardless of amount
 *   largeRefundThreshold   — amount (decimal) above which manual approval is forced
 *   largeRefundRatioPct    — pct of contract value above which manual override required
 *   maxRefundsPerOrgDays   — window (days) for velocity check
 *   maxRefundsPerOrg       — max refunds per org within that window before flagging
 *
 * PLANE: Platform / Billing
 * COLLECTIONS: billingsettings, revenueschedules
 */

"use strict";

const { getBillingSettings } = require("./billingSettings.service");
const RevenueSchedule = require("../../finance/models/RevenueSchedule.model").default;
const PlatformInvoice = require("../models/PlatformInvoice.model").default;
const BillingAuditLog = require("../models/BillingAuditLog.model").default;
const logger = require("@utils/logger");

// ─── Default policy values (applied when BillingSettings fields absent) ────────
const POLICY_DEFAULTS = {
    refundWindowDays: 30,
    allowAfterRecognition: true,
    requireManualApproval: false,
    largeRefundThreshold: 1000,      // decimal units (e.g. $1000)
    largeRefundRatioPct: 50,         // 50% of contract lockedPrice
    maxRefundsPerOrg: 3,
    maxRefundsPerOrgDays: 30
};

// ─── validateRefundEligibility ────────────────────────────────────────────────
/**
 * Determines whether a refund is eligible, and whether it requires manual approval.
 *
 * @param {object} contract  — OrgContract document (lean or hydrated)
 * @param {object} invoice   — PlatformInvoice document (lean or hydrated)
 * @param {number} amount    — Refund amount in decimal units (e.g. 250.00)
 * @param {string} organizationId
 *
 * @returns {Promise<{
 *   allowed: boolean,
 *   requiresApproval: boolean,
 *   fraudFlag: boolean,
 *   reason: string|null,
 *   policy: object
 * }>}
 */
async function validateRefundEligibility(contract, invoice, amount, organizationId) {
    const settings = await getBillingSettings();

    // Merge with defaults for any fields not yet in BillingSettings
    const policy = {
        refundWindowDays: settings.refundWindowDays ?? POLICY_DEFAULTS.refundWindowDays,
        allowAfterRecognition: settings.allowAfterRecognition ?? POLICY_DEFAULTS.allowAfterRecognition,
        requireManualApproval: settings.requireManualApproval ?? POLICY_DEFAULTS.requireManualApproval,
        largeRefundThreshold: settings.largeRefundThreshold ?? POLICY_DEFAULTS.largeRefundThreshold,
        largeRefundRatioPct: settings.largeRefundRatioPct ?? POLICY_DEFAULTS.largeRefundRatioPct,
        maxRefundsPerOrg: settings.maxRefundsPerOrg ?? POLICY_DEFAULTS.maxRefundsPerOrg,
        maxRefundsPerOrgDays: settings.maxRefundsPerOrgDays ?? POLICY_DEFAULTS.maxRefundsPerOrgDays
    };

    // ── Rule 1: Invoice must be paid ─────────────────────────────────────────
    if (invoice.status !== "paid") {
        return _deny(`Invoice is not in paid status (current: ${invoice.status}). Only paid invoices can be refunded.`, policy);
    }

    // ── Rule 2: Within refund window ─────────────────────────────────────────
    const paidAt = invoice.paidAt || invoice.updatedAt || invoice.createdAt;
    const windowCutoff = new Date(paidAt.getTime() + policy.refundWindowDays * 86_400_000);
    if (new Date() > windowCutoff) {
        return _deny(
            `Refund window of ${policy.refundWindowDays} days has expired. Invoice was paid on ${paidAt.toISOString()}.`,
            policy
        );
    }

    // ── Rule 3: Revenue recognition check ────────────────────────────────────
    let recognitionStarted = false;
    let recognizedAmount = 0;
    const schedule = await RevenueSchedule.findOne({ invoiceId: invoice._id }).lean();
    if (schedule && schedule.recognizedAmount > 0) {
        recognitionStarted = true;
        recognizedAmount = schedule.recognizedAmount;
    }

    if (recognitionStarted && !policy.allowAfterRecognition) {
        return _deny(
            `Revenue recognition has already begun (${recognizedAmount} recognized). ` +
            `Platform policy prohibits refunds after recognition starts.`,
            policy
        );
    }

    // ── Rule 4 & 5: Approval requirements (not denial reasons) ───────────────
    let requiresApproval = policy.requireManualApproval;
    let fraudFlag = false;

    // Large refund threshold
    if (amount > policy.largeRefundThreshold) {
        requiresApproval = true;
        logger.info({ amount, threshold: policy.largeRefundThreshold, organizationId },
            "[RefundPolicy] Large refund threshold exceeded — manual approval required");
    }

    // Percentage guardrail
    const contractValue = contract.lockedPrice || 0;
    if (contractValue > 0 && (amount / contractValue) * 100 > policy.largeRefundRatioPct) {
        requiresApproval = true;
        logger.info({ pct: ((amount / contractValue) * 100).toFixed(1), organizationId },
            "[RefundPolicy] Refund exceeds ratio threshold — manual approval required");
    }

    // ── Rule 6: Velocity check (fraud guard) ─────────────────────────────────
    const velocityWindowStart = new Date(Date.now() - policy.maxRefundsPerOrgDays * 86_400_000);
    const recentRefundCount = await BillingAuditLog.countDocuments({
        organizationId,
        eventType: "REFUND_APPROVED",
        createdAt: { $gte: velocityWindowStart }
    });

    if (recentRefundCount >= policy.maxRefundsPerOrg) {
        fraudFlag = true;
        requiresApproval = true;
        logger.warn({ recentRefundCount, limit: policy.maxRefundsPerOrg, organizationId },
            "[RefundPolicy] Refund velocity limit reached — fraud flag triggered");
    }

    return {
        allowed: true,
        requiresApproval,
        fraudFlag,
        recognitionStarted,
        recognizedAmount,
        reason: null,
        policy
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _deny(reason, policy) {
    return { allowed: false, requiresApproval: false, fraudFlag: false, reason, policy };
}

module.exports = { validateRefundEligibility, POLICY_DEFAULTS };
