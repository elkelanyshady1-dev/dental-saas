/**
 * contractRenewal.service.js
 * Sprint 7 — Production-Grade Hybrid Renewal Engine (DB-driven settings)
 *
 * Entry point: renewExpiringContracts()
 *
 * Renewal decision tree for each expired active contract:
 *
 *   ┌─ autoRenew === false  OR  contractStatus === "canceled"
 *   │    → mark contractStatus = "expired"   (no invoice, no charge)
 *   │
 *   ├─ autoRenew === true  AND  salesManaged === true
 *   │    → Generate PlatformInvoice (status = "open" / issued)
 *   │    → set dunning.gracePeriodEndsAt = now + settings.gracePeriodDays
 *   │    → DO NOT charge — sales team follows up
 *   │
 *   └─ autoRenew === true  AND  salesManaged === false (self-service)
 *        → PaymentProvider.charge()
 *        ├─ SUCCESS → mark invoice paid, create new OrgContract
 *        └─ FAIL   → PlatformInvoice status="open"
 *                    dunning.retryCount = 1
 *                    dunning.nextRetryAt = now + retryScheduleDays[0]
 *                    dunning.gracePeriodEndsAt = now + gracePeriodDays
 *                    → DunningProcessor picks up on next hourly tick
 *
 * Settings sourced from: BillingSettings (DB singleton)
 * PLANE: services/ (accessible to cron jobs)
 * COLLECTIONS: orgcontracts, platforminvoices, organizations
 *
 * INVARIANTS:
 *   - Zero references to subscription.currentPeriodEnd
 *   - Zero references to BillingInvoice / billinginvoices
 *   - All financial operations wrapped in MongoDB transactions
 *   - Idempotent per (contractId × billingPeriodStart)
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const OrgContractDef = require("../platform/billing/models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const PlatformInvoiceDef = require("../platform/billing/models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const OrganizationDef = require("../shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const PlatformConfigDef = require("../platform/models/PlatformConfig");
const PlatformConfig = getPlatformModel(PlatformConfigDef);
const PlatformNotificationDef = require("../platform/models/PlatformNotification");
const PlatformNotification = getPlatformModel(PlatformNotificationDef);
const {
  getBillingSettings
} = require("../platform/billing/services/billingSettings.service");
const {
  logBillingEvent
} = require("../platform/billing/services/billingAuditLog.service");
const auditService = require("./auditService");
const logger = require("../utils/logger");
// Sprint 8: BillingTimeline projection
const {
  emitBillingTimelineEvent
} = require("../platform/billing/services/billingTimeline.service");
// Sprint 1: Renewal Ledger — immutable financial audit trail
const {
  writeLedgerEntry
} = require("../platform/billing/models/BillingLedger.model");
// Sprint 3: Correlation ID for distributed tracing
const {
  randomUUID
} = require("crypto");

// ─── Constants (fallbacks if BillingSettings absent) ──────────────────────────
const SYSTEM_ACTOR = "000000000000000000000000";

// ─── Helpers ───────────────────────────────────────────────────────────────────

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function addDays(date, n) {
  return new Date(date.getTime() + n * 86_400_000);
}
function intervalMonths(contract) {
  switch (contract.renewalTerms?.billingInterval) {
    case "yearly":
      return 12;
    case "biennial":
      return 24;
    default:
      return 1;
  }
}
function calculateRenewalPrice(contract, now) {
  let basePrice = contract.lockedPrice;
  const inflationPct = contract.renewalTerms?.inflationPercent || 0;
  const inflationApplied = basePrice * (inflationPct / 100);
  basePrice += inflationApplied;
  let couponDiscount = 0;
  let validCoupon = false;
  const coupon = contract.appliedCoupon;
  if (coupon?.code) {
    const notExpired = !coupon.validUntil || now <= new Date(coupon.validUntil);
    const hasUses = !coupon.maxUses || coupon.usedCount < coupon.maxUses;
    if (notExpired && hasUses) {
      validCoupon = true;
      couponDiscount = coupon.discountType === "percentage" ? basePrice * (coupon.discountValue / 100) : coupon.discountValue;
    }
  }
  const finalAmount = Math.max(0, basePrice - couponDiscount);
  return {
    finalAmount,
    totalMinor: Math.round(finalAmount * 100),
    baseMinor: Math.round(contract.lockedPrice * 100),
    inflationApplied,
    couponDiscount,
    validCoupon
  };
}
function _buildLineItems(contract, price) {
  const {
    finalAmount,
    totalMinor,
    baseMinor,
    couponDiscount,
    validCoupon
  } = price;
  return {
    lineItems: [{
      description: `Plan: ${contract.planCode} (${contract.planVersionTag})`,
      quantity: 1,
      unitPrice: contract.lockedPrice,
      unitPriceMinor: baseMinor,
      total: contract.lockedPrice,
      totalMinor: baseMinor,
      type: "plan"
    }],
    basePlanAmount: contract.lockedPrice,
    basePlanAmountMinor: baseMinor,
    couponCode: validCoupon ? contract.appliedCoupon?.code : null,
    couponDiscountAmount: couponDiscount,
    couponDiscountAmountMinor: Math.round(couponDiscount * 100),
    creditApplied: 0,
    creditAppliedMinor: 0,
    subtotalAmount: finalAmount,
    subtotalAmountMinor: totalMinor,
    taxPercent: 0,
    taxAmount: 0,
    taxAmountMinor: 0,
    totalAmount: finalAmount,
    totalAmountMinor: totalMinor
  };
}
async function _writeAudit({
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
      userAgent: "ContractRenewalEngine"
    }, session);
  } catch (err) {
    logger.error({
      err,
      action
    }, "[ContractRenewal] Audit write failed (non-fatal)");
  }
}

// ─── renewExpiringContracts ────────────────────────────────────────────────────
/**
 * Main cron entry point — runs daily at midnight.
 * Scans all active OrgContracts whose effectiveTo <= now.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.correlationId]  — Trace ID for distributed log correlation.
 *                                          Auto-generated (UUID) if not supplied.
 *                                          Appears in every log line emitted by this run.
 */
async function renewExpiringContracts(opts = {}) {
  const correlationId = opts.correlationId || randomUUID();
  const settings = await getBillingSettings();
  const now = new Date();
  logger.info({
    action: "renewal_scan_start",
    now,
    correlationId
  }, "[ContractRenewal] Starting renewal scan");

  // @rls-platform-cron — cross-org contract lifecycle processing, no org-scoped req
  const expiredContracts = await OrgContract.find({
    contractStatus: "active",
    effectiveTo: {
      $lte: now
    },
    // TDS: Exclude trial contracts — their lifecycle is owned exclusively by trialActivation.job.
    // If trialActivation.job misses a run, trial contracts must NOT be expired here
    // as that would orphan any pending_activation contract waiting to become active.
    trialDays: {
      $not: {
        $gt: 0
      }
    }
  }).lean();
  logger.info({
    count: expiredContracts.length,
    correlationId
  }, "[ContractRenewal] Contracts due for renewal");
  const stats = {
    processed: 0,
    expired: 0,
    invoiced: 0,
    charged: 0,
    failed: 0,
    errors: 0
  };
  for (const contract of expiredContracts) {
    stats.processed++;
    try {
      const result = await _processOne(contract, {
        now,
        settings,
        correlationId
      });
      stats[result] = (stats[result] || 0) + 1;
    } catch (err) {
      stats.errors++;
      logger.error({
        err,
        contractId: contract._id,
        orgId: contract.organizationId,
        correlationId
      }, "[ContractRenewal] Unhandled error");
    }
  }
  logger.info({
    ...stats,
    correlationId
  }, "[ContractRenewal] Renewal scan complete");
  return stats;
}

// ─── _processOne ───────────────────────────────────────────────────────────────
async function _processOne(contract, {
  now,
  settings,
  correlationId
}) {
  // Gate 1: autoRenew=false or canceled → expire immediately
  if (!contract.autoRenew || contract.contractStatus === "canceled") {
    await OrgContract.findByIdAndUpdate(contract._id, {
      $set: {
        contractStatus: "expired",
        terminatedAt: now,
        terminationReason: contract.autoRenew === false ? "auto_renew_disabled" : "contract_canceled"
      }
    });
    await _writeAudit({
      organizationId: contract.organizationId,
      action: "CONTRACT_EXPIRED",
      entity: "ORG_CONTRACT",
      entityId: contract._id,
      details: {
        reason: "autoRenew_false_or_canceled",
        correlationId
      }
    });

    // BillingAuditLog — centralized billing forensic trail
    try {
      await logBillingEvent({
        organizationId: contract.organizationId,
        contractId: contract._id,
        eventType: "CONTRACT_EXPIRED",
        performedBy: SYSTEM_ACTOR,
        metadata: {
          reason: contract.autoRenew === false ? "auto_renew_disabled" : "contract_canceled",
          correlationId
        }
      });
    } catch (auditErr) {
      logger.warn({
        auditErr,
        contractId: contract._id,
        correlationId
      }, "[ContractRenewal] BillingAuditLog write failed (non-fatal)");
    }
    logger.info({
      contractId: contract._id,
      correlationId
    }, "[ContractRenewal] Expired — autoRenew=false");
    return "expired";
  }

  // Idempotency check
  const months = intervalMonths(contract);
  const billingStart = new Date(contract.effectiveTo);
  const billingEnd = addMonths(billingStart, months);
  const idempotencyKey = `renewal-${contract._id}-${billingStart.toISOString().slice(0, 10)}`;

  // @rls-platform-cron — cross-org contract lifecycle processing, no org-scoped req
  const existing = await PlatformInvoice.findOne({
    idempotencyKey
  }).lean();
  if (existing) {
    logger.info({
      contractId: contract._id,
      invoiceId: existing._id,
      correlationId
    }, "[ContractRenewal] Idempotent skip");
    return "invoiced";
  }
  const price = calculateRenewalPrice(contract, now);
  const gracePeriodEndsAt = addDays(now, settings.gracePeriodDays);

  // Gate 2: Sales-managed → invoice-only
  if (contract.salesManaged) {
    return _handleSalesManaged(contract, {
      billingStart,
      billingEnd,
      price,
      idempotencyKey,
      now,
      gracePeriodEndsAt,
      settings,
      correlationId
    });
  }

  // Gate 3: Self-service → attempt charge
  return _handleSelfService(contract, {
    billingStart,
    billingEnd,
    price,
    idempotencyKey,
    now,
    gracePeriodEndsAt,
    settings,
    correlationId
  });
}

// ─── _handleSalesManaged ──────────────────────────────────────────────────────
async function _handleSalesManaged(contract, {
  billingStart,
  billingEnd,
  price,
  idempotencyKey,
  now,
  gracePeriodEndsAt,
  settings,
  correlationId
}) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // @rls-platform-cron — cross-org contract lifecycle processing, no org-scoped req
    const lc = await OrgContract.findById(contract._id).session(session);
    if (!lc || lc.contractStatus !== "active") {
      await session.abortTransaction();
      session.endSession();
      return "expired";
    }
    const invoice = new PlatformInvoice({
      organizationId: contract.organizationId,
      contractId: contract._id,
      planVersionId: contract.planVersionId || null,
      invoiceType: "subscription",
      billingCycleStart: billingStart,
      billingCycleEnd: billingEnd,
      dueDate: gracePeriodEndsAt,
      currency: contract.currency,
      ..._buildLineItems(contract, price),
      status: "open",
      paidAt: null,
      retryCount: 0,
      maxRetries: settings.maxRetries,
      nextRetryAt: null,
      // sales-managed: no auto-retry
      idempotencyKey,
      metadata: new Map([["renewalMode", "sales_managed"], ["planCode", contract.planCode], ["correlationId", correlationId]])
    });
    await invoice.save({
      session
    });

    // Set dunning state on contract: grace window only
    await OrgContract.findByIdAndUpdate(lc._id, {
      $set: {
        effectiveTo: gracePeriodEndsAt,
        dunning: {
          retryCount: 0,
          nextRetryAt: null,
          gracePeriodEndsAt,
          suspendedAt: null,
          lastFailureReason: "sales_managed_awaiting_payment"
        }
      }
    }, {
      session
    });
    await _writeAudit({
      organizationId: contract.organizationId,
      action: "CONTRACT_INVOICE_GENERATED_SALES_MANAGED",
      entity: "PLATFORM_INVOICE",
      entityId: invoice._id,
      details: {
        contractId: contract._id,
        totalAmountMinor: price.totalMinor,
        gracePeriodEndsAt,
        correlationId
      }
    }, session);
    await session.commitTransaction();
    session.endSession();
    logger.info({
      contractId: contract._id,
      invoiceId: invoice._id,
      correlationId
    }, "[ContractRenewal] Sales-managed invoice issued");
    return "invoiced";
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// ─── _handleSelfService ───────────────────────────────────────────────────────
async function _handleSelfService(contract, {
  billingStart,
  billingEnd,
  price,
  idempotencyKey,
  now,
  gracePeriodEndsAt,
  settings,
  correlationId
}) {
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
        amountMinor: price.totalMinor,
        currency: contract.currency,
        metadata: {
          contractId: contract._id.toString(),
          idempotencyKey,
          correlationId
        }
      });
    } catch (err) {
      chargeError = err;
      logger.warn({
        err,
        contractId: contract._id
      }, "[ContractRenewal] Charge failed");
    }
  } else {
    chargeError = new Error("No payment provider configured");
    logger.warn({
      contractId: contract._id,
      correlationId
    }, "[ContractRenewal] No provider — entering dunning");
  }
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // @rls-platform-cron — cross-org contract lifecycle processing, no org-scoped req
    const lc = await OrgContract.findById(contract._id).session(session);
    if (!lc || lc.contractStatus !== "active") {
      await session.abortTransaction();
      session.endSession();
      return "expired";
    }
    if (chargeResult?.status === "succeeded" || chargeResult?.status === "paid") {
      // ── SUCCESS PATH ─────────────────────────────────────────────────────
      const invoice = new PlatformInvoice({
        organizationId: contract.organizationId,
        contractId: contract._id,
        planVersionId: contract.planVersionId || null,
        invoiceType: "subscription",
        billingCycleStart: billingStart,
        billingCycleEnd: billingEnd,
        dueDate: now,
        currency: contract.currency,
        ..._buildLineItems(lc, price),
        status: "paid",
        paidAt: now,
        providerPaymentId: chargeResult.providerPaymentId || null,
        retryCount: 0,
        maxRetries: settings.maxRetries,
        nextRetryAt: null,
        idempotencyKey,
        metadata: new Map([["renewalMode", "self_service"], ["planCode", lc.planCode], ["correlationId", correlationId]])
      });
      await invoice.save({
        session
      });

      // Create new contract for next period
      const newContract = new OrgContract({
        organizationId: lc.organizationId,
        planVersionId: lc.planVersionId,
        planCode: lc.planCode,
        planVersionTag: lc.planVersionTag,
        contractStatus: "active",
        effectiveFrom: billingStart,
        effectiveTo: billingEnd,
        // Sprint 8: sync nextBillingDate = effectiveTo for scheduler queries
        nextBillingDate: billingEnd,
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
        activatingInvoiceId: invoice._id,
        dunning: null,
        createdBy: SYSTEM_ACTOR,
        metadata: new Map([["source", "contractRenewal.service"]])
      });
      await newContract.save({
        session
      });
      await OrgContract.findByIdAndUpdate(lc._id, {
        $set: {
          contractStatus: "superseded",
          supersededById: newContract._id,
          supersededAt: now
        }
      }, {
        session
      });
      await Organization.findByIdAndUpdate(lc.organizationId, {
        $set: {
          currentContractId: newContract._id
        }
      }, {
        session
      });
      if (price.validCoupon) {
        await OrgContract.findByIdAndUpdate(newContract._id, {
          $inc: {
            "appliedCoupon.usedCount": 1
          }
        }, {
          session
        });
      }
      await _writeAudit({
        organizationId: contract.organizationId,
        action: "CONTRACT_RENEWAL_SUCCESS",
        entity: "PLATFORM_INVOICE",
        entityId: invoice._id,
        details: {
          oldContractId: lc._id,
          newContractId: newContract._id,
          totalAmountMinor: price.totalMinor
        }
      }, session);

      // ── Renewal Ledger Entry ───────────────────────────────────────────────
      // Written INSIDE the same transaction (same session) so it is atomic with
      // the invoice + new contract writes. If the transaction aborts, this entry
      // is also rolled back — preventing phantom ledger entries on failure.
      // writeLedgerEntry silently swallows errors (non-fatal) but we also log
      // structured errors here to alert the finance team.
      try {
        await writeLedgerEntry({
          eventType: "renewal.completed",
          organizationId: lc.organizationId,
          contractId: newContract._id,
          invoiceId: invoice._id,
          provider: lc.paymentProvider || "internal",
          amount: invoice.totalAmountMinor,
          currency: invoice.currency,
          source: "contractRenewal",
          actorType: "system",
          metadata: {
            previousContractId: lc._id.toString(),
            newContractId: newContract._id.toString(),
            invoiceId: invoice._id.toString(),
            renewalDate: now.toISOString(),
            billingPeriodStart: billingStart.toISOString(),
            billingPeriodEnd: billingEnd.toISOString(),
            priceMinor: price.totalMinor,
            currency: lc.currency,
            correlationId
          }
        }, session);
      } catch (ledgerErr) {
        logger.error({
          err: ledgerErr,
          contractId: newContract._id,
          invoiceId: invoice._id
        }, "[ContractRenewal] renewal.completed ledger entry failed (non-fatal)");
      }
      try {
        await logBillingEvent({
          organizationId: contract.organizationId,
          contractId: newContract._id,
          invoiceId: invoice._id,
          eventType: "CONTRACT_RENEWED",
          performedBy: SYSTEM_ACTOR,
          metadata: {
            oldContractId: lc._id.toString(),
            renewalDate: now.toISOString(),
            totalAmountMinor: price.totalMinor,
            currency: lc.currency,
            correlationId
          }
        });
      } catch (auditErr) {
        logger.warn({
          auditErr,
          contractId: newContract._id
        }, "[ContractRenewal] BillingAuditLog write failed (non-fatal)");
      }
      await session.commitTransaction();
      session.endSession();
      logger.info({
        oldContractId: lc._id,
        newContractId: newContract._id,
        correlationId
      }, "[ContractRenewal] Self-service renewal succeeded");

      // Sprint 8: BillingTimeline — RENEWAL_COMPLETED (non-blocking)
      setImmediate(async () => {
        await emitBillingTimelineEvent({
          organizationId: String(lc.organizationId),
          contractId: String(newContract._id),
          invoiceId: String(invoice._id),
          eventType: "RENEWAL_COMPLETED",
          source: "system",
          payload: {
            oldContractId: String(lc._id),
            newEffectiveTo: billingEnd.toISOString(),
            price: price.finalAmount,
            currency: lc.currency,
            correlationId
          }
        });
      });
      return "charged";
    } else {
      // ── FAILURE PATH — enter dunning ──────────────────────────────────────
      const firstRetryDay = settings.retryScheduleDays[0] || 1;
      const firstRetryAt = addDays(now, firstRetryDay);
      const failureReason = chargeError?.message || "provider_declined";
      const invoice = new PlatformInvoice({
        organizationId: contract.organizationId,
        contractId: contract._id,
        planVersionId: contract.planVersionId || null,
        invoiceType: "subscription",
        billingCycleStart: billingStart,
        billingCycleEnd: billingEnd,
        dueDate: gracePeriodEndsAt,
        currency: contract.currency,
        ..._buildLineItems(lc, price),
        status: "open",
        paidAt: null,
        retryCount: 1,
        maxRetries: settings.maxRetries,
        nextRetryAt: firstRetryAt,
        failureReason,
        idempotencyKey,
        metadata: new Map([["renewalMode", "self_service"], ["planCode", lc.planCode], ["chargeError", failureReason], ["correlationId", correlationId]])
      });
      await invoice.save({
        session
      });

      // Initialize dunning state on contract
      await OrgContract.findByIdAndUpdate(lc._id, {
        $set: {
          effectiveTo: gracePeriodEndsAt,
          dunning: {
            retryCount: 1,
            nextRetryAt: firstRetryAt,
            gracePeriodEndsAt,
            suspendedAt: null,
            lastFailureReason: failureReason
          }
        }
      }, {
        session
      });
      await _writeAudit({
        organizationId: contract.organizationId,
        action: "CONTRACT_RENEWAL_CHARGE_FAILED",
        entity: "PLATFORM_INVOICE",
        entityId: invoice._id,
        details: {
          contractId: lc._id,
          reason: failureReason,
          nextRetryAt: firstRetryAt,
          gracePeriodEndsAt
        }
      }, session);

      // BillingAuditLog — DUNNING_STARTED on first charge failure
      try {
        await logBillingEvent({
          organizationId: contract.organizationId,
          contractId: lc._id,
          invoiceId: invoice._id,
          eventType: "DUNNING_STARTED",
          performedBy: SYSTEM_ACTOR,
          metadata: {
            failureReason,
            retryCount: 1,
            nextRetryAt: firstRetryAt.toISOString(),
            gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
            correlationId
          }
        });
      } catch (auditErr) {
        logger.warn({
          auditErr,
          contractId: lc._id
        }, "[ContractRenewal] BillingAuditLog DUNNING_STARTED write failed (non-fatal)");
      }
      await session.commitTransaction();
      session.endSession();
      logger.warn({
        contractId: lc._id,
        invoiceId: invoice._id,
        correlationId
      }, "[ContractRenewal] Charge failed — dunning initialized");
      return "failed";
    }
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
}

// ─── Compat alias (Sprint 6 callers) ──────────────────────────────────────────
module.exports = {
  renewExpiringContracts,
  scanContractRenewals: renewExpiringContracts // backward compat
};