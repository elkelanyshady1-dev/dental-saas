/**
 * billingInvariantMonitor.service.js
 * Sprint 4 — Financial Integrity Monitoring
 * Sprint 5 — Production Safety Layer (PAYMENT_WITHOUT_INVOICE + flat API output)
 *
 * THREE INVARIANT CHECKS:
 *
 *   1. checkPaymentTotals(opts)
 *      ─────────────────────────────────────────────────────────────────────────
 *      INVARIANT: sum(ledger payment.succeeded) === sum(paid PlatformInvoice.totalAmountMinor)
 *
 *      Why: The ledger and invoice collection track the same money from two
 *      independent angles. Divergence means either:
 *        a) a payment was recorded in the ledger but the invoice never updated to "paid"
 *        b) an invoice was marked "paid" but no ledger entry was written (ledger write failed)
 *        c) a bug caused amounts to differ (rounding, currency mismatch, etc.)
 *
 *   2. replayLedgerRevenue(opts)
 *      ─────────────────────────────────────────────────────────────────────────
 *      Reconstructs net revenue purely from ledger events (event-sourced approach).
 *      Applies: payment.succeeded − invoice.refunded = net revenue
 *
 *      Why: Revenue calculations must be reproducible from raw events alone.
 *      Verifies the ledger is self-consistent and sufficient for revenue reporting.
 *
 *   3. detectAnomalies(opts)
 *      ─────────────────────────────────────────────────────────────────────────
 *      Scans for financial data integrity violations:
 *        A. refund > payment (net negative position per org)
 *        B. invoice totalAmountMinor < 0 (negative invoice — always wrong)
 *        C. paid invoices missing a corresponding ledger payment.succeeded entry
 *        D. invoices with no contractId (orphaned)
 *        E. duplicate invoiceNumber values
 *        F. payment.succeeded with no invoiceId or invoiceId pointing to missing invoice
 *           (PAYMENT_WITHOUT_INVOICE — webhook failure / partial commit / manual corruption)
 *
 *   4. runFullIntegrityCheck(opts)
 *      ─────────────────────────────────────────────────────────────────────────
 *      Runs all three checks and returns a structured report.
 *      Designed to be called by a daily cron job or CI gate.
 *      Returns the flat { ok, checks, anomalies[] } shape expected by the admin
 *      endpoint and the scheduled billing integrity job.
 *
 * ALL OPERATIONS ARE READ-ONLY. No collections are mutated.
 *
 * PLANE: Platform
 * COLLECTIONS READ: billingledger, platforminvoices
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const BillingLedgerDef = require("../models/BillingLedger.model");
let _BillingLedger_cache = null;
function BillingLedger() {
    return _BillingLedger_cache || (_BillingLedger_cache = getPlatformModel(BillingLedgerDef));
}
const PlatformInvoiceDef = require("../models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const logger = require("@utils/logger");

// ─── Constants ────────────────────────────────────────────────────────────────

// Tolerance for floating-point rounding noise across large aggregations.
// Amounts are stored as minor units (integers) so this should always be 0.
// We allow 1 minor unit (e.g. 1 cent) tolerance to guard against legacy data.
const MINOR_UNIT_TOLERANCE = 1;

// Maximum number of anomalous records to return per category (prevents oversized reports)
const MAX_ANOMALY_SAMPLE = 50;

// ─── 1. Payment Totals Invariant Check ────────────────────────────────────────

/**
 * checkPaymentTotals
 *
 * Checks that the sum of all payment.succeeded events in BillingLedger
 * matches the sum of totalAmountMinor across all paid PlatformInvoices.
 *
 * Can be scoped to a specific organizationId, currency, or date range.
 *
 * @param {object} [opts]
 * @param {string|ObjectId} [opts.organizationId]  - Scope to one org (optional)
 * @param {string}          [opts.currency]         - Scope to one currency (optional)
 * @param {Date}            [opts.from]             - Start of date range (createdAt >=)
 * @param {Date}            [opts.to]               - End of date range (createdAt <=)
 *
 * @returns {Promise<{
 *   passed: boolean,
 *   ledgerTotalMinor: number,
 *   invoiceTotalMinor: number,
 *   discrepancyMinor: number,
 *   currency: string|null,
 *   organizationId: string|null,
 *   details: string
 * }>}
 */
async function checkPaymentTotals(opts = {}) {
  const {
    organizationId,
    currency,
    from,
    to
  } = opts;

  // ── Build shared match stage ────────────────────────────────────────────────
  const matchBase = {};
  if (organizationId) matchBase.organizationId = new mongoose.Types.ObjectId(organizationId);
  if (currency) matchBase.currency = currency.toUpperCase();
  if (from || to) {
    matchBase.createdAt = {};
    if (from) matchBase.createdAt.$gte = new Date(from);
    if (to) matchBase.createdAt.$lte = new Date(to);
  }

  // ── Ledger: sum payment.succeeded amountMinor ──────────────────────────────
  const [ledgerResult] = await BillingLedger().aggregate([{
    $match: {
      ...matchBase,
      eventType: "payment.succeeded"
    }
  }, {
    $group: {
      _id: null,
      total: {
        $sum: "$amountMinor"
      },
      count: {
        $sum: 1
      }
    }
  }]);
  const ledgerTotalMinor = ledgerResult?.total ?? 0;
  const ledgerCount = ledgerResult?.count ?? 0;

  // ── Invoices: sum totalAmountMinor for paid invoices ───────────────────────
  // Scope invoice date filter to paidAt (not createdAt) so the window aligns.
  const invoiceMatch = {
    status: "paid"
  };
  if (organizationId) invoiceMatch.organizationId = new mongoose.Types.ObjectId(organizationId);
  if (currency) invoiceMatch.currency = currency.toUpperCase();
  if (from || to) {
    invoiceMatch.paidAt = {};
    if (from) invoiceMatch.paidAt.$gte = new Date(from);
    if (to) invoiceMatch.paidAt.$lte = new Date(to);
  }
  const [invoiceResult] = await PlatformInvoice().aggregate([{
    $match: invoiceMatch
  }, {
    $group: {
      _id: null,
      total: {
        $sum: "$totalAmountMinor"
      },
      count: {
        $sum: 1
      }
    }
  }]);
  const invoiceTotalMinor = invoiceResult?.total ?? 0;
  const invoiceCount = invoiceResult?.count ?? 0;

  // ── Compare ────────────────────────────────────────────────────────────────
  const discrepancyMinor = Math.abs(ledgerTotalMinor - invoiceTotalMinor);
  const passed = discrepancyMinor <= MINOR_UNIT_TOLERANCE;
  const result = {
    passed,
    ledgerTotalMinor,
    ledgerCount,
    invoiceTotalMinor,
    invoiceCount,
    discrepancyMinor,
    currency: currency?.toUpperCase() ?? null,
    organizationId: organizationId ? String(organizationId) : null,
    details: passed ? `Invariant OK: ledger=${ledgerTotalMinor} invoice=${invoiceTotalMinor} (within ${MINOR_UNIT_TOLERANCE} minor unit tolerance)` : `⚠ INVARIANT VIOLATION: ledger=${ledgerTotalMinor} invoice=${invoiceTotalMinor} discrepancy=${discrepancyMinor} minor units`
  };
  if (!passed) {
    logger.error({
      ...result,
      context: "billingInvariantMonitor.checkPaymentTotals"
    }, "[BillingMonitor] Payment totals invariant VIOLATED");
  } else {
    logger.info(result, "[BillingMonitor] Payment totals invariant passed");
  }
  return result;
}

// ─── 2. Ledger Replay Revenue Reconstruction ──────────────────────────────────

/**
 * replayLedgerRevenue
 *
 * Reconstructs net revenue PURELY from ledger events (event-sourced approach).
 *
 * Formula per org per currency:
 *   gross  = sum(payment.succeeded amountMinor)
 *   refunds = sum(invoice.refunded amountMinor)
 *   net    = gross − refunds
 *
 * Returns a breakdown by organizationId × currency so callers can cross-check
 * against live invoice totals or use for MRR/ARR calculations.
 *
 * @param {object} [opts]
 * @param {string|ObjectId} [opts.organizationId]  - Scope to one org (optional)
 * @param {string}          [opts.currency]         - Scope to one currency (optional)
 * @param {Date}            [opts.from]             - Event window start
 * @param {Date}            [opts.to]               - Event window end
 *
 * @returns {Promise<{
 *   rows: Array<{
 *     organizationId: string,
 *     currency: string,
 *     grossMinor: number,
 *     refundsMinor: number,
 *     netMinor: number,
 *     paymentCount: number,
 *     refundCount: number
 *   }>,
 *   replayedAt: string,
 *   windowFrom: string|null,
 *   windowTo: string|null
 * }>}
 */
async function replayLedgerRevenue(opts = {}) {
  const {
    organizationId,
    currency,
    from,
    to
  } = opts;
  const matchStage = {
    eventType: {
      $in: ["payment.succeeded", "invoice.refunded"]
    }
  };
  if (organizationId) matchStage.organizationId = new mongoose.Types.ObjectId(organizationId);
  if (currency) matchStage.currency = currency.toUpperCase();
  if (from || to) {
    matchStage.createdAt = {};
    if (from) matchStage.createdAt.$gte = new Date(from);
    if (to) matchStage.createdAt.$lte = new Date(to);
  }

  // Aggregate per org × currency × eventType in one pass
  const rawRows = await BillingLedger().aggregate([{
    $match: matchStage
  }, {
    $group: {
      _id: {
        organizationId: "$organizationId",
        currency: "$currency",
        eventType: "$eventType"
      },
      totalMinor: {
        $sum: "$amountMinor"
      },
      count: {
        $sum: 1
      }
    }
  }, {
    $group: {
      _id: {
        organizationId: "$_id.organizationId",
        currency: "$_id.currency"
      },
      events: {
        $push: {
          eventType: "$_id.eventType",
          totalMinor: "$totalMinor",
          count: "$count"
        }
      }
    }
  }, {
    $sort: {
      "_id.organizationId": 1,
      "_id.currency": 1
    }
  }]);

  // ── Reshape into clean rows ────────────────────────────────────────────────
  const rows = rawRows.map(row => {
    const eventsMap = {};
    for (const e of row.events) eventsMap[e.eventType] = e;
    const grossMinor = eventsMap["payment.succeeded"]?.totalMinor ?? 0;
    const refundsMinor = eventsMap["invoice.refunded"]?.totalMinor ?? 0;
    const netMinor = grossMinor - refundsMinor;
    return {
      organizationId: String(row._id.organizationId),
      currency: row._id.currency,
      grossMinor,
      refundsMinor,
      netMinor,
      paymentCount: eventsMap["payment.succeeded"]?.count ?? 0,
      refundCount: eventsMap["invoice.refunded"]?.count ?? 0
    };
  });
  const result = {
    rows,
    replayedAt: new Date().toISOString(),
    windowFrom: from ? new Date(from).toISOString() : null,
    windowTo: to ? new Date(to).toISOString() : null
  };
  logger.info({
    rowCount: rows.length,
    replayedAt: result.replayedAt
  }, "[BillingMonitor] Ledger revenue replay complete");
  return result;
}

// ─── 3. Anomaly Detection ─────────────────────────────────────────────────────

/**
 * detectAnomalies
 *
 * Scans for financial integrity violations across the ledger and invoices.
 *
 * Checks:
 *   A. Net-negative orgs: sum(refunded) > sum(succeeded) per org — means we
 *      refunded more than we ever collected. Always a data bug.
 *
 *   B. Negative invoices: totalAmountMinor < 0 — structurally impossible in
 *      correct billing logic. Indicates a calculation or mutation bug.
 *
 *   C. Orphaned invoices: PlatformInvoice.contractId is null — every invoice
 *      must be linked to a contract. Orphaned invoices are unrecoverable.
 *
 *   D. Paid invoices without ledger entry: PlatformInvoice.status="paid" but
 *      no BillingLedger payment.succeeded for that invoiceId — ledger write
 *      failed or was bypassed (data integrity gap).
 *
 *   E. Duplicate invoice numbers: invoiceNumber appears more than once across
 *      PlatformInvoice — unique index prevents this in production but catches
 *      legacy data or index-bypass bugs.
 *
 * @param {object} [opts]
 * @param {string|ObjectId} [opts.organizationId]  - Scope to one org (optional)
 * @param {Date}            [opts.from]
 * @param {Date}            [opts.to]
 *
 * @returns {Promise<{
 *   passed: boolean,
 *   anomalyCount: number,
 *   anomalies: {
 *     netNegativeOrgs: Array,
 *     negativeInvoices: Array,
 *     orphanedInvoices: Array,
 *     paidInvoicesMissingLedgerEntry: Array,
 *     duplicateInvoiceNumbers: Array
 *   }
 * }>}
 */
async function detectAnomalies(opts = {}) {
  const {
    organizationId,
    from,
    to
  } = opts;
  const orgFilter = organizationId ? {
    organizationId: new mongoose.Types.ObjectId(organizationId)
  } : {};
  const dateFilter = from || to ? {
    createdAt: {
      ...(from ? {
        $gte: new Date(from)
      } : {}),
      ...(to ? {
        $lte: new Date(to)
      } : {})
    }
  } : {};

  // ── A: Net-negative orgs ───────────────────────────────────────────────────
  const netNegativeOrgs = await BillingLedger().aggregate([{
    $match: {
      ...orgFilter,
      ...dateFilter,
      eventType: {
        $in: ["payment.succeeded", "invoice.refunded"]
      }
    }
  }, {
    $group: {
      _id: {
        organizationId: "$organizationId",
        currency: "$currency"
      },
      net: {
        $sum: {
          $cond: [{
            $eq: ["$eventType", "payment.succeeded"]
          }, "$amountMinor", {
            $multiply: ["$amountMinor", -1]
          }]
        }
      }
    }
  }, {
    $match: {
      net: {
        $lt: 0
      }
    }
  }, {
    $limit: MAX_ANOMALY_SAMPLE
  }, {
    $project: {
      _id: 0,
      organizationId: {
        $toString: "$_id.organizationId"
      },
      currency: "$_id.currency",
      netMinor: "$net",
      anomaly: {
        $literal: "refund_exceeds_payment"
      }
    }
  }]);

  // ── B: Negative invoices ───────────────────────────────────────────────────
  const negativeInvoices = await PlatformInvoice().find({
    ...orgFilter,
    ...dateFilter,
    totalAmountMinor: {
      $lt: 0
    }
  }, {
    _id: 1,
    organizationId: 1,
    contractId: 1,
    totalAmountMinor: 1,
    createdAt: 1
  }).limit(MAX_ANOMALY_SAMPLE).lean();

  // ── C: Orphaned invoices (no contractId) ──────────────────────────────────
  const orphanedInvoices = await PlatformInvoice().find({
    ...orgFilter,
    ...dateFilter,
    $or: [{
      contractId: null
    }, {
      contractId: {
        $exists: false
      }
    }]
  }, {
    _id: 1,
    organizationId: 1,
    totalAmountMinor: 1,
    status: 1,
    createdAt: 1
  }).limit(MAX_ANOMALY_SAMPLE).lean();

  // ── D: Paid invoices missing ledger entry ──────────────────────────────────
  // Fetch paid invoice IDs, then find which have no matching ledger entry.
  // Batched to avoid O(n) lookups in tests — samples up to MAX_ANOMALY_SAMPLE.
  const paidInvoices = await PlatformInvoice().find({
    ...orgFilter,
    status: "paid"
  }, {
    _id: 1,
    organizationId: 1,
    totalAmountMinor: 1,
    paidAt: 1
  }).limit(MAX_ANOMALY_SAMPLE * 2).lean();
  const paidInvoiceIds = paidInvoices.map(i => i._id);

  // Find which of these paid invoice IDs have a ledger entry
  const ledgerCoveredIds = await BillingLedger().distinct("invoiceId", {
    eventType: "payment.succeeded",
    invoiceId: {
      $in: paidInvoiceIds
    }
  });
  const coveredSet = new Set(ledgerCoveredIds.map(String));
  const paidInvoicesMissingLedgerEntry = paidInvoices.filter(inv => !coveredSet.has(String(inv._id))).slice(0, MAX_ANOMALY_SAMPLE).map(inv => ({
    ...inv,
    anomaly: "paid_invoice_no_ledger_entry"
  }));

  // ── E: Duplicate invoice numbers ───────────────────────────────────────────
  const duplicateInvoiceNumbers = await PlatformInvoice().aggregate([{
    $match: {
      ...orgFilter,
      ...dateFilter,
      invoiceNumber: {
        $ne: null
      }
    }
  }, {
    $group: {
      _id: "$invoiceNumber",
      count: {
        $sum: 1
      },
      ids: {
        $push: "$_id"
      }
    }
  }, {
    $match: {
      count: {
        $gt: 1
      }
    }
  }, {
    $limit: MAX_ANOMALY_SAMPLE
  }, {
    $project: {
      _id: 0,
      invoiceNumber: "$_id",
      count: 1,
      invoiceIds: {
        $map: {
          input: "$ids",
          as: "id",
          in: {
            $toString: "$$id"
          }
        }
      },
      anomaly: {
        $literal: "duplicate_invoice_number"
      }
    }
  }]);

  // ── F: PAYMENT_WITHOUT_INVOICE ─────────────────────────────────────────────
  // Detect successful payment ledger events that:
  //   a) have a null / missing invoiceId, OR
  //   b) reference an invoiceId that no longer exists in PlatformInvoice
  // Common causes: webhook failure, partial transaction commit, deleted invoice,
  // manual DB corruption.
  const orphanPaymentCandidates = await BillingLedger().find({
    ...orgFilter,
    ...dateFilter,
    eventType: "payment.succeeded",
    $or: [{
      invoiceId: null
    }, {
      invoiceId: {
        $exists: false
      }
    }]
  }, {
    _id: 1,
    organizationId: 1,
    contractId: 1,
    invoiceId: 1,
    amountMinor: 1,
    currency: 1
  }).limit(MAX_ANOMALY_SAMPLE).lean();

  // Deeper check: find ledger entries where invoiceId is set but points to a
  // PlatformInvoice that was deleted or never existed.
  const ledgerWithInvoiceId = await BillingLedger().find({
    ...orgFilter,
    ...dateFilter,
    eventType: "payment.succeeded",
    invoiceId: {
      $exists: true,
      $ne: null
    }
  }, {
    _id: 1,
    organizationId: 1,
    contractId: 1,
    invoiceId: 1,
    amountMinor: 1,
    currency: 1
  }).limit(MAX_ANOMALY_SAMPLE * 2).lean();
  const invoiceIdRefs = [...new Set(ledgerWithInvoiceId.map(e => String(e.invoiceId)))];
  const existingInvoiceIds = invoiceIdRefs.length > 0 ? await PlatformInvoice().distinct("_id", {
    _id: {
      $in: invoiceIdRefs
    }
  }) : [];
  const existingSet = new Set(existingInvoiceIds.map(String));
  const ghostInvoicePayments = ledgerWithInvoiceId.filter(e => !existingSet.has(String(e.invoiceId))).slice(0, MAX_ANOMALY_SAMPLE);

  // Merge null-invoiceId + ghost-invoiceId into one flat anomaly list
  const paymentsWithoutInvoice = [...orphanPaymentCandidates.map(p => ({
    type: "PAYMENT_WITHOUT_INVOICE",
    subtype: "null_invoice_id",
    ledgerId: p._id,
    organizationId: p.organizationId ? String(p.organizationId) : null,
    contractId: p.contractId ? String(p.contractId) : null,
    invoiceId: null,
    amountMinor: p.amountMinor,
    currency: p.currency
  })), ...ghostInvoicePayments.map(p => ({
    type: "PAYMENT_WITHOUT_INVOICE",
    subtype: "dangling_invoice_ref",
    ledgerId: p._id,
    organizationId: p.organizationId ? String(p.organizationId) : null,
    contractId: p.contractId ? String(p.contractId) : null,
    invoiceId: p.invoiceId ? String(p.invoiceId) : null,
    amountMinor: p.amountMinor,
    currency: p.currency
  }))].slice(0, MAX_ANOMALY_SAMPLE);

  // Section 9: structured per-anomaly logging — each entry includes
  // organizationId, contractId, invoiceId, ledgerId for monitoring correlation
  for (const anomaly of paymentsWithoutInvoice) {
    logger.error({
      event: "BILLING_ANOMALY_DETECTED",
      type: anomaly.type,
      subtype: anomaly.subtype,
      ledgerId: anomaly.ledgerId,
      organizationId: anomaly.organizationId,
      contractId: anomaly.contractId,
      invoiceId: anomaly.invoiceId,
      amountMinor: anomaly.amountMinor,
      currency: anomaly.currency
    }, "[BillingMonitor] ⚠ PAYMENT_WITHOUT_INVOICE anomaly");
  }

  // ── Collate results ────────────────────────────────────────────────────────
  const anomalyCount = netNegativeOrgs.length + negativeInvoices.length + orphanedInvoices.length + paidInvoicesMissingLedgerEntry.length + duplicateInvoiceNumbers.length + paymentsWithoutInvoice.length;
  const passed = anomalyCount === 0;
  const report = {
    passed,
    anomalyCount,
    scannedAt: new Date().toISOString(),
    anomalies: {
      netNegativeOrgs,
      negativeInvoices,
      orphanedInvoices,
      paidInvoicesMissingLedgerEntry,
      duplicateInvoiceNumbers,
      paymentsWithoutInvoice
    }
  };
  if (!passed) {
    logger.error({
      anomalyCount,
      netNegativeOrgs: netNegativeOrgs.length,
      negativeInvoices: negativeInvoices.length,
      orphanedInvoices: orphanedInvoices.length,
      paidInvoicesMissingLedgerEntry: paidInvoicesMissingLedgerEntry.length,
      duplicateInvoiceNumbers: duplicateInvoiceNumbers.length,
      paymentsWithoutInvoice: paymentsWithoutInvoice.length,
      context: "billingInvariantMonitor.detectAnomalies"
    }, "[BillingMonitor] ⚠ Financial anomalies detected");
  } else {
    logger.info({
      context: "billingInvariantMonitor.detectAnomalies"
    }, "[BillingMonitor] Anomaly scan clean");
  }
  return report;
}

// ─── 4. Full Integrity Check (all three combined) ─────────────────────────────

/**
 * runFullIntegrityCheck
 *
 * Runs all three checks and aggregates into a single structured report.
 * Designed for daily cron job or CI assertion.
 *
 * @param {object} [opts] - Forwarded to all three sub-checks
 * @param {string} [opts.correlationId] - Trace ID for log correlation
 *
 * @returns {Promise<{
 *   passed: boolean,
 *   correlationId: string,
 *   ranAt: string,
 *   paymentTotals: object,
 *   revenueReplay: object,
 *   anomalyDetection: object
 * }>}
 */
async function runFullIntegrityCheck(opts = {}) {
  const correlationId = opts.correlationId || `integrity-${Date.now()}`;
  const ranAt = new Date().toISOString();
  logger.info({
    correlationId,
    ranAt
  }, "[BillingMonitor] Starting full integrity check");
  const [paymentTotals, revenueReplay, anomalyDetection] = await Promise.all([checkPaymentTotals(opts).catch(err => {
    logger.error({
      err,
      correlationId
    }, "[BillingMonitor] checkPaymentTotals failed");
    return {
      passed: false,
      error: err.message
    };
  }), replayLedgerRevenue(opts).catch(err => {
    logger.error({
      err,
      correlationId
    }, "[BillingMonitor] replayLedgerRevenue failed");
    return {
      rows: [],
      error: err.message
    };
  }), detectAnomalies(opts).catch(err => {
    logger.error({
      err,
      correlationId
    }, "[BillingMonitor] detectAnomalies failed");
    return {
      passed: false,
      anomalyCount: -1,
      error: err.message
    };
  })]);
  const passed = Boolean(paymentTotals.passed && anomalyDetection.passed);

  // ── Section 5/8: Flat API shape for admin endpoint + scheduled job ────────────
  // Flatten anomaly categories into a single typed array for easy consumption
  // by the admin endpoint, the cron job logger, and monitoring dashboards.
  const flatAnomalies = [...(anomalyDetection.anomalies?.netNegativeOrgs || []).map(a => ({
    type: "NET_NEGATIVE_ORG",
    ...a
  })), ...(anomalyDetection.anomalies?.negativeInvoices || []).map(a => ({
    type: "NEGATIVE_INVOICE",
    ...a
  })), ...(anomalyDetection.anomalies?.orphanedInvoices || []).map(a => ({
    type: "ORPHANED_INVOICE",
    ...a
  })), ...(anomalyDetection.anomalies?.paidInvoicesMissingLedgerEntry || []).map(a => ({
    type: "PAID_INVOICE_NO_LEDGER",
    ...a
  })), ...(anomalyDetection.anomalies?.duplicateInvoiceNumbers || []).map(a => ({
    type: "DUPLICATE_INVOICE_NUMBER",
    ...a
  })), ...(anomalyDetection.anomalies?.paymentsWithoutInvoice || [])];
  const report = {
    // ── Section 8: flat { ok, checks, anomalies } output ──────────────────
    ok: passed,
    checks: {
      paymentTotals: paymentTotals.passed ? "ok" : "failed",
      replayRevenue: Array.isArray(revenueReplay.rows) ? "ok" : "failed",
      anomalyDetection: anomalyDetection.passed ? "ok" : "failed"
    },
    anomalies: flatAnomalies,
    // ── Full diagnostic detail (backwards-compat for test suite + cron job) ──
    passed,
    correlationId,
    ranAt,
    paymentTotals,
    revenueReplay,
    anomalyDetection
  };
  logger.info({
    passed,
    correlationId,
    anomalyCount: anomalyDetection.anomalyCount
  }, `[BillingMonitor] Full integrity check ${passed ? "PASSED ✓" : "FAILED ✗"}`);
  return report;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  checkPaymentTotals,
  replayLedgerRevenue,
  detectAnomalies,
  runFullIntegrityCheck
};