/**
 * renewalDashboard.projection.js
 * Sprint 7.1 — Renewal Dashboard Metrics + Normalized Revenue KPIs
 *
 * New metrics (normalized to baseReportingCurrency):
 *   totalRecognizedRevenueBaseCurrency — sum of normalizedRecognizedAmount across active schedules
 *   totalDeferredRevenueBaseCurrency   — sum of normalizedDeferredAmount across active schedules
 *   MRRBaseCurrency                    — total recognized / months_elapsed (current period)
 *   ARRBaseCurrency                    — MRR * 12
 *
 * Original metrics preserved unchanged.
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrgContractDef = require("../platform/billing/models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const PlatformInvoiceDef = require("../platform/billing/models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const OrganizationDef = require("../shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const RevenueScheduleDef = require("../platform/finance/models/RevenueSchedule.model");
const RevenueSchedule = getPlatformModel(RevenueScheduleDef);
const {
  getBillingSettings
} = require("../platform/billing/services/billingSettings.service");

/**
 * getRenewalDashboardMetrics
 * @returns {Promise<object>} dashboard metrics
 */
async function getRenewalDashboardMetrics() {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);
  const ago7Days = new Date(now.getTime() - 7 * 86_400_000);

  // Get base reporting currency for display label
  const settings = await getBillingSettings();
  const baseCurrency = settings.baseReportingCurrency || "USD";

  // ── Run all queries in parallel ────────────────────────────────────────────
  const [totalActiveContracts, expiringNext30Days, contractsInGrace, suspendedCount, failedPaymentsLast7Days, autoRenewEnabled, salesManagedCount, projectedRevenueAgg, recognizedRevenueAgg, deferredRevenueAgg] = await Promise.all([
  // 1. Total active contracts
  OrgContract.countDocuments({
    contractStatus: "active"
  }),
  // 2. Expiring in next 30 days
  OrgContract.countDocuments({
    contractStatus: "active",
    effectiveTo: {
      $lte: in30Days,
      $gte: now
    }
  }),
  // 3. Contracts in grace window
  OrgContract.countDocuments({
    contractStatus: "active",
    "dunning.gracePeriodEndsAt": {
      $exists: true,
      $ne: null
    }
  }),
  // 4. Suspended orgs
  Organization.countDocuments({
    status: "suspended"
  }),
  // 5. Failed payment invoices (open) last 7 days
  PlatformInvoice.countDocuments({
    status: "open",
    createdAt: {
      $gte: ago7Days
    }
  }),
  // 6. Auto-renew enabled
  OrgContract.countDocuments({
    contractStatus: "active",
    autoRenew: true
  }),
  // 7. Sales-managed
  OrgContract.countDocuments({
    contractStatus: "active",
    salesManaged: true
  }),
  // 8. Projected renewal revenue (contracts auto-renewing in ≤30d)
  OrgContract.aggregate([{
    $match: {
      contractStatus: "active",
      effectiveTo: {
        $lte: in30Days,
        $gte: now
      },
      autoRenew: true
    }
  }, {
    $group: {
      _id: null,
      projectedRevenue: {
        $sum: "$lockedPrice"
      },
      contractCount: {
        $sum: 1
      }
    }
  }]),
  // 9. Normalized recognized revenue (active schedules)
  RevenueSchedule.aggregate([{
    $match: {
      status: {
        $in: ["active", "fully_recognized"]
      }
    }
  }, {
    $group: {
      _id: null,
      total: {
        $sum: "$normalizedRecognizedAmount"
      }
    }
  }]),
  // 10. Normalized deferred revenue (active schedules only — not yet recognized)
  RevenueSchedule.aggregate([{
    $match: {
      status: "active"
    }
  }, {
    $group: {
      _id: null,
      total: {
        $sum: "$normalizedDeferredAmount"
      }
    }
  }])]);
  const projectedRevenue = projectedRevenueAgg[0]?.projectedRevenue ?? 0;
  const projectedContracts = projectedRevenueAgg[0]?.contractCount ?? 0;
  const totalRecognized = recognizedRevenueAgg[0]?.total ?? 0;
  const totalDeferred = deferredRevenueAgg[0]?.total ?? 0;

  // ── MRR / ARR Calculation ─────────────────────────────────────────────────
  // MRR = sum of normalizedAmountPerPeriod across active monthly schedules
  // (i.e. the recurring revenue recognized each month in base currency)
  const mrrAgg = await RevenueSchedule.aggregate([{
    $match: {
      status: "active",
      recognitionFrequency: "monthly"
    }
  }, {
    $group: {
      _id: null,
      mrr: {
        $sum: "$normalizedAmountPerPeriod"
      }
    }
  }]);
  const MRRBaseCurrency = +(mrrAgg[0]?.mrr ?? 0).toFixed(2);
  const ARRBaseCurrency = +(MRRBaseCurrency * 12).toFixed(2);
  return {
    // ── Contract Health ───────────────────────────────────────────────────
    totalActiveContracts,
    expiringNext30Days,
    contractsInGrace,
    suspendedForNonPayment: suspendedCount,
    failedPaymentsLast7Days,
    autoRenewEnabledCount: autoRenewEnabled,
    salesManagedCount,
    projectedRevenueNext30Days: {
      amount: projectedRevenue,
      contractCount: projectedContracts
    },
    // ── Normalized Revenue KPIs (base currency) ───────────────────────────
    baseCurrency,
    totalRecognizedRevenueBaseCurrency: +totalRecognized.toFixed(2),
    totalDeferredRevenueBaseCurrency: +totalDeferred.toFixed(2),
    MRRBaseCurrency,
    ARRBaseCurrency,
    generatedAt: now.toISOString()
  };
}
module.exports = {
  getRenewalDashboardMetrics
};