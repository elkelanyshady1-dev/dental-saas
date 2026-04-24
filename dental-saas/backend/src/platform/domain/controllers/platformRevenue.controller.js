/**
 * revenue.controller.js
 * v9 Commercial Revenue Operations Layer
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const OrganizationDef = require("@shared/models/Organization");
const Organization = getPlatformModel(OrganizationDef);
const PlatformInvoiceDef = require("../../billing/models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const OrgContractDef = require("../../billing/models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const {
  getProviderForOrg,
  getProvider
} = require("../../billing/providers/paymentProviderFactory");
const AuditLogDef = require("@shared/models/AuditLog");
const AuditLog = getPlatformModel(AuditLogDef);
const Money = require("@utils/money");
const salesMetricsService = require("../services/platformSalesMetrics.service");

/**
 * toggleAutoRenew
 * PATCH /platform/org/:id/auto-renew
 */
exports.toggleAutoRenew = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      autoRenew
    } = req.body;
    const org = await Organization.findById(id);
    if (!org) return res.status(404).json({
      message: "Organization not found"
    });

    // Sprint 6: autoRenew lives on OrgContract, not org.subscription
    const contract = await OrgContract.findOne({
      organizationId: id,
      contractStatus: "active"
    });
    if (!contract) return res.status(404).json({
      message: "No active contract found"
    });
    const previousAutoRenew = contract.autoRenew;
    contract.autoRenew = autoRenew;
    if (org.subscription?.providerSubscriptionId) {
      const provider = getProviderForOrg(org);
      await provider.updateAutoRenew(org.subscription.providerSubscriptionId, autoRenew);
    }
    await contract.save();
    await AuditLog.create({
      organizationId: id,
      actorId: req.user.userId,
      actorType: "platform_user",
      action: "CONTRACT_AUTORENEW_TOGGLED",
      entity: "ORG_CONTRACT",
      entityId: contract._id,
      regionCode: "GLOBAL",
      metadata: {
        previousAutoRenew,
        newAutoRenew: autoRenew
      },
      success: true
    });
    res.json({
      message: `Auto-renew set to ${autoRenew}`,
      autoRenew
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to toggle auto-renew",
      error: err.message
    });
  }
};

/**
 * recordManualPayment
 * POST /platform/org/:id/manual-payment
 */
exports.recordManualPayment = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      invoiceId,
      paymentMethod,
      reference,
      notes,
      amountMinor
    } = req.body;
    if (!["CASH", "BANK_TRANSFER", "MANUAL"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid manual payment method"
      });
    }

    // Sprint 6: PlatformInvoice — no BillingInvoice
    const [org, invoice] = await Promise.all([Organization.findById(id), PlatformInvoice.findById(invoiceId)]);
    if (!org || !invoice) return res.status(404).json({
      message: "Org or Invoice not found"
    });
    if (invoice.status === "paid") return res.status(400).json({
      message: "Invoice already paid"
    });
    if (invoice.totalAmountMinor !== amountMinor) {
      return res.status(400).json({
        message: `Amount mismatch. Expected ${invoice.totalAmountMinor} minor units.`
      });
    }
    invoice.status = "paid";
    invoice.paymentProvider = "manual";
    invoice.providerPaymentId = reference || null;
    invoice.paidAt = new Date();
    await invoice.save();

    // Sprint 6→7: activate via contractActivation.service — NEVER direct mutation
    if (invoice.contractId) {
      const contract = await OrgContract.findById(invoice.contractId);
      if (contract && contract.contractStatus !== "active") {
        try {
          const {
            activateContract
          } = require("../../platform/billing/services/contractActivation.service");
          await activateContract(invoice.contractId, invoice._id, {
            activatedBy: req.user.userId
          });
          await AuditLog.create({
            organizationId: id,
            actorId: req.user.userId,
            actorType: "platform_user",
            action: "CONTRACT_ACTIVATED_MANUAL_PAYMENT",
            entity: "ORG_CONTRACT",
            entityId: contract._id,
            regionCode: "GLOBAL",
            metadata: {
              invoiceId,
              contractStatus: "active"
            },
            success: true
          });
        } catch (activationErr) {
          // Log but don't fail — invoice is already paid; activation can be retried
          // Guardian will detect if contract is stuck and alert on next boot
          const logger = require("@utils/logger");
          logger.error({
            err: activationErr,
            contractId: invoice.contractId
          }, "[ManualPayment] Contract activation failed after payment (non-fatal)");
        }
      }
    }
    await AuditLog.create({
      organizationId: id,
      actorId: req.user.userId,
      actorType: "platform_user",
      action: "MANUAL_PAYMENT_RECORDED",
      entity: "PLATFORM_INVOICE",
      entityId: invoiceId,
      regionCode: "GLOBAL",
      metadata: {
        amountMinor,
        paymentMethod,
        reference
      },
      success: true
    });
    res.json({
      message: "Manual payment recorded successfully",
      invoice
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to record manual payment",
      error: err.message
    });
  }
};

/**
 * generatePaymentLink
 * POST /platform/org/:id/generate-payment-link
 */
exports.generatePaymentLink = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      planId,
      interval,
      currency,
      autoRenew
    } = req.body;
    const org = await Organization.findById(id);
    if (!org) return res.status(404).json({
      message: "Organization not found"
    });

    // v9 Single Subscription Invariant
    if (org.subscription.providerSubscriptionId && org.subscription.status === "active") {
      return res.status(400).json({
        message: "Organization already has an active subscription."
      });
    }
    const provider = getProviderForOrg(org);
    const session = await provider.createCheckoutSession(org, planId, {
      interval,
      currency,
      autoRenew,
      salesOwnerId: req.user.userId
    });
    await AuditLog.create({
      organizationId: id,
      actorId: req.user.userId,
      actorType: "platform_user",
      action: "PAYMENT_LINK_GENERATED",
      entity: "ORGANIZATION",
      entityId: id,
      regionCode: "GLOBAL",
      metadata: {
        planId,
        interval,
        currency,
        autoRenew
      },
      success: true
    });
    res.json({
      url: session.url
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to generate payment link",
      error: err.message
    });
  }
};

/**
 * getPortalUrl
 * POST /org/billing/portal
 */
exports.getPortalUrl = async (req, res) => {
  try {
    const {
      organizationId
    } = req.user;
    const org = await Organization.findById(organizationId);
    if (!org.subscription.providerCustomerId) {
      return res.status(400).json({
        message: "No active billing customer found for this organization."
      });
    }
    const provider = getProviderForOrg(org);
    const session = await provider.createPortalSession(org.subscription.providerCustomerId, `${process.env.FRONTEND_URL}/org/billing`);
    res.json({
      url: session.url
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to generate portal URL",
      error: err.message
    });
  }
};

/**
 * getSalesMetrics
 * GET /platform/metrics/sales
 */
exports.getSalesMetrics = async (req, res) => {
  try {
    const metrics = await salesMetricsService.getMetricsBySalesOwner(req.user.userId);
    res.json(metrics);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch sales metrics",
      error: err.message
    });
  }
};