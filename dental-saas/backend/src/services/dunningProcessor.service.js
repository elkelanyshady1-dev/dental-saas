/**
 * dunningProcessor.service.js
 * Sprint 7 — Hourly Dunning Retry Engine
 *
 * processDunningContracts()
 *
 * Runs every hour. Finds contracts in dunning (dunning.nextRetryAt <= now)
 * and retries the charge according to the BillingSettings retryScheduleDays array.
 *
 * Logic per contract:
 *   1) Load BillingSettings for current retry schedule
 *   2) Attempt charge via PaymentProvider
 *   3) SUCCESS → mark invoice paid, copy contract for new period, clear dunning
 *   4) FAILURE:
 *        IF retryCount < maxRetries → advance to next retry slot
 *        IF retryCount >= maxRetries → stop retrying (grace enforcer will suspend)
 *
 * Grace period enforcement is handled separately by gracePeriod.service.js.
 *
 * PLANE: services/ (accessible to cron jobs)
 * COLLECTIONS: orgcontracts, platforminvoices, organizations
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const OrgContractDef = require("../platform/billing/models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const PlatformInvoiceDef = require("../platform/billing/models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const OrganizationDef = require("../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const PlatformNotificationDef = require("../platform/models/PlatformNotification");
let _PlatformNotification_cache = null;
function PlatformNotification() {
    return _PlatformNotification_cache || (_PlatformNotification_cache = getPlatformModel(PlatformNotificationDef));
}
const {
  getBillingSettings
} = require("../platform/billing/services/billingSettings.service");
const {
  logBillingEvent
} = require("../platform/billing/services/billingAuditLog.service");
const auditService = require("./auditService");
const logger = require("../utils/logger");
const SYSTEM_ACTOR = "000000000000000000000000";
function addDays(date, n) {
  return new Date(date.getTime() + n * 86_400_000);
}

// ─── processDunningContracts ───────────────────────────────────────────────────
/**
 * Hourly cron entry point.
 * Finds contracts with dunning.nextRetryAt <= now and retryCount < maxRetries.
 *
 * @returns {Promise<{ retried: number, recovered: number, exhausted: number, errors: number }>}
 */
async function processDunningContracts() {
  const settings = await getBillingSettings();
  const now = new Date();
  logger.info({
    action: "dunning_scan_start",
    now
  }, "[DunningProcessor] Starting dunning scan");

  // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
  const dueCAndContracts = await OrgContract().find({
    contractStatus: "active",
    "dunning.nextRetryAt": {
      $lte: now
    },
    "dunning.retryCount": {
      $lt: settings.maxRetries
    }
  }).lean();
  logger.info({
    count: dueCAndContracts.length
  }, "[DunningProcessor] Contracts due for retry");
  const stats = {
    retried: 0,
    recovered: 0,
    exhausted: 0,
    errors: 0
  };
  for (const contract of dueCAndContracts) {
    try {
      const result = await _processRetry(contract, {
        now,
        settings
      });
      if (result === "recovered") stats.recovered++;
      if (result === "retried") stats.retried++;
      if (result === "exhausted") stats.exhausted++;
    } catch (err) {
      stats.errors++;
      logger.error({
        err,
        contractId: contract._id
      }, "[DunningProcessor] Retry error");
    }
  }
  logger.info(stats, "[DunningProcessor] Dunning scan complete");
  return stats;
}

// ─── _processRetry ────────────────────────────────────────────────────────────
async function _processRetry(contract, {
  now,
  settings
}) {
  // Find the open invoice for this contract's current billing cycle
  // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
  const invoice = await PlatformInvoice().findOne({
    contractId: contract._id,
    status: "open"
  });
  if (!invoice) {
    logger.info({
      contractId: contract._id
    }, "[DunningProcessor] No open invoice found for dunning contract — clearing dunning");
    await OrgContract().findByIdAndUpdate(contract._id, {
      $set: {
        dunning: null
      }
    });
    return "retried";
  }

  // Attempt charge
  let chargeResult = null;
  let chargeError = null;
  if (contract.paymentProvider && contract.providerSubscriptionId) {
    try {
      const {
        getProvider
      } = require("../platform/billing/providers/paymentProviderFactory");
      const provider = getProvider(contract.paymentProvider);
      chargeResult = await provider.chargeSubscription({
        subscriptionId: contract.providerSubscriptionId,
        amountMinor: invoice.totalAmountMinor,
        currency: invoice.currency,
        metadata: {
          contractId: contract._id.toString(),
          invoiceId: invoice._id.toString()
        }
      });
    } catch (err) {
      chargeError = err;
      logger.warn({
        err,
        contractId: contract._id
      }, "[DunningProcessor] Charge attempt failed");
    }
  } else {
    chargeError = new Error("No payment provider");
  }
  if (chargeResult?.status === "succeeded" || chargeResult?.status === "paid") {
    return _onDunningRecovered(contract, invoice, {
      now,
      chargeResult
    });
  } else {
    return _onDunningRetryFailed(contract, invoice, {
      now,
      settings,
      chargeError
    });
  }
}

// ─── _onDunningRecovered ──────────────────────────────────────────────────────
async function _onDunningRecovered(contract, invoice, {
  now,
  chargeResult
}) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
    const lc = await OrgContract().findById(contract._id).session(session);
    // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
    const lInv = await PlatformInvoice().findById(invoice._id).session(session);
    if (!lc || !lInv) {
      await session.abortTransaction();
      session.endSession();
      return "retried";
    }

    // Mark invoice paid
    lInv.status = "paid";
    lInv.paidAt = now;
    lInv.providerPaymentId = chargeResult.providerPaymentId || lInv.providerPaymentId;
    await lInv.save({
      session
    });

    // Create new contract for next period (same commercial terms)
    const billingEnd = lInv.billingCycleEnd;
    const newContract = new (OrgContract())({
      organizationId: lc.organizationId,
      planVersionId: lc.planVersionId,
      planCode: lc.planCode,
      planVersionTag: lc.planVersionTag,
      contractStatus: "active",
      effectiveFrom: lInv.billingCycleStart,
      effectiveTo: billingEnd,
      lockedPrice: lc.lockedPrice,
      currency: lc.currency,
      autoRenew: lc.autoRenew,
      salesManaged: lc.salesManaged,
      gracePeriodDays: lc.gracePeriodDays,
      creditBalance: 0,
      renewalTerms: lc.renewalTerms,
      pricingOverride: lc.pricingOverride,
      appliedCoupon: lc.appliedCoupon,
      salesOwnerId: lc.salesOwnerId,
      paymentProvider: lc.paymentProvider,
      providerSubscriptionId: lc.providerSubscriptionId,
      activatingInvoiceId: lInv._id,
      dunning: null,
      createdBy: SYSTEM_ACTOR,
      metadata: new Map([["source", "dunningProcessor.service"]])
    });
    await newContract.save({
      session
    });

    // Supersede old contract
    await OrgContract().findByIdAndUpdate(lc._id, {
      $set: {
        contractStatus: "superseded",
        supersededById: newContract._id,
        supersededAt: now,
        dunning: null
      }
    }, {
      session
    });

    // Update org pointer
    await Organization().findByIdAndUpdate(lc.organizationId, {
      $set: {
        currentContractId: newContract._id,
        status: "active"
      }
    }, {
      session
    });
    await _audit({
      organizationId: lc.organizationId,
      action: "DUNNING_PAYMENT_RECOVERED",
      entity: "PLATFORM_INVOICE",
      entityId: lInv._id,
      details: {
        oldContractId: lc._id,
        newContractId: newContract._id
      }
    }, session);
    await session.commitTransaction();
    session.endSession();

    // BillingAuditLog — DUNNING_RECOVERED + ORG_REACTIVATED (post-transaction, non-fatal)
    try {
      await logBillingEvent({
        organizationId: lc.organizationId,
        contractId: newContract._id,
        invoiceId: lInv._id,
        eventType: "DUNNING_RECOVERED",
        performedBy: SYSTEM_ACTOR,
        metadata: {
          oldContractId: lc._id.toString(),
          recoveredAt: now.toISOString()
        }
      });
      await logBillingEvent({
        organizationId: lc.organizationId,
        contractId: newContract._id,
        eventType: "ORG_REACTIVATED",
        performedBy: SYSTEM_ACTOR,
        metadata: {
          source: "dunningProcessor",
          invoiceId: lInv._id.toString()
        }
      });
    } catch (auditErr) {
      logger.warn({
        auditErr,
        contractId: newContract._id
      }, "[DunningProcessor] BillingAuditLog write failed (non-fatal)");
    }
    logger.info({
      contractId: lc._id,
      invoiceId: lInv._id
    }, "[DunningProcessor] Payment recovered — org reactivated");
    return "recovered";
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// ─── _onDunningRetryFailed ────────────────────────────────────────────────────
async function _onDunningRetryFailed(contract, invoice, {
  now,
  settings,
  chargeError
}) {
  const currentRetryCount = contract.dunning?.retryCount || 0;
  const nextRetryCount = currentRetryCount + 1;
  const failureReason = chargeError?.message || "provider_declined";
  const {
    retryScheduleDays,
    maxRetries
  } = settings;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
    const lc = await OrgContract().findById(contract._id).session(session);
    // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
    const lInv = await PlatformInvoice().findById(invoice._id).session(session);
    if (!lc || !lInv) {
      await session.abortTransaction();
      session.endSession();
      return "retried";
    }
    let newDunning;
    if (nextRetryCount >= maxRetries) {
      // Exhausted — stop retrying, wait for gracePeriodEndsAt to trigger suspension
      newDunning = {
        retryCount: nextRetryCount,
        nextRetryAt: null,
        // no more retries — grace enforcer will suspend
        gracePeriodEndsAt: lc.dunning?.gracePeriodEndsAt || addDays(now, 1),
        suspendedAt: null,
        lastFailureReason: failureReason
      };
      await PlatformNotification().create([{
        type: "RETRY_EXHAUSTED",
        title: "Payment Retries Exhausted",
        organizationId: lc.organizationId,
        severity: "critical",
        message: `Contract ${lc._id}: all ${maxRetries} payment retries exhausted.`
      }], {
        session
      });
    } else {
      // Advance to next slot in retryScheduleDays
      const nextDayOffset = retryScheduleDays[nextRetryCount] || retryScheduleDays[retryScheduleDays.length - 1];
      const nextRetryAt = addDays(lc.dunning?.gracePeriodEndsAt ? new Date(lc.dunning.gracePeriodEndsAt.getTime() - settings.gracePeriodDays * 86_400_000) : now, nextDayOffset);
      newDunning = {
        retryCount: nextRetryCount,
        nextRetryAt,
        gracePeriodEndsAt: lc.dunning?.gracePeriodEndsAt,
        suspendedAt: null,
        lastFailureReason: failureReason
      };
    }
    lInv.retryCount = nextRetryCount;
    lInv.lastRetryAt = now;
    lInv.nextRetryAt = newDunning.nextRetryAt;
    await lInv.save({
      session
    });
    await OrgContract().findByIdAndUpdate(lc._id, {
      $set: {
        dunning: newDunning
      }
    }, {
      session
    });
    await _audit({
      organizationId: lc.organizationId,
      action: nextRetryCount >= maxRetries ? "DUNNING_EXHAUSTED" : "DUNNING_RETRY_SCHEDULED",
      entity: "PLATFORM_INVOICE",
      entityId: lInv._id,
      details: {
        retryCount: nextRetryCount,
        nextRetryAt: newDunning.nextRetryAt,
        reason: failureReason
      }
    }, session);
    await session.commitTransaction();
    session.endSession();

    // BillingAuditLog — RETRY_ATTEMPT for each attempt in the dunning cycle
    try {
      await logBillingEvent({
        organizationId: lc.organizationId,
        contractId: lc._id,
        invoiceId: lInv._id,
        eventType: "RETRY_ATTEMPT",
        performedBy: SYSTEM_ACTOR,
        metadata: {
          retryCount: nextRetryCount,
          maxRetries,
          exhausted: nextRetryCount >= maxRetries,
          nextRetryAt: newDunning.nextRetryAt?.toISOString() || null,
          failureReason
        }
      });
    } catch (auditErr) {
      logger.warn({
        auditErr,
        contractId: lc._id
      }, "[DunningProcessor] BillingAuditLog RETRY_ATTEMPT write failed (non-fatal)");
    }
    logger.warn({
      contractId: lc._id,
      retryCount: nextRetryCount
    }, `[DunningProcessor] Retry ${nextRetryCount >= maxRetries ? "exhausted" : "scheduled"}`);
    return nextRetryCount >= maxRetries ? "exhausted" : "retried";
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// ─── reactivateOnPayment ──────────────────────────────────────────────────────
/**
 * Called by canonicalEventProcessor when payment.succeeded arrives
 * for a contract that was in dunning/suspended state.
 *
 * @param {string} invoiceId - PlatformInvoice._id
 */
async function reactivateOnPayment(invoiceId) {
  // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
  const invoice = await PlatformInvoice().findById(invoiceId);
  if (!invoice || !invoice.contractId) return;

  // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
  const contract = await OrgContract().findById(invoice.contractId);
  if (!contract) return;
  const wasInDunning = !!contract.dunning;
  const wasSuspended = !!contract.dunning?.suspendedAt;
  const wasExpired = contract.contractStatus === "expired";
  if (!wasInDunning && !wasSuspended && !wasExpired) return;
  const now = new Date();
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Mark invoice paid (idempotent)
    // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
    const lInv = await PlatformInvoice().findById(invoice._id).session(session);
    if (lInv && lInv.status !== "paid") {
      lInv.status = "paid";
      lInv.paidAt = now;
      await lInv.save({
        session
      });
    }

    // Reactivate contract if expired or in dunning
    // @rls-platform-cron — cross-org dunning workflow, no org-scoped req
    const lc = await OrgContract().findById(contract._id).session(session);
    if (lc) {
      lc.contractStatus = "active";
      lc.dunning = null;
      await lc.save({
        session
      });
    }

    // Reactivate organization
    if (wasSuspended || wasExpired) {
      await Organization().findByIdAndUpdate(contract.organizationId, {
        $set: {
          status: "active"
        }
      }, {
        session
      });
    }
    await _audit({
      organizationId: contract.organizationId,
      action: "CONTRACT_REACTIVATED_ON_PAYMENT",
      entity: "ORG_CONTRACT",
      entityId: contract._id,
      details: {
        invoiceId,
        wasInDunning,
        wasSuspended,
        wasExpired
      }
    }, session);
    await session.commitTransaction();
    session.endSession();
    logger.info({
      contractId: contract._id,
      invoiceId
    }, "[DunningProcessor] Contract reactivated on payment");
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    logger.error({
      err,
      contractId: contract._id
    }, "[DunningProcessor] Reactivation failed");
  }
}

// ─── Audit helper ─────────────────────────────────────────────────────────────
async function _audit({
  organizationId,
  action,
  entity,
  entityId,
  details
}, session = null) {
  try {
    await auditService.createAuditRecord({
      organizationId,
      branchId: SYSTEM_ACTOR,
      actorId: SYSTEM_ACTOR,
      actorType: "system",
      action,
      entity,
      entityId,
      details,
      ipAddress: "system",
      userAgent: "DunningProcessor"
    }, session);
  } catch (err) {
    logger.error({
      err,
      action
    }, "[DunningProcessor] Audit write failed (non-fatal)");
  }
}
module.exports = {
  processDunningContracts,
  reactivateOnPayment
};