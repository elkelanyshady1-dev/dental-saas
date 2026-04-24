/**
 * financeExport.service.js
 * Platform Finance — CSV Streaming Export Service
 *
 * Streaming CSV export functions for finance data.
 * Uses Node.js streams natively — no external CSV library required.
 *
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const {
  Transform
} = require("stream");
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const BillingLedgerDef = require("../models/BillingLedger.model");
let _BillingLedger_cache = null;
function BillingLedger() {
    return _BillingLedger_cache || (_BillingLedger_cache = getPlatformModel(BillingLedgerDef));
}
const PaymentAttemptDef = require("../models/PaymentAttempt.model");
let _PaymentAttempt_cache = null;
function PaymentAttempt() {
    return _PaymentAttempt_cache || (_PaymentAttempt_cache = getPlatformModel(PaymentAttemptDef));
}
const logger = require("@utils/logger");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escapeCsv(val) {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
}
function rowToCsv(fields) {
  return fields.map(escapeCsv).join(",") + "\r\n";
}
function setCsvHeaders(res, filename) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
}

// ─── Invoice Export ────────────────────────────────────────────────────────────

/**
 * streamInvoicesCsv
 * Streams paginated PlatformInvoice data as CSV.
 *
 * @param {object} filters   - MongoDB query filters
 * @param {object} res       - Express response object
 */
async function streamInvoicesCsv(filters, res) {
  const filename = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
  setCsvHeaders(res, filename);
  const header = rowToCsv(["Invoice Number", "Organization ID", "Total Amount", "Currency", "Status", "Payment Status", "Created At", "Paid At", "Due Date"]);
  res.write(header);
  try {
    const cursor = PlatformInvoice().find(filters).select("invoiceNumber organizationId totalAmount currency status paymentStatus createdAt paidAt dueDate").sort({
      createdAt: -1
    }).limit(5000).lean().cursor();
    for await (const doc of cursor) {
      res.write(rowToCsv([doc.invoiceNumber, doc.organizationId, doc.totalAmount, doc.currency, doc.status, doc.paymentStatus, doc.createdAt?.toISOString(), doc.paidAt?.toISOString() ?? "", doc.dueDate?.toISOString()]));
    }
  } catch (err) {
    logger.error({
      err
    }, "[financeExport] streamInvoicesCsv failed");
    res.write(rowToCsv(["ERROR", err.message]));
  } finally {
    res.end();
  }
}

// ─── Ledger Export ─────────────────────────────────────────────────────────────

/**
 * streamLedgerCsv
 * Streams BillingLedger entries as CSV.
 *
 * @param {object} filters   - MongoDB query filters
 * @param {object} res       - Express response object
 */
async function streamLedgerCsv(filters, res) {
  const filename = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  setCsvHeaders(res, filename);
  const header = rowToCsv(["Timestamp", "Event Type", "Amount", "Currency", "Organization ID", "Contract ID", "Invoice ID", "Provider", "Source", "Actor Type"]);
  res.write(header);
  try {
    const cursor = BillingLedger().find(filters).select("createdAt eventType amount currency organizationId contractId invoiceId provider source actorType").sort({
      createdAt: -1
    }).limit(5000).lean().cursor();
    for await (const doc of cursor) {
      res.write(rowToCsv([doc.createdAt?.toISOString(), doc.eventType, doc.amount, doc.currency, doc.organizationId, doc.contractId ?? "", doc.invoiceId ?? "", doc.provider, doc.source, doc.actorType]));
    }
  } catch (err) {
    logger.error({
      err
    }, "[financeExport] streamLedgerCsv failed");
    res.write(rowToCsv(["ERROR", err.message]));
  } finally {
    res.end();
  }
}

// ─── Payments Export ───────────────────────────────────────────────────────────

/**
 * streamPaymentsCsv
 * Streams PaymentAttempt records as CSV.
 *
 * @param {object} filters   - MongoDB query filters
 * @param {object} res       - Express response object
 */
async function streamPaymentsCsv(filters, res) {
  const filename = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
  setCsvHeaders(res, filename);
  const header = rowToCsv(["Timestamp", "Organization ID", "Invoice ID", "Provider", "Provider Payment ID", "Amount", "Currency", "Status", "Attempt #", "Error Code", "Error Message"]);
  res.write(header);
  try {
    const cursor = PaymentAttempt().find(filters).select("createdAt organizationId invoiceId provider providerPaymentId amount currency status attemptNumber errorCode errorMessage").sort({
      createdAt: -1
    }).limit(5000).lean().cursor();
    for await (const doc of cursor) {
      res.write(rowToCsv([doc.createdAt?.toISOString(), doc.organizationId, doc.invoiceId, doc.provider, doc.providerPaymentId ?? "", doc.amount, doc.currency, doc.status, doc.attemptNumber, doc.errorCode ?? "", doc.errorMessage ?? ""]));
    }
  } catch (err) {
    logger.error({
      err
    }, "[financeExport] streamPaymentsCsv failed");
    res.write(rowToCsv(["ERROR", err.message]));
  } finally {
    res.end();
  }
}
module.exports = {
  streamInvoicesCsv,
  streamLedgerCsv,
  streamPaymentsCsv
};