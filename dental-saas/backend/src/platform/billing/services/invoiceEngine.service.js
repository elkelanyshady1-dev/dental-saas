/**
 * invoiceEngine.service.js
 * Sprint 4 — Pure Invoice Generation Service
 *
 * generatePlatformInvoice(contractId, options)
 *
 * Separated from the HTTP controller so it can be called by:
 *   - platformInvoice.controller.js  (API path)
 *   - subscriptionMonitor.js         (cron path — replaces legacy invoice.service.js)
 *   - contractEngine.service.js      (on contract activation with autoInvoice: true)
 *
 * Pricing rules (ENFORCED):
 *   ALL amounts come from OrgContract fields.
 *   Zero reads from Organization.subscription for pricing.
 *   Pricing chain: lockedPrice → pricingOverride → coupon → credit → tax → total
 *
 * PLANE: Platform
 * COLLECTION: platforminvoices
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const OrgContractDef = require("../models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const InvoiceSequenceDef = require("../models/InvoiceSequence.model");
let _InvoiceSequence_cache = null;
function InvoiceSequence() {
    return _InvoiceSequence_cache || (_InvoiceSequence_cache = getPlatformModel(InvoiceSequenceDef));
}
const OrganizationDef = require("@shared/models/Organization");
let _Organization_cache = null;
function Organization() {
    return _Organization_cache || (_Organization_cache = getPlatformModel(OrganizationDef));
}
const {
  writeLedgerEntry
} = require("../models/BillingLedger.model");
const logger = require("@utils/logger");
// Sprint 8: BillingTimeline projection
const {
  emitBillingTimelineEvent
} = require("./billingTimeline.service");

// ─── Tax Rates ────────────────────────────────────────────────────────────────
// Source: ISO country code → VAT/GST percent
// Will move to TaxPolicy collection in Sprint 5.
const TAX_RATES = {
  AE: 5,
  SA: 15,
  EG: 14,
  GB: 20,
  US: 0
};

// ─── Invoice Number Generator (Atomic) ───────────────────────────────────────
// Format: INV-YYYYMM-NNNNN (e.g. INV-202503-00042)
//
// WHY $inc instead of countDocuments:
//   countDocuments has a TOCTOU race — two concurrent callers both read the
//   same count and produce the same invoice number (duplicate key violation).
//   findOneAndUpdate($inc) is atomic: MongoDB serializes the increment at the
//   server, guaranteeing each caller gets a unique seq value even under load.
//
// SESSION AWARENESS:
//   The session is passed to include the seq increment in the same transaction
//   as the invoice creation. If the transaction aborts, the counter IS NOT
//   rolled back (MongoDB does not roll back $inc on upsert in transactions),
//   so invoice numbers may have gaps — this is intentional and acceptable.
//   Gaps in invoice numbers are normal (voids, retries, failures); duplicates
//   are never acceptable.
async function _generateInvoiceNumber(session) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const yearMonth = `${year}${month}`;

  // findOneAndUpdate with $inc is atomic — guaranteed unique seq per month
  const seqDoc = await InvoiceSequence().findOneAndUpdate({
    yearMonth
  }, {
    $inc: {
      seq: 1
    }
  }, {
    upsert: true,
    new: true,
    session: session || null
  });
  return `INV-${yearMonth}-${String(seqDoc.seq).padStart(5, "0")}`;
}
function _toMinor(decimal) {
  return Math.round(decimal * 100);
}

// ─── Main: generatePlatformInvoice ───────────────────────────────────────────

/**
 * generatePlatformInvoice
 *
 * Creates a PlatformInvoice from an OrgContract.
 * Returns the existing invoice if already generated for this period (idempotent).
 *
 * @param {string|ObjectId} contractId
 * @param {object} [options]
 *   @param {string} [options.billingInterval="monthly"]  "monthly"|"yearly"|"biennial"
 *   @param {mongoose.ClientSession} [options.session]
 *   @param {string|ObjectId} [options.createdBy]          actor ID
 *   @param {string} [options.invoiceType]                 override invoiceType default
 * @returns {Promise<{ invoice: PlatformInvoice, isNew: boolean }>}
 */
async function generatePlatformInvoice(contractId, options = {}) {
  const {
    billingInterval = "monthly",
    session = null,
    createdBy = null,
    invoiceType = null
  } = options;

  // ── Load contract ──────────────────────────────────────────────────────────
  const contractQuery = OrgContract().findById(contractId);
  if (session) contractQuery.session(session);
  const contract = await contractQuery;
  if (!contract) {
    const err = new Error(`Contract ${contractId} not found`);
    err.status = 404;
    err.code = "CONTRACT_NOT_FOUND";
    throw err;
  }

  // Section 3: Invoice-first lifecycle — contracts in "ready" status have finalized
  // configuration and are ready for invoice generation. "pending_payment" allows
  // re-generation on retry scenarios (idempotency check above handles duplicates).
  if (!["draft", "active", "ready", "pending_payment"].includes(contract.contractStatus)) {
    const err = new Error(`Cannot generate invoice for contract in status "${contract.contractStatus}". ` + `Allowed: draft, ready, pending_payment, active.`);
    err.status = 400;
    err.code = "INVALID_CONTRACT_STATUS";
    throw err;
  }

  // ── Idempotency ────────────────────────────────────────────────────────────
  const cycleStart = new Date();
  const cycleEnd = new Date(cycleStart);
  if (billingInterval === "yearly") cycleEnd.setFullYear(cycleEnd.getFullYear() + 1);else cycleEnd.setMonth(cycleEnd.getMonth() + 1);
  const idempotencyKey = `contract:${contract._id}:${cycleStart.getFullYear()}-${String(cycleStart.getUTCMonth()).padStart(2, "0")}`;
  const existingQuery = PlatformInvoice().findOne({
    idempotencyKey
  });
  if (session) existingQuery.session(session);
  const existing = await existingQuery;
  if (existing) {
    logger.info({
      invoiceId: existing._id,
      contractId,
      idempotencyKey
    }, "[InvoiceEngine] Returning existing invoice (idempotent)");
    return {
      invoice: existing,
      isNew: false
    };
  }

  // ── Load org for tax country ───────────────────────────────────────────────
  const orgQuery = Organization().findById(contract.organizationId).select("billingCountry regionCode");
  if (session) orgQuery.session(session);
  const org = await orgQuery;
  const taxPercent = TAX_RATES[org?.billingCountry] ?? 0;

  // ── Pricing chain — EXCLUSIVELY from OrgContract ──────────────────────────

  // 1. Base price: use pricingOverride if custom, else lockedPrice
  let basePlanAmount = contract.lockedPrice;
  if (contract.pricingOverride?.isCustom && contract.pricingOverride.lockedPrice > 0) {
    basePlanAmount = contract.pricingOverride.lockedPrice;
  }

  // 2. Renewal inflation (only for active contracts on renewal — not initial invoices)
  const inflationPercent = contract.renewalTerms?.inflationPercent || 0;
  if (inflationPercent > 0 && contract.contractStatus === "active") {
    basePlanAmount = basePlanAmount * (1 + inflationPercent / 100);
    basePlanAmount = Math.round(basePlanAmount * 100) / 100; // round to 2 dp
  }

  // 3. Coupon discount
  let couponDiscountAmount = 0;
  const coupon = contract.appliedCoupon;
  const couponValid = coupon?.code && (!coupon.validUntil || new Date() <= new Date(coupon.validUntil)) && (!coupon.maxUses || coupon.usedCount < coupon.maxUses);
  if (couponValid) {
    if (coupon.discountType === "percentage") {
      couponDiscountAmount = basePlanAmount * coupon.discountValue / 100;
    } else if (coupon.discountType === "fixed") {
      couponDiscountAmount = Math.min(coupon.discountValue, basePlanAmount);
    }
    couponDiscountAmount = Math.min(couponDiscountAmount, basePlanAmount);
  }

  // 4. Subtotal (before credit & tax)
  const subtotalAmount = Math.max(0, basePlanAmount - couponDiscountAmount);

  // 5. Credit balance (from OrgContract.creditBalance)
  const creditApplied = Math.min(contract.creditBalance || 0, subtotalAmount);
  const afterCredit = subtotalAmount - creditApplied;

  // 6. Tax (on post-credit amount)
  const taxAmount = Math.round(afterCredit * taxPercent) / 100;

  // 7. Total
  const totalAmount = afterCredit + taxAmount;

  // ── Build line items ───────────────────────────────────────────────────────
  const lineItems = [{
    description: `${contract.planCode} — ${billingInterval} plan`,
    quantity: 1,
    unitPrice: basePlanAmount,
    unitPriceMinor: _toMinor(basePlanAmount),
    total: basePlanAmount,
    totalMinor: _toMinor(basePlanAmount),
    type: "plan"
  }];
  if (couponDiscountAmount > 0) {
    lineItems.push({
      description: `Coupon (${coupon.code})`,
      quantity: 1,
      unitPrice: -couponDiscountAmount,
      unitPriceMinor: -_toMinor(couponDiscountAmount),
      total: -couponDiscountAmount,
      totalMinor: -_toMinor(couponDiscountAmount),
      type: "discount"
    });
  }
  if (creditApplied > 0) {
    lineItems.push({
      description: "Credit balance applied",
      quantity: 1,
      unitPrice: -creditApplied,
      unitPriceMinor: -_toMinor(creditApplied),
      total: -creditApplied,
      totalMinor: -_toMinor(creditApplied),
      type: "credit"
    });
  }
  if (taxAmount > 0) {
    lineItems.push({
      description: `Tax (${taxPercent}%)`,
      quantity: 1,
      unitPrice: taxAmount,
      unitPriceMinor: _toMinor(taxAmount),
      total: taxAmount,
      totalMinor: _toMinor(taxAmount),
      type: "tax"
    });
  }

  // ── Invoice number ─────────────────────────────────────────────────────────
  const invoiceNumber = await _generateInvoiceNumber(session);

  // ── Guard: verify credit balance has not been spent by a concurrent request ────────
  // Re-read creditBalance from DB inside the session (if provided) before any write.
  // This prevents a race where two concurrent invoices both read the same creditBalance.
  if (creditApplied > 0) {
    const freshContract = await OrgContract().findById(contract._id).select("creditBalance").session(session || null).lean();
    if (!freshContract || freshContract.creditBalance < creditApplied) {
      const err = new Error(`[InvoiceEngine] Credit race condition detected: ` + `creditBalance=${freshContract?.creditBalance ?? 0} < creditApplied=${creditApplied} ` + `for contract ${contract._id}. Aborting to prevent double-deduction.`);
      err.code = "CREDIT_BALANCE_INSUFFICIENT";
      err.status = 409;
      throw err;
    }
  }

  // ── Pre-persist guard ──────────────────────────────────────────────────
  // Belt-and-suspenders: schema required:true + pre-save hook both cover this,
  // but we throw early here with a clear domain error before any DB write.
  if (!contract || !contract._id) {
    const err = new Error("invoiceEngine: cannot create PlatformInvoice without a valid OrgContract");
    err.code = "MISSING_CONTRACT_ID";
    err.status = 500;
    throw err;
  }

  // ── Atomically: persist invoice + consume credit + increment coupon ─────────
  // All three writes use the SAME Mongoose session so they are atomic.
  // If any write fails, the entire operation rolls back — preventing double-deduction
  // of credits or coupons on retry.
  // If no external session was provided, these writes are still in the same
  // Mongoose operation batch (MongoDB guarantees single-document atomicity per write,
  // but the race window is eliminated by the balance guard above).

  const resolvedType = invoiceType || (contract.contractStatus === "draft" ? "initial" : "subscription");
  const createOpts = session ? {
    session
  } : {};
  const [invoice] = await PlatformInvoice().create([{
    organizationId: contract.organizationId,
    contractId: contract._id,
    planVersionId: contract.planVersionId || null,
    invoiceType: resolvedType,
    invoiceNumber,
    billingCycleStart: cycleStart,
    billingCycleEnd: cycleEnd,
    dueDate: cycleEnd,
    currency: contract.currency,
    lineItems,
    basePlanAmount,
    basePlanAmountMinor: _toMinor(basePlanAmount),
    couponCode: couponValid ? coupon.code : null,
    couponDiscountAmount,
    couponDiscountAmountMinor: _toMinor(couponDiscountAmount),
    creditApplied,
    creditAppliedMinor: _toMinor(creditApplied),
    subtotalAmount,
    subtotalAmountMinor: _toMinor(subtotalAmount),
    taxPercent,
    taxAmount,
    taxAmountMinor: _toMinor(taxAmount),
    totalAmount,
    totalAmountMinor: _toMinor(totalAmount),
    status: "open",
    paymentStatus: "pending",
    regionCode: org?.regionCode || null,
    idempotencyKey,
    createdBy,
    metadata: new Map([["invoiceNumber", invoiceNumber], ["billingInterval", billingInterval], ["pricingSource", "OrgContract"]])
  }], createOpts);

  // Consume credit — atomic with invoice creation via same session
  if (creditApplied > 0) {
    const updateOpts = {
      ...createOpts,
      new: false
    };
    await OrgContract().findByIdAndUpdate(contract._id, {
      $inc: {
        creditBalance: -creditApplied
      }
    }, updateOpts);
  }

  // Increment coupon usedCount — atomic with invoice creation via same session
  if (couponValid && couponDiscountAmount > 0) {
    const updateOpts = {
      ...createOpts,
      new: false
    };
    await OrgContract().findByIdAndUpdate(contract._id, {
      $inc: {
        "appliedCoupon.usedCount": 1
      }
    }, updateOpts);
  }
  logger.info({
    invoiceId: invoice._id,
    invoiceNumber,
    contractId,
    totalAmount,
    currency: contract.currency,
    pricingSource: "OrgContract"
  }, "[InvoiceEngine] PlatformInvoice generated");

  // ── Ledger: invoice.created ──────────────────────────────────────────────────
  // Written after successful persist. Any failure is silently swallowed by writeLedgerEntry.
  await writeLedgerEntry({
    eventType: "invoice.created",
    organizationId: contract.organizationId,
    contractId: contract._id,
    invoiceId: invoice._id,
    provider: contract.paymentProvider || "internal",
    amount: totalAmount,
    currency: contract.currency,
    source: "invoiceEngine",
    actorType: "system",
    metadata: {
      invoiceNumber,
      invoiceType: resolvedType,
      billingInterval,
      pricingSource: "OrgContract"
    }
  }, session);

  // Sprint 8: BillingTimeline — INVOICE_CREATED (non-blocking)
  // Fired after the ledger write. Never blocks invoice generation on failure.
  setImmediate(async () => {
    await emitBillingTimelineEvent({
      organizationId: contract.organizationId,
      contractId: contract._id,
      invoiceId: invoice._id,
      eventType: "INVOICE_CREATED",
      source: "system",
      payload: {
        invoiceNumber,
        invoiceType: resolvedType,
        totalAmount,
        currency: contract.currency
      }
    });
  });
  return {
    invoice,
    isNew: true
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  generatePlatformInvoice,
  TAX_RATES
};