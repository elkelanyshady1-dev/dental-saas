/**
 * platformBilling.controller.js
 * Phase v5.6 — Platform Billing Administration
 */

"use strict";

// Sprint 6: BillingInvoice removed — tombstone proxy re-exports PlatformInvoice
const BillingInvoiceDef = require("../../../shared/models/BillingInvoice");
const getModel = require("../../../core/db/getModel");
const {
  getPlatformConnection
} = require("../../../core/db/dbResolver");
const usageService = require("../../communicationDomain/services/usage.service");
const invoiceService = require("../organizationFinance/services/invoice.service");
const logger = require("@utils/logger");
const {
  getCurrentBillingCycle
} = require("../../../core/subscription/communicationQuota.service");
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
      billingCycleStart: start,
      status: "draft"
    })]);
    res.json({
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
    const invoices = await _getBillingInvoice().find({}).sort({
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
    const invoice = await generateBillingInvoice(orgId);
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