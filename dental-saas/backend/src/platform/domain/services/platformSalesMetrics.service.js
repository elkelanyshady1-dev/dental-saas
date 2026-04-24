/**
 * salesMetrics.service.js
 * v9 Revenue Operations — KPI Tracking
 *
 * Sprint 5: subscription.tier reads removed.
 * Trial/conversion logic now derived from OrgContract.contractStatus.
 * salesOwnerId now read from OrgContract.salesOwnerId, not Organization.subscription.
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrgContractDef = require("../../../platform/billing/models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const PlatformInvoiceDef = require("../../../platform/billing/models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
class SalesMetricsService {
  /**
   * getMetricsBySalesOwner
   * Returns a dashboard of performance for a specific sales rep.
   * Sprint 5: commercial data sourced from OrgContract, not Organization.subscription.
   */
  async getMetricsBySalesOwner(salesOwnerId) {
    // Resolve orgs via OrgContract.salesOwnerId (Sprint 5)
    const contracts = await OrgContract.find({
      salesOwnerId
    }).lean();
    const orgIds = contracts.map(c => c.organizationId);

    // Fetch matched organizations for name/status
    const orgs = await Organization.find({
      _id: {
        $in: orgIds
      }
    }).lean();
    const paidInvoices = await PlatformInvoice.find({
      status: "paid",
      organizationId: {
        $in: orgIds
      }
    }).lean();

    // ── Status-based metrics from OrgContract.contractStatus ───────────────
    const activeClients = contracts.filter(c => c.contractStatus === "active").length;
    const totalClientsAcquired = contracts.length;
    const churnedClients = contracts.filter(c => c.contractStatus === "terminated" || c.contractStatus === "expired").length;

    // ── Revenue Calculations (Minor Units) ─────────────────────────────────
    const totalRevenueMinor = paidInvoices.reduce((sum, inv) => sum + (inv.totalAmountMinor || 0), 0);

    // MRR (last 30 days approximation)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const monthlyRevenueMinor = paidInvoices.filter(inv => inv.paidAt >= thirtyDaysAgo).reduce((sum, inv) => sum + (inv.totalAmountMinor || 0), 0);
    const avgDealSizeMinor = totalClientsAcquired > 0 ? Math.floor(totalRevenueMinor / totalClientsAcquired) : 0;

    // ── Trial-to-Paid Conversion ───────────────────────────────────────────
    // Sprint 5: trial detection from OrgContract.trialDays > 0 or org.status
    const trials = contracts.filter(c => (c.trialDays || 0) > 0).length + orgs.filter(o => o.status === "trial" || o.status === "expired").length;

    // Conversions = orgs that moved from trial to active contract
    const conversions = contracts.filter(c => c.contractStatus === "active" && (c.trialDays || 0) === 0).length;
    const trialToPaidConversionRate = trials > 0 ? conversions / trials * 100 : 0;
    return {
      totalClientsAcquired,
      activeClients,
      totalRevenueMinor,
      monthlyRevenueMinor,
      churnedClients,
      avgDealSizeMinor,
      trialToPaidConversionRate: parseFloat(trialToPaidConversionRate.toFixed(2))
    };
  }
}
module.exports = new SalesMetricsService();