/**
 * contractsNeedingRenewal.projection.js
 * Sprint 7 — Dashboard Projection: Contracts Needing Attention
 *
 * Returns contracts that are:
 *   - Nearing expiry (within next 14 days)
 *   - In dunning (failed charge, retrying)
 *   - Past grace period (suspended)
 *
 * Used by: GET /api/platform/contracts/needs-renewal
 * Capability: VIEW_PLATFORM_ANALYTICS
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const OrgContractDef = require("../../platform/billing/models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const PlatformInvoiceDef = require("../../platform/billing/models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const OrganizationDef = require("../../shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
/**
 * getContractsNeedingRenewal
 *
 * @param {object} options
 * @param {number} [options.lookaheadDays=14]  Number of days ahead to include expiring contracts
 * @param {number} [options.page=1]
 * @param {number} [options.limit=50]
 *
 * @returns {Promise<{ data: object[], pagination: object, summary: object }>}
 */
async function getContractsNeedingRenewal({
  lookaheadDays = 14,
  page = 1,
  limit = 50
} = {}) {
  const now = new Date();
  const lookahead = new Date(now.getTime() + lookaheadDays * 86_400_000);

  // Build umbrella query
  const query = {
    contractStatus: "active",
    $or: [
    // 1. Expiring soon (within lookahead window)
    {
      effectiveTo: {
        $lte: lookahead
      }
    },
    // 2. Currently in dunning
    {
      "dunning.nextRetryAt": {
        $exists: true,
        $ne: null
      }
    },
    // 3. Grace period running
    {
      "dunning.gracePeriodEndsAt": {
        $exists: true,
        $ne: null
      }
    }]
  };
  const skip = (page - 1) * limit;
  const total = await OrgContract.countDocuments(query);
  const contracts = await OrgContract.find(query).sort({
    effectiveTo: 1
  }).skip(skip).limit(limit).lean();
  if (!contracts.length) {
    return {
      data: [],
      pagination: {
        total: 0,
        page,
        limit,
        pages: 0
      },
      summary: {
        expiringSoon: 0,
        inDunning: 0,
        inGrace: 0
      }
    };
  }

  // Batch-load org names
  const orgIds = [...new Set(contracts.map(c => c.organizationId.toString()))];
  const orgs = await Organization.find({
    _id: {
      $in: orgIds
    }
  }, {
    name: 1,
    status: 1
  }).lean();
  const orgMap = Object.fromEntries(orgs.map(o => [o._id.toString(), o]));

  // Batch-load latest open invoice per contract
  const contractIds = contracts.map(c => c._id);
  const invoices = await PlatformInvoice.find({
    contractId: {
      $in: contractIds
    },
    status: {
      $in: ["open", "issued"]
    }
  }, {
    contractId: 1,
    status: 1,
    totalAmountMinor: 1,
    currency: 1,
    dueDate: 1
  }).lean();
  const invoiceMap = {};
  invoices.forEach(inv => {
    const key = inv.contractId.toString();
    if (!invoiceMap[key]) invoiceMap[key] = inv;
  });

  // Summary counters
  let expiringSoon = 0,
    inDunning = 0,
    inGrace = 0;
  const data = contracts.map(contract => {
    const org = orgMap[contract.organizationId.toString()] || {};
    const invoice = invoiceMap[contract._id.toString()] || null;
    const daysToExpiry = contract.effectiveTo ? Math.ceil((new Date(contract.effectiveTo) - now) / 86_400_000) : null;
    const isDunning = !!contract.dunning?.nextRetryAt;
    const isGrace = !!contract.dunning?.gracePeriodEndsAt;
    const isExpiring = daysToExpiry !== null && daysToExpiry <= lookaheadDays;
    if (isExpiring) expiringSoon++;
    if (isDunning) inDunning++;
    if (isGrace) inGrace++;

    // Classify priority
    let priority = "low";
    if (isGrace) priority = "critical";else if (isDunning) priority = "high";else if (daysToExpiry !== null && daysToExpiry <= 3) priority = "high";else if (isExpiring) priority = "medium";
    return {
      contractId: contract._id,
      organizationId: contract.organizationId,
      orgName: org.name || "Unknown",
      orgStatus: org.status || "unknown",
      contractStatus: contract.contractStatus,
      planCode: contract.planCode,
      planVersionTag: contract.planVersionTag,
      salesManaged: contract.salesManaged,
      autoRenew: contract.autoRenew,
      currency: contract.currency,
      lockedPrice: contract.lockedPrice,
      effectiveTo: contract.effectiveTo,
      daysToExpiry,
      dunning: contract.dunning || null,
      invoice: invoice ? {
        invoiceId: invoice._id,
        status: invoice.status,
        totalAmountMinor: invoice.totalAmountMinor,
        currency: invoice.currency,
        dueDate: invoice.dueDate
      } : null,
      priority,
      flags: {
        isExpiringSoon: isExpiring,
        isInDunning: isDunning,
        isInGrace: isGrace,
        isSuspended: !!contract.dunning?.suspendedAt
      }
    };
  });
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    },
    summary: {
      expiringSoon,
      inDunning,
      inGrace,
      total
    }
  };
}
module.exports = {
  getContractsNeedingRenewal
};