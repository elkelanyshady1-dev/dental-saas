"use strict";

/**
 * revenueIntelligenceService.js
 * v22.0 — Post Hybrid Billing Migration
 *
 * MIGRATION NOTE (Sprint 6):
 *   BillingInvoice (billinginvoices collection) has been fully removed.
 *   All revenue calculations now operate on:
 *     - PlatformInvoice  (platforminvoices)   → raw invoice totals, status
 *     - RevenueSchedule  (revenueschedules)   → normalized MRR/ARR via recognition engine
 *     - OrgContract      (orgcontracts)        → subscription lifecycle + renewal forecasting
 *
 * NO LEGACY FIELDS USED:
 *   ✗ stripeInvoiceId          ✓ contractId
 *   ✗ subscription.plan        ✓ OrgContract.planVersionId
 *   ✗ subscription.tier        ✓ subscription.status
 *   ✗ currentPeriodEnd         ✓ OrgContract.endDate
 *   ✗ billinginvoices          ✓ platforminvoices / revenueschedules
 */
const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("../shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const PlatformInvoiceDef = require("../platform/billing/models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const RevenueScheduleDef = require("../platform/finance/models/RevenueSchedule.model");
let _RevenueSchedule_cache = null;
function RevenueSchedule() {
    return _RevenueSchedule_cache || (_RevenueSchedule_cache = getPlatformModel(RevenueScheduleDef));
}
const OrgContractDef = require("../platform/billing/models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const AuditLogDef = require("../shared/models/AuditLog");
let _AuditLog_cache = null;
function AuditLog() {
    return _AuditLog_cache || (_AuditLog_cache = getPlatformModel(AuditLogDef));
}
const logger = require("../utils/logger");

// ─────────────────────────────────────────────────────────────────────────────
// computeRevenueIntelligence
//
// Returns:
//   mrr            — sum of normalized recognized revenue per active org (monthly)
//   arr            — mrr * 12
//   revenueAtRisk  — sum of open/uncollectible invoice totals
//   churnRate      — suspensions this month / active at start of month
//   nrr            — Net Revenue Retention (simulated 30-day window)
//   forecast       — renewal revenue due in next 30 / 60 / 90 days
//   mrrMovement    — newMRR, expansionMRR, contractionMRR, churnedMRR, netChange
//   deferredRevenue — total normalized deferred amounts across all active schedules
// ─────────────────────────────────────────────────────────────────────────────
exports.computeRevenueIntelligence = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── 1. MRR from RevenueSchedule (normalized recognized amounts) ────────────
  // Per-org: take the most recent schedule and use normalizedRecognizedAmount / periodsRecognized
  // as a monthly proxy. For fully_recognized, we skip — they no longer contribute.
  // @rls-platform-analytics — cross-org revenue metrics, no org-scoped req
  const mrrAgg = await RevenueSchedule().aggregate([{
    $match: {
      status: "active"
    }
  }, {
    $sort: {
      createdAt: -1
    }
  }, {
    $group: {
      _id: "$organizationId",
      // Per active schedule: monthly contribution = normalizedAmountPerPeriod
      monthlyContrib: {
        $first: "$normalizedAmountPerPeriod"
      }
    }
  }, {
    $group: {
      _id: null,
      mrr: {
        $sum: "$monthlyContrib"
      }
    }
  }]);
  const mrr = mrrAgg[0]?.mrr || 0;
  const arr = mrr * 12;

  // ── 2. Total Deferred Revenue ──────────────────────────────────────────────
  // @rls-platform-analytics — cross-org revenue metrics, no org-scoped req
  const deferredAgg = await RevenueSchedule().aggregate([{
    $match: {
      status: "active"
    }
  }, {
    $group: {
      _id: null,
      deferredRevenue: {
        $sum: "$normalizedDeferredAmount"
      }
    }
  }]);
  const deferredRevenue = deferredAgg[0]?.deferredRevenue || 0;

  // ── 3. Revenue At Risk (open + uncollectible PlatformInvoice totals) ───────
  // @rls-platform-analytics — cross-org revenue metrics, no org-scoped req
  const riskAgg = await PlatformInvoice().aggregate([{
    $match: {
      status: {
        $in: ["open", "uncollectible"]
      }
    }
  }, {
    $sort: {
      createdAt: -1
    }
  }, {
    $group: {
      _id: "$organizationId",
      latestAmount: {
        $first: "$totalAmount"
      }
    }
  }, {
    $group: {
      _id: null,
      revenueAtRisk: {
        $sum: "$latestAmount"
      }
    }
  }]);
  const revenueAtRisk = riskAgg[0]?.revenueAtRisk || 0;

  // ── 4. Churn Rate ─────────────────────────────────────────────────────────
  // @rls-platform-analytics — cross-org revenue metrics, no org-scoped req
  const churnsThisMonth = await AuditLog().countDocuments({
    action: "SUBSCRIPTION_AUTO_SUSPENDED",
    createdAt: {
      $gte: startOfMonth
    }
  });
  // @rls-platform-analytics — cross-org revenue metrics, no org-scoped req
  const currentActive = await Organization().countDocuments({
    "subscription.status": {
      $in: ["active", "trial"]
    }
  });
  const activeAtStart = currentActive + churnsThisMonth;
  const churnRate = activeAtStart > 0 ? churnsThisMonth / activeAtStart : 0;

  // ── 5. MRR Movement (30-day rolling window via PlatformInvoice) ────────────
  // Uses paid invoices — compares each org's latest paid invoice to its previous.
  // New org = only 1 paid invoice in window. Expansion/Contraction = diff vs prior.
  let newMRR = 0;
  let expansionMRR = 0;
  let contractionMRR = 0;
  let churnedMRR = 0;

  // @rls-platform-analytics — cross-org revenue metrics, no org-scoped req
  const activeOrgsInvoices = await PlatformInvoice().aggregate([{
    $match: {
      status: "paid"
    }
  }, {
    $sort: {
      createdAt: -1
    }
  }, {
    $group: {
      _id: "$organizationId",
      invoices: {
        $push: {
          amount: "$totalAmount",
          createdAt: "$createdAt"
        }
      }
    }
  }]);
  for (const org of activeOrgsInvoices) {
    const sorted = org.invoices; // already sorted descending by createdAt
    if (!sorted.length) continue;
    const latest = sorted[0];
    if (new Date(latest.createdAt) >= thirtyDaysAgo) {
      if (sorted.length === 1) {
        newMRR += latest.amount;
      } else {
        const prev = sorted[1];
        const diff = latest.amount - prev.amount;
        if (diff > 0) expansionMRR += diff;
        if (diff < 0) contractionMRR += Math.abs(diff);
      }
    }
  }

  // Churned MRR: last paid invoice amount for orgs suspended this month
  // @rls-platform-analytics — cross-org revenue metrics, no org-scoped req
  const churnLogs = await AuditLog().find({
    action: "SUBSCRIPTION_AUTO_SUSPENDED",
    createdAt: {
      $gte: startOfMonth
    }
  }).select("organizationId").lean();
  for (const log of churnLogs) {
    // @rls-platform-analytics — cross-org revenue metrics, no org-scoped req
    const lastPaid = await PlatformInvoice().findOne({
      organizationId: log.organizationId,
      status: "paid"
    }).sort({
      createdAt: -1
    }).select("totalAmount").lean();
    if (lastPaid) churnedMRR += lastPaid.totalAmount;
  }
  const netChange = newMRR + expansionMRR - contractionMRR - churnedMRR;
  const startingMRR = Math.max(1, mrr - netChange);
  const nrr = (startingMRR - churnedMRR + expansionMRR - contractionMRR) / startingMRR;

  // ── 6. Renewal Forecast (30/60/90 days) via OrgContract ───────────────────
  // Uses OrgContract.endDate + OrgContract.lockedPrice (contract-locked pricing).
  // No legacy subscription.currentPeriodEnd or subscription.plan.
  let next30Days = 0;
  let next60Days = 0;
  let next90Days = 0;

  // @rls-platform-analytics — cross-org revenue metrics, no org-scoped req
  const activeContracts = await OrgContract().find({
    contractStatus: {
      $in: ["active", "in_grace"]
    },
    endDate: {
      $gte: now
    }
  }).select("organizationId lockedPrice endDate autoRenew pricingOverride appliedCoupon").lean();
  for (const contract of activeContracts) {
    const daysUntilRenewal = (new Date(contract.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (!contract.autoRenew) continue; // Skip non-renewing contracts

    // Use contract-locked price as renewal basis
    let predictedPrice = contract.lockedPrice || 0;

    // Apply pricing override if set by platform
    if (contract.pricingOverride?.price != null) {
      predictedPrice = contract.pricingOverride.price;
    }

    // Coupon discount on next renewal cycle
    let couponDiscount = 0;
    if (contract.appliedCoupon?.discountValue) {
      const c = contract.appliedCoupon;
      const isNotExpired = !c.validUntil || now <= new Date(c.validUntil);
      if (isNotExpired) {
        if (c.discountType === "percentage") {
          couponDiscount = predictedPrice * (c.discountValue / 100);
        } else {
          couponDiscount = c.discountValue;
        }
      }
    }
    const predictedFinal = Math.max(0, predictedPrice - couponDiscount);
    if (daysUntilRenewal <= 30) next30Days += predictedFinal;
    if (daysUntilRenewal <= 60) next60Days += predictedFinal;
    if (daysUntilRenewal <= 90) next90Days += predictedFinal;
  }
  logger.info({
    mrr,
    arr,
    revenueAtRisk,
    churnRate: churnRate.toFixed(4),
    deferredRevenue
  }, "[RevenueIntelligence] compute complete");
  return {
    mrr,
    arr,
    revenueAtRisk,
    deferredRevenue,
    churnRate,
    nrr,
    forecast: {
      next30Days,
      next60Days,
      next90Days
    },
    mrrMovement: {
      newMRR,
      expansionMRR,
      contractionMRR,
      churnedMRR,
      netChange
    }
  };
};