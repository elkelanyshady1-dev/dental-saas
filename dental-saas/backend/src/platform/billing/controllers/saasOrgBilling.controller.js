/**
 * saasOrgBilling.controller.js
 * Phase v5.6 — Platform Admin: Per-Org SaaS Billing Views
 *
 * PLANE: Platform (moved from billingDomain/controllers — Phase 4 separation)
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const BillingInvoiceDef = require("../models/PlatformInvoice.model");
const getModel = require("@core/db/getModel");
const {
  getPlatformConnection
} = require("@core/db/dbResolver");
const usageService = require("@modules/communicationDomain/services/usage.service");
const {
  generatePlatformInvoice
} = require("../services/invoiceEngine.service");
const OrgContractDef = require("../models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const logger = require("@utils/logger");
const {
  getCurrentBillingCycle
} = require("@core/subscription/communicationQuota.service");
function _getBillingInvoice() {
  return getModel(getPlatformConnection(), BillingInvoiceDef);
}

/**
 * 1️⃣ GET /api/platform/orgs/:orgId/billing
 * Returns current cycle usage and active draft.
 */
exports.getOrgBillingOverview = async (req, res) => {
  try {
    const {
      orgId
    } = req.params;
    const {
      start
    } = getCurrentBillingCycle();
    const [usage, invoice] = await Promise.all([usageService.getUsageForCycle(orgId, start),
    // @rls-pbac-prefetch — billing controller — organizationId from authenticated req
    _getBillingInvoice().findOne({
      organizationId: orgId,
      billingCycleStart: start,
      status: "draft"
    })]);
    res.json({
      organizationId: orgId,
      currentCycle: {
        start,
        usage: usage || {
          smsUsed: 0,
          whatsappUsed: 0,
          emailUsed: 0,
          overageChargesAccumulated: 0
        }
      },
      activeDraft: invoice || null
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

/**
 * 2️⃣ GET /api/platform/orgs/:orgId/invoices
 * Returns invoice history.
 */
exports.getOrgInvoices = async (req, res) => {
  try {
    const {
      orgId
    } = req.params;
    // @rls-pbac-prefetch — billing controller — organizationId from authenticated req
    const invoices = await _getBillingInvoice().find({
      organizationId: orgId
    }).sort({
      billingCycleStart: -1
    });
    res.json(invoices);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

/**
 * 3️⃣ POST /api/platform/orgs/:orgId/invoices/generate
 * Manually triggers invoice generation/recalculation.
 */
exports.manualGenerateInvoice = async (req, res) => {
  try {
    const {
      orgId
    } = req.params;

    // Resolve the org's active contract — invoiceEngine requires a contractId
    const contract = await OrgContract.findOne({
      organizationId: orgId,
      contractStatus: {
        $in: ["active", "ready", "pending_payment"]
      }
    }).sort({
      createdAt: -1
    });
    if (!contract) {
      return res.status(404).json({
        message: "No active contract found for organization"
      });
    }
    const {
      invoice
    } = await generatePlatformInvoice(contract._id, {
      createdBy: req.platformUser?._id || null
    });
    res.json({
      message: "Invoice generated successfully",
      invoice
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};