/**
 * financial.projection.js
 * Billing Domain — Print Views (READ MODEL)
 *
 * CLASSIFICATION: READ MODEL — invoice/payment/receipt rendering DTOs.
 * LOCATION: billingDomain/projections/printViews/ (Phase G restructure)
 * Phase 3.3 — Strict per-org model resolution via getModel. No fallback.
 *
 * @per-org-transactional — Called by print services with explicit organizationId parameter.
 * All queries include organizationId as a function argument. No direct HTTP exposure.
 */
const PatientInvoiceDef = require("@modules/billingDomain/organizationFinance/models/PatientInvoice.model");
const PatientPaymentDef = require("@modules/billingDomain/organizationFinance/models/PatientPayment.model");
const PaymentAllocationDef = require("@modules/billingDomain/organizationFinance/models/PaymentAllocation.model");
const FinancialSnapshotDef = require("../snapshot/FinancialSnapshot.model");
const getModel = require("@core/db/getModel");
const Money = require("@utils/money");

// ─── Strict Per-Org Model Resolvers (Phase 3.3) ─────────────────────────────
function _getInvoice(connection) {
  if (!connection) throw new Error("[BillingPrintProjection] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, PatientInvoiceDef);
}
function _getPayment(connection) {
  if (!connection) throw new Error("[BillingPrintProjection] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, PatientPaymentDef);
}
function _getAllocation(connection) {
  if (!connection) throw new Error("[BillingPrintProjection] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, PaymentAllocationDef);
}
function _getSnapshot(connection) {
  if (!connection) throw new Error("[BillingPrintProjection] connection is REQUIRED — per-org mode does not allow fallback");
  return getModel(connection, FinancialSnapshotDef);
}

/**
 * Standardized Financial Summary Projection (Snapshot-Backed)
 */
async function buildPatientFinancialSummary({
  organizationId,
  patientId,
  connection
}) {
  const snapshot = await _getSnapshot(connection).findOne({
    patientId
  }).lean();
  if (!snapshot) {
    return {
      patientId: patientId.toString(),
      totalInvoiced: 0,
      totalPaid: 0,
      outstandingBalance: 0,
      walletBalance: 0,
      currency: "USD"
    };
  }
  return {
    patientId: patientId.toString(),
    totalInvoiced: snapshot.totalInvoiced,
    totalPaid: snapshot.totalPaid,
    outstandingBalance: snapshot.outstandingBalance,
    walletBalance: snapshot.walletBalance,
    currency: "USD"
  };
}

/**
 * buildInvoicePrintView(invoiceId, organizationId)
 * Returns a clean DTO for document rendering.
 */
async function buildInvoicePrintView({
  invoiceId,
  organizationId,
  connection
}) {
  const PatientInvoice = _getInvoice(connection);
  const invoice = await PatientInvoice.findOne({
    _id: invoiceId
  }).populate("patientId", "nameArabic nameEnglish phone").populate("treatmentOperatorId", "name").populate("issuedByUserId", "name").lean();
  if (!invoice) throw new Error("Invoice not found or unauthorized.");
  const PaymentAllocation = _getAllocation(connection);
  const allocations = await PaymentAllocation.find({
    invoiceId
  }).lean();
  const totalAllocated = allocations.reduce((sum, a) => Money.add(sum, a.allocatedAmount), 0);
  return {
    invoiceId: invoice._id,
    invoiceNumber: `INV-${invoice._id.toString().slice(-6).toUpperCase()}`,
    invoiceDate: invoice.createdAt.toLocaleDateString("en-GB"),
    status: invoice.status,
    patientName: invoice.patientId.nameArabic || invoice.patientId.nameEnglish,
    patientPhone: invoice.patientId.phone,
    treatments: invoice.treatments.map(t => ({
      procedureName: t.procedureName,
      toothNumber: t.toothNumber || "-",
      unitPrice: t.unitPrice.toFixed(2),
      quantity: t.quantity,
      subtotal: t.subtotal.toFixed(2)
    })),
    charges: invoice.charges.map(c => ({
      type: c.type,
      description: c.description || "-",
      amount: c.amount.toFixed(2)
    })),
    subtotal: invoice.subtotal.toFixed(2),
    discount: invoice.discount.toFixed(2),
    tax: invoice.tax.toFixed(2),
    totalAmount: invoice.totalAmount.toFixed(2),
    totalPaid: totalAllocated.toFixed(2),
    remainingBalance: Money.subtract(invoice.totalAmount, totalAllocated).toFixed(2),
    treatmentOperatorName: invoice.treatmentOperatorId?.name || "-",
    issuedByUserName: invoice.issuedByUserId?.name || "System"
  };
}

/**
 * buildPaymentPrintView(paymentId, organizationId)
 * Returns a clean DTO for receipt rendering.
 */
async function buildPaymentPrintView({
  paymentId,
  organizationId,
  connection
}) {
  const PatientPayment = _getPayment(connection);
  const payment = await PatientPayment.findOne({
    _id: paymentId
  }).populate("patientId", "nameArabic nameEnglish phone").populate("collectedByUserId", "name").lean();
  if (!payment) throw new Error("Payment not found or unauthorized.");
  const PaymentAllocation = _getAllocation(connection);
  const allocations = await PaymentAllocation.find({
    paymentId
  }).populate("invoiceId", "totalAmount createdAt").lean();
  const allocationBreakdown = allocations.map(a => ({
    invoiceNumber: `INV-${a.invoiceId._id.toString().slice(-6).toUpperCase()}`,
    invoiceDate: a.invoiceId.createdAt.toLocaleDateString("en-GB"),
    invoiceTotal: a.invoiceId.totalAmount.toFixed(2),
    allocatedAmount: a.allocatedAmount.toFixed(2)
  }));
  return {
    paymentId: payment._id,
    receiptNumber: `RCP-${payment._id.toString().slice(-6).toUpperCase()}`,
    paymentDate: payment.createdAt.toLocaleDateString("en-GB"),
    patientName: payment.patientId.nameArabic || payment.patientId.nameEnglish,
    patientPhone: payment.patientId.phone,
    amountPaid: payment.amount.toFixed(2),
    paymentMethod: payment.paymentMethod,
    collectedBy: payment.collectedByUserId?.name || "System",
    allocations: allocationBreakdown,
    walletUsed: 0.00,
    remainingBalance: 0.00
  };
}
module.exports = {
  buildPatientFinancialSummary,
  buildInvoicePrintView,
  buildPaymentPrintView
};