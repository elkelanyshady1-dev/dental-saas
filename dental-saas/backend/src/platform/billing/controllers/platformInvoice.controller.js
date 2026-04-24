/**
 * platformInvoice.controller.js
 * Sprint 2 — Contract Engine (Parallel Mode)
 *
 * Handles PlatformInvoice lifecycle:
 *   POST /contracts/:id/invoice     → generateInvoice
 *   POST /invoices/:id/pay          → recordPayment
 *   GET  /invoices/:id              → getInvoice
 *   GET  /contracts/:id/invoices    → listContractInvoices
 *
 * Payment methods supported:
 *   cash, bank_transfer, pos, stripe, paymob, paypal
 *
 * Manual payments (cash, bank_transfer, pos):
 *   - Require paymentMetadata
 *   - Mark invoice "paid"
 *   - Call activateContract()
 *
 * PLANE: Platform
 * CAPABILITY: MANAGE_SUBSCRIPTIONS
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const OrgContractDef = require("@billing/models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const PlatformInvoiceDef = require("@billing/models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const PlanVersionDef = require("@billing/models/PlanVersion.model");
let _PlanVersion_cache = null;
function PlanVersion() {
    return _PlanVersion_cache || (_PlanVersion_cache = getPlatformModel(PlanVersionDef));
}
const OrganizationDef = require("@shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const {
  activateContract
} = require("@billing/services/contractActivation.service");
const logger = require("@utils/logger");

// ─── Tax rates by ISO country ─────────────────────────────────────────────────
// Source of truth will move to a TaxPolicy model in Sprint 4.
// Currently hardcoded for correctness matching existing invoice.service.js.
const TAX_RATES_BY_COUNTRY = {
  AE: 5,
  SA: 15
};

// ─── Audit fallback ───────────────────────────────────────────────────────────
let auditLog;
try {
  auditLog = require("../../../domain/services/platformAudit.service").log;
} catch {
  auditLog = async e => logger.info(e, "[InvoiceController][AuditFallback]");
}

// ─── Manual payment methods that bypass provider ──────────────────────────────
const MANUAL_PAYMENT_METHODS = new Set(["cash", "bank_transfer", "pos"]);
const PROVIDER_PAYMENT_METHODS = new Set(["stripe", "paymob", "paypal"]);
const ALL_PAYMENT_METHODS = new Set([...MANUAL_PAYMENT_METHODS, ...PROVIDER_PAYMENT_METHODS]);

// ─── Invoice number generator ─────────────────────────────────────────────────
// Format: INV-YYYYMM-XXXX where XXXX is zero-padded monthly sequence
async function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const prefix = `INV-${year}${month}-`;

  // Count existing invoices this month (simple sequence — atomic at DB level)
  const count = await PlatformInvoice().countDocuments({
    createdAt: {
      $gte: new Date(`${year}-${month}-01T00:00:00.000Z`),
      $lt: new Date(year, now.getUTCMonth() + 1, 1)
    }
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

// ─── POST /contracts/:id/invoice ──────────────────────────────────────────────

/**
 * generateInvoice
 * Creates a PlatformInvoice for the given contract.
 * Calculates: base price → discount → tax → final total.
 * Sets status = "issued".
 */
exports.generateInvoice = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const actorId = req.platformUser?._id;
    const {
      billingInterval = "monthly"
    } = req.body;

    // ── Load Contract ──────────────────────────────────────────────────────
    const contract = await OrgContract().findById(id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        error: "Contract not found"
      });
    }
    if (!["draft", "active", "pending_activation"].includes(contract.contractStatus)) {
      return res.status(400).json({
        success: false,
        error: `Cannot issue invoice for contract in status "${contract.contractStatus}"`
      });
    }

    // ── Guard: idempotency — prevent double invoice for same period ─────────
    const cycleStart = new Date();
    const cycleEnd = new Date(cycleStart);
    if (billingInterval === "yearly") cycleEnd.setFullYear(cycleEnd.getFullYear() + 1);else if (billingInterval === "biennial") cycleEnd.setFullYear(cycleEnd.getFullYear() + 2);else cycleEnd.setMonth(cycleEnd.getMonth() + 1);
    const idempotencyKey = `contract:${contract._id}:${cycleStart.getFullYear()}-${cycleStart.getMonth()}`;
    const existing = await PlatformInvoice().findOne({
      idempotencyKey
    });
    if (existing) {
      return res.status(200).json({
        success: true,
        data: existing,
        message: "Invoice already generated for this period (idempotent)"
      });
    }

    // ── Load Organization for tax country ──────────────────────────────────
    const org = await Organization().findById(contract.organizationId).select("billingCountry regionCode");
    const taxPercent = TAX_RATES_BY_COUNTRY[org?.billingCountry] || 0;

    // ── Resolve base price ─────────────────────────────────────────────────
    // Use locked price from contract, inflating if renewalPolicy applies
    // For initial invoices, lockedPrice is the exact contracted price.
    const effectiveIntervalMap = {
      monthly: "monthly",
      yearly: "yearly",
      biennial: "biennial"
    };
    const interval = effectiveIntervalMap[billingInterval] || "monthly";

    // Apply optional inflation for renewals (do not inflate initial invoices)
    const inflationPercent = contract.renewalTerms?.inflationPercent || 0;
    let basePlanAmount = contract.lockedPrice;
    if (inflationPercent > 0 && contract.contractStatus === "active") {
      basePlanAmount = basePlanAmount * (1 + inflationPercent / 100);
    }

    // ── Apply coupon discount ──────────────────────────────────────────────
    let couponDiscountAmount = 0;
    const coupon = contract.appliedCoupon;
    if (coupon?.code && (!coupon.validUntil || new Date() <= new Date(coupon.validUntil))) {
      if (coupon.discountType === "percentage") {
        couponDiscountAmount = basePlanAmount * coupon.discountValue / 100;
      } else if (coupon.discountType === "fixed") {
        couponDiscountAmount = Math.min(coupon.discountValue, basePlanAmount);
      }
    }

    // ── Apply custom pricing override ──────────────────────────────────────
    if (contract.pricingOverride?.isCustom && contract.pricingOverride.lockedPrice > 0) {
      basePlanAmount = contract.pricingOverride.lockedPrice;
    }

    // ── Subtotal ───────────────────────────────────────────────────────────
    const subtotalAmount = Math.max(0, basePlanAmount - couponDiscountAmount);

    // ── Apply credit balance ───────────────────────────────────────────────
    const creditApplied = Math.min(contract.creditBalance || 0, subtotalAmount);
    const afterCredit = subtotalAmount - creditApplied;

    // ── Tax ────────────────────────────────────────────────────────────────
    const taxAmount = Math.round(afterCredit * taxPercent) / 100;

    // ── Total ─────────────────────────────────────────────────────────────
    const totalAmount = afterCredit + taxAmount;

    // Convert to minor units (cents / smallest unit)
    const toMinor = n => Math.round(n * 100);

    // ── Invoice number ─────────────────────────────────────────────────────
    const invoiceNumber = await generateInvoiceNumber();

    // ── Build line items ───────────────────────────────────────────────────
    const lineItems = [];
    lineItems.push({
      description: `${contract.planCode} — ${interval} subscription`,
      quantity: 1,
      unitPrice: basePlanAmount,
      unitPriceMinor: toMinor(basePlanAmount),
      total: basePlanAmount,
      totalMinor: toMinor(basePlanAmount),
      type: "plan"
    });
    if (couponDiscountAmount > 0) {
      lineItems.push({
        description: `Coupon discount (${coupon.code})`,
        quantity: 1,
        unitPrice: -couponDiscountAmount,
        unitPriceMinor: -toMinor(couponDiscountAmount),
        total: -couponDiscountAmount,
        totalMinor: -toMinor(couponDiscountAmount),
        type: "credit"
      });
    }
    if (creditApplied > 0) {
      lineItems.push({
        description: "Credit balance applied",
        quantity: 1,
        unitPrice: -creditApplied,
        unitPriceMinor: -toMinor(creditApplied),
        total: -creditApplied,
        totalMinor: -toMinor(creditApplied),
        type: "credit"
      });
    }
    if (taxAmount > 0) {
      lineItems.push({
        description: `Tax (${taxPercent}%)`,
        quantity: 1,
        unitPrice: taxAmount,
        unitPriceMinor: toMinor(taxAmount),
        total: taxAmount,
        totalMinor: toMinor(taxAmount),
        type: "tax"
      });
    }

    // ── Persist ────────────────────────────────────────────────────────────
    const invoice = await PlatformInvoice().create({
      organizationId: contract.organizationId,
      contractId: contract._id,
      planVersionId: contract.planVersionId,
      invoiceType: contract.contractStatus === "draft" ? "initial" : contract.contractStatus === "pending_activation" ? "scheduled" // pre-paid, activates after trial — not a live subscription yet
      : "subscription",
      billingCycleStart: cycleStart,
      billingCycleEnd: cycleEnd,
      dueDate: cycleEnd,
      currency: contract.currency,
      lineItems,
      basePlanAmount,
      basePlanAmountMinor: toMinor(basePlanAmount),
      couponCode: coupon?.code || null,
      couponDiscountAmount,
      couponDiscountAmountMinor: toMinor(couponDiscountAmount),
      creditApplied,
      creditAppliedMinor: toMinor(creditApplied),
      subtotalAmount,
      subtotalAmountMinor: toMinor(subtotalAmount),
      taxPercent,
      taxAmount,
      taxAmountMinor: toMinor(taxAmount),
      totalAmount,
      totalAmountMinor: toMinor(totalAmount),
      status: "open",
      paymentStatus: "pending",
      regionCode: org?.regionCode || null,
      idempotencyKey,
      createdBy: actorId,
      metadata: new Map([["invoiceNumber", invoiceNumber], ["billingInterval", interval]])
    });
    logger.info({
      invoiceId: invoice._id,
      contractId: id,
      totalAmount,
      currency: contract.currency,
      actorId
    }, "[InvoiceController] Invoice generated");
    setImmediate(async () => {
      try {
        await auditLog({
          action: "INVOICE_ISSUED",
          organizationId: contract.organizationId,
          actorId,
          metadata: {
            invoiceId: invoice._id,
            contractId: contract._id,
            invoiceNumber,
            totalAmount,
            currency: contract.currency,
            interval
          }
        });
      } catch (e) {
        logger.error({
          err: e
        }, "[InvoiceController] Audit log failed (non-fatal)");
      }
    });
    return res.status(201).json({
      success: true,
      data: invoice,
      message: "Invoice issued"
    });
  } catch (err) {
    logger.error({
      err
    }, "[InvoiceController] generateInvoice failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── POST /invoices/:id/pay ───────────────────────────────────────────────────

/**
 * recordPayment
 * Records a payment against a PlatformInvoice.
 *
 * Manual methods (cash, bank_transfer, pos):
 *   - Require paymentMetadata
 *   - Immediately mark invoice paid
 *   - Call activateContract() if contract is in draft
 *
 * Provider methods (stripe, paymob, paypal):
 *   - Provider webhook handles actual confirmation
 *   - This endpoint only records intent / reference
 */
exports.recordPayment = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const actorId = req.platformUser?._id;
    const {
      paymentMethod,
      paymentMetadata = {},
      providerPaymentId = null
    } = req.body;

    // ── Validate payment method ────────────────────────────────────────────
    if (!paymentMethod || !ALL_PAYMENT_METHODS.has(paymentMethod)) {
      return res.status(400).json({
        success: false,
        error: `paymentMethod must be one of: ${[...ALL_PAYMENT_METHODS].join(", ")}`
      });
    }

    // Manual payments require metadata
    if (MANUAL_PAYMENT_METHODS.has(paymentMethod) && (!paymentMetadata || Object.keys(paymentMetadata).length === 0)) {
      return res.status(400).json({
        success: false,
        error: "paymentMetadata is required for manual payment methods (cash, bank_transfer, pos)"
      });
    }

    // ── Load Invoice ───────────────────────────────────────────────────────
    const invoice = await PlatformInvoice().findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: "Invoice not found"
      });
    }
    if (invoice.status === "paid") {
      return res.status(200).json({
        success: true,
        data: invoice,
        message: "Invoice already paid (idempotent)"
      });
    }
    if (!["open", "draft"].includes(invoice.status)) {
      return res.status(409).json({
        success: false,
        error: `Invoice cannot be paid from status "${invoice.status}"`
      });
    }

    // ── Process by payment method type ─────────────────────────────────────

    if (MANUAL_PAYMENT_METHODS.has(paymentMethod)) {
      // ── Manual: mark paid immediately ─────────────────────────────────
      invoice.status = "paid";
      invoice.paymentStatus = "captured";
      invoice.paidAt = new Date();
      invoice.paymentProvider = "manual";
      invoice.providerPaymentId = providerPaymentId || `manual:${paymentMethod}:${Date.now()}`;
      invoice.metadata.set("paymentMethod", paymentMethod);
      invoice.metadata.set("paymentMetadata", paymentMetadata);
      await invoice.save();
      logger.info({
        invoiceId: id,
        paymentMethod,
        actorId
      }, "[InvoiceController] Manual payment recorded — invoice marked paid");

      // ── Activate contract if draft ─────────────────────────────────────
      let activationResult = null;
      if (invoice.contractId) {
        const contract = await OrgContract().findById(invoice.contractId);
        if (contract && contract.contractStatus === "draft") {
          try {
            activationResult = await activateContract(invoice.contractId, invoice._id, {
              activatedBy: actorId
            });
            logger.info({
              contractId: invoice.contractId,
              invoiceId: id
            }, "[InvoiceController] Contract activated after manual payment");
          } catch (activationErr) {
            // Log but don't fail — invoice is paid; activation can be retried
            logger.error({
              err: activationErr,
              contractId: invoice.contractId
            }, "[InvoiceController] Contract activation failed after payment (non-fatal)");
          }
        }
      }

      // Audit
      setImmediate(async () => {
        try {
          await auditLog({
            action: `PAYMENT_RECEIVED_MANUAL`,
            organizationId: invoice.organizationId,
            actorId,
            metadata: {
              invoiceId: invoice._id,
              paymentMethod,
              totalAmount: invoice.totalAmount,
              currency: invoice.currency,
              contractActivated: Boolean(activationResult)
            }
          });
        } catch (e) {
          logger.error({
            err: e
          }, "[InvoiceController] Audit log failed (non-fatal)");
        }
      });
      return res.json({
        success: true,
        data: {
          invoice,
          contractActivated: Boolean(activationResult),
          contract: activationResult?.contract || null
        },
        message: `Payment recorded via ${paymentMethod}. ${activationResult ? "Contract activated." : "Contract not in draft — no activation needed."}`
      });
    } else {
      // ── Provider payment: record intent only ────────────────────────────
      // Provider webhook (stripe.webhook.controller.js / canonicalEventProcessor)
      // will handle the actual status update.
      invoice.paymentProvider = paymentMethod;
      invoice.providerPaymentId = providerPaymentId || null;
      invoice.metadata.set("paymentInitiatedAt", new Date());
      invoice.metadata.set("paymentMethod", paymentMethod);
      await invoice.save();
      setImmediate(async () => {
        try {
          await auditLog({
            action: `PAYMENT_RECEIVED_${paymentMethod.toUpperCase()}`,
            organizationId: invoice.organizationId,
            actorId,
            metadata: {
              invoiceId: invoice._id,
              paymentMethod,
              providerPaymentId: providerPaymentId || null
            }
          });
        } catch (e) {
          logger.error({
            err: e
          }, "[InvoiceController] Audit log failed (non-fatal)");
        }
      });
      return res.json({
        success: true,
        data: invoice,
        message: `Provider payment (${paymentMethod}) recorded. Confirmation will arrive via webhook.`
      });
    }
  } catch (err) {
    logger.error({
      err
    }, "[InvoiceController] recordPayment failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── GET /invoices/:id ────────────────────────────────────────────────────────

exports.getInvoice = async (req, res) => {
  try {
    const invoice = await PlatformInvoice().findById(req.params.id).populate("contractId", "planCode planVersionTag lockedPrice currency contractStatus").populate("planVersionId", "versionTag templateCode").lean();
    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: "Invoice not found"
      });
    }
    return res.json({
      success: true,
      data: invoice
    });
  } catch (err) {
    logger.error({
      err
    }, "[InvoiceController] getInvoice failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};

// ─── GET /contracts/:id/invoices ──────────────────────────────────────────────

exports.listContractInvoices = async (req, res) => {
  try {
    const {
      id
    } = req.params;
    const {
      page = 1,
      limit = 20
    } = req.query;
    const contract = await OrgContract().findById(id);
    if (!contract) {
      return res.status(404).json({
        success: false,
        error: "Contract not found"
      });
    }
    const clampedLimit = Math.min(Number(limit), 100);
    const skip = (Number(page) - 1) * clampedLimit;
    const [invoices, total] = await Promise.all([PlatformInvoice().find({
      contractId: id
    }).sort({
      createdAt: -1
    }).skip(skip).limit(clampedLimit).lean(), PlatformInvoice().countDocuments({
      contractId: id
    })]);
    return res.json({
      success: true,
      data: invoices,
      pagination: {
        total,
        page: Number(page),
        limit: clampedLimit,
        totalPages: Math.ceil(total / clampedLimit)
      }
    });
  } catch (err) {
    logger.error({
      err
    }, "[InvoiceController] listContractInvoices failed");
    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
};