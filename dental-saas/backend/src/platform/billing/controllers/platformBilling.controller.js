/**
 * platformBilling.controller.js
 * Phase v5.6 — Platform Billing Administration
 */

"use strict";

// Sprint 6: BillingInvoice removed — tombstone proxy re-exports PlatformInvoice
const BillingInvoice = require("../../../shared/models/BillingInvoice").default;
const usageService = require("../../communicationDomain/services/usage.service");
const invoiceService = require("../organizationFinance/services/invoice.service");
const logger = require("@utils/logger");
const { getCurrentBillingCycle } = require("../../../core/subscription/communicationQuota.service");

/**
 * 1️⃣ GET /api/platform/orgs/:orgId/billing
 * Returns current cycle usage and active draft.
 */
exports.getOrgBillingOverview = async (req, res) => {
    try {
        const { orgId } = req.params;
        const { start } = getCurrentBillingCycle();

        const [usage, invoice] = await Promise.all([
            usageService.getUsageForCycle(orgId, start),
            BillingInvoice.findOne({ organizationId: orgId, billingCycleStart: start, status: "draft" })
        ]);

        res.json({
            organizationId: orgId,
            currentCycle: {
                start,
                usage: usage || { smsUsed: 0, whatsappUsed: 0, emailUsed: 0, overageChargesAccumulated: 0 }
            },
            activeDraft: invoice || null
        });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * 2️⃣ GET /api/platform/orgs/:orgId/invoices
 * Returns invoice history.
 */
exports.getOrgInvoices = async (req, res) => {
    try {
        const { orgId } = req.params;
        const invoices = await BillingInvoice.find({ organizationId: orgId })
            .sort({ billingCycleStart: -1 });

        res.json(invoices);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

/**
 * 3️⃣ POST /api/platform/orgs/:orgId/invoices/generate
 * Manually triggers invoice generation/recalculation.
 */
exports.manualGenerateInvoice = async (req, res) => {
    try {
        const { orgId } = req.params;
        const invoice = await generateBillingInvoice(orgId);

        res.json({ message: "Invoice generated successfully", invoice });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
