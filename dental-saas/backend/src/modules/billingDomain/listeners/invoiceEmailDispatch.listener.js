/**
 * invoiceEmailDispatch.listener.js — Phase 2 D4 (hardened)
 *
 * Consumes: invoice.created
 * Side-effect: renders invoice PDF (via documentEngineDomain.invoicePrint.service)
 *              and enqueues an email job through the shared emailQueue.
 *
 * Per-org opt-in via BillingSettings.emailInvoiceOnCreate. Attachment inclusion
 * gated by BillingSettings.includeInvoicePdfAttachment.
 *
 * HARDENING (post-audit):
 *   - Atomic idempotency CAS on PatientInvoice.emailDispatched — at-most-once
 *     send even if invoice.created fires twice.
 *   - Strict RFC-ish email validation before enqueue.
 *   - PDF size ceiling (default 8 MiB); oversize → send without attachment.
 *   - Latency histogram: dental_saas_invoice_email_dispatch_duration_seconds.
 *   - BullMQ retry is already configured queue-wide (5 attempts, exponential
 *     backoff) — we pass explicit per-job opts to be resilient to default
 *     changes.
 *
 * DESIGN NOTES
 *   - This listener is a BEST-EFFORT side-effect. A failure here MUST NEVER
 *     break the invoice creation flow. All outcomes are counted via the
 *     Prometheus counter `dental_saas_invoice_email_dispatched_total`.
 *   - invoicePrint.service was designed for HTTP requests and expects a
 *     `req` with `user`, `context.roleName`, `organizationId`, `branchId`,
 *     `dbConnection`. We build a synthetic system-context req so the service
 *     can run headless from the event loop.
 *
 * @module billingDomain/listeners/invoiceEmailDispatch
 */

"use strict";

const logger = require("@utils/logger");
const eventBus = require("@core/eventBus");
const billingSettingsService = require("../organizationFinance/services/clinicBillingSettings.service");
const invoicePrintService = require("../../documentEngineDomain/services/invoicePrint.service");
const PatientInvoiceDef = require("../organizationFinance/models/PatientInvoice.model");
const PatientModel = require("@shared/models/Patient");
const {
  enqueueEmail
} = require("@infra/queues/emailQueue");
const {
  metrics
} = require("@infra/metrics/metrics");
const EVENT = "invoice.created";

// ── Tunables ──────────────────────────────────────────────────────────
// 8 MiB — most providers (SES, SendGrid, Mailgun) accept up to ~10MB
// post-MIME-encoding, which adds ~33% overhead. 8MiB raw ≈ 10.6MB encoded.
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

// Pragmatic email regex — matches the common subset without the full RFC5322
// monster. The email queue rejects empty / malformed payloads anyway, so this
// is a fail-fast guard with a clear metric label.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const JOB_OPTS = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 5000
  },
  removeOnComplete: {
    count: 500,
    age: 86400
  },
  removeOnFail: {
    count: 200,
    age: 604800
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────

function buildSystemReq({
  organizationId,
  dbConnection,
  branchId
}) {
  return {
    dbConnection,
    branchId: branchId || null,
    user: {
      _id: "system",
      roleName: "org_admin" // required for invoicePrint.service allowlist
    },
    context: {
      roleName: "org_admin",
      userId: "system",
      branchId: branchId || null
    }
  };
}
function getInvoiceModel(dbConnection) {
  return dbConnection.modelNames().includes("PatientInvoice") ? dbConnection.model("PatientInvoice") : dbConnection.model("PatientInvoice", PatientInvoiceDef.schema);
}
function getPatientModel(dbConnection) {
  return dbConnection.modelNames().includes("Patient") ? dbConnection.model("Patient") : dbConnection.model("Patient", PatientModel.schema);
}
function isValidEmail(v) {
  return typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v);
}
async function lookupPatient(dbConnection, patientId) {
  try {
    const Patient = getPatientModel(dbConnection);
    const p = await Patient.findById(patientId).select("email nameEnglish nameArabic").lean();
    if (!p) return null;
    return {
      email: p.email || null,
      name: p.nameEnglish || p.nameArabic || "Patient"
    };
  } catch (err) {
    logger.warn({
      err: err.message,
      patientId: patientId?.toString()
    }, "[invoiceEmailDispatch] Patient lookup failed — skipping dispatch");
    return null;
  }
}

/**
 * Atomic compare-and-set: mark the invoice as dispatched iff it wasn't
 * already. Returns true if THIS listener won the race and should proceed.
 */
async function claimDispatch(dbConnection, invoiceId) {
  try {
    const Invoice = getInvoiceModel(dbConnection);
    const res = await Invoice.findOneAndUpdate({
      _id: invoiceId,
      emailDispatched: {
        $ne: true
      }
    }, {
      $set: {
        emailDispatched: true,
        emailDispatchedAt: new Date()
      }
    }, {
      new: false
    } // we only need to know if a doc matched
    ).lean();
    return !!res;
  } catch (err) {
    // Never block invoice flow — if the claim itself errors, skip the send.
    logger.warn({
      err: err.message,
      invoiceId: invoiceId?.toString()
    }, "[invoiceEmailDispatch] Idempotency claim failed — skipping");
    return false;
  }
}

/**
 * Release the dispatch marker when we fail before enqueue.
 * Best-effort — if this fails, the worst case is a missed email (never a
 * duplicate), which is the correct bias for at-most-once semantics.
 */
async function releaseDispatch(dbConnection, invoiceId) {
  try {
    const Invoice = getInvoiceModel(dbConnection);
    await Invoice.updateOne({
      _id: invoiceId
    }, {
      $set: {
        emailDispatched: false
      },
      $unset: {
        emailDispatchedAt: ""
      }
    });
  } catch {/* noop — at-most-once is preserved */}
}
function incOutcome(outcome) {
  try {
    metrics.invoiceEmailDispatchedTotal?.inc({
      outcome
    });
  } catch {/* noop */}
}
function observeLatency(outcome, startedAt) {
  try {
    const secs = (Date.now() - startedAt) / 1000;
    metrics.invoiceEmailDispatchDurationSeconds?.observe({
      outcome
    }, secs);
  } catch {/* noop */}
}

// ─── Main Handler ─────────────────────────────────────────────────────

async function onInvoiceCreated(payload) {
  const startedAt = Date.now();
  const {
    organizationId,
    dbConnection,
    invoice
  } = payload || {};
  if (!organizationId || !dbConnection || !invoice?._id) {
    incOutcome("skipped_malformed");
    observeLatency("skipped_malformed", startedAt);
    return;
  }
  let claimed = false;
  let systemReq;
  try {
    systemReq = buildSystemReq({
      dbConnection,
      branchId: invoice.branchId
    });

    // 1. Per-org toggle — cheapest filter, do it first.
    const settings = await billingSettingsService.getOrCreate(systemReq);
    if (!settings?.emailInvoiceOnCreate) {
      incOutcome("skipped_disabled");
      observeLatency("skipped_disabled", startedAt);
      return;
    }

    // 2. Patient lookup (email required).
    const patient = await lookupPatient(dbConnection, invoice.patientId);
    if (!patient || !patient.email) {
      incOutcome("skipped_no_email");
      observeLatency("skipped_no_email", startedAt);
      return;
    }
    if (!isValidEmail(patient.email)) {
      incOutcome("skipped_invalid_email");
      observeLatency("skipped_invalid_email", startedAt);
      return;
    }

    // 3. Idempotency CAS — AFTER the cheap filters, BEFORE the expensive
    //    PDF render. A duplicate invoice.created here exits as "duplicate"
    //    without doing any render work.
    claimed = await claimDispatch(dbConnection, invoice._id);
    if (!claimed) {
      incOutcome("skipped_duplicate");
      observeLatency("skipped_duplicate", startedAt);
      return;
    }

    // 4. Render PDF (optional — toggle-controlled).
    let pdfBase64 = null;
    let attachmentTooLarge = false;
    if (settings.includeInvoicePdfAttachment !== false) {
      try {
        const pdfBuffer = await invoicePrintService.printInvoice({
          invoiceId: invoice._id,
          req: systemReq
        });
        if (pdfBuffer) {
          const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
          if (buf.length > MAX_ATTACHMENT_BYTES) {
            attachmentTooLarge = true;
            logger.warn({
              invoiceId: invoice._id?.toString(),
              sizeBytes: buf.length,
              maxBytes: MAX_ATTACHMENT_BYTES
            }, "[invoiceEmailDispatch] PDF exceeds attachment ceiling — sending without attachment");
          } else {
            pdfBase64 = buf.toString("base64");
          }
        }
      } catch (pdfErr) {
        // PDF failure is non-fatal: still send the email body.
        logger.warn({
          err: pdfErr.message,
          invoiceId: invoice._id?.toString()
        }, "[invoiceEmailDispatch] PDF render failed — emailing without attachment");
      }
    }

    // 5. Enqueue email with explicit retry policy.
    const invoiceNumber = `INV-${invoice._id.toString().slice(-6).toUpperCase()}`;
    await enqueueEmail("INVOICE", {
      email: patient.email,
      subject: `Invoice ${invoiceNumber}`,
      patientName: patient.name,
      invoiceNumber,
      totalAmount: invoice.totalAmount,
      currency: invoice.currency,
      attachments: pdfBase64 ? [{
        filename: `${invoiceNumber}.pdf`,
        contentBase64: pdfBase64,
        contentType: "application/pdf"
      }] : []
    }, JOB_OPTS);
    const outcome = attachmentTooLarge ? "skipped_attachment_too_large" : "sent";
    // Still counts as "sent" email-wise; use the dedicated outcome for the
    // oversize case so dashboards can split the two.
    incOutcome(outcome);
    observeLatency(outcome, startedAt);
  } catch (err) {
    incOutcome("failed");
    observeLatency("failed", startedAt);
    // Release the marker so a future retry (replay tool, DLQ resume) has
    // a chance to succeed. At-most-once is still preserved for any
    // in-flight duplicate because claimDispatch's $ne filter is atomic.
    if (claimed) {
      await releaseDispatch(dbConnection, invoice._id);
    }
    logger.error({
      err: err.message,
      stack: err.stack?.slice(0, 500),
      invoiceId: invoice?._id?.toString(),
      organizationId: organizationId?.toString()
    }, "[invoiceEmailDispatch] Dispatch failed — invoice flow unaffected");
  }
}

// ─── Register ──────────────────────────────────────────────────────────

function register() {
  eventBus.on(EVENT, payload => {
    onInvoiceCreated(payload).catch(err => {
      logger.error({
        event: EVENT,
        err: err.message
      }, "[invoiceEmailDispatch] Unhandled error in handler");
      incOutcome("failed");
    });
  });
  logger.info(`[billingDomain] Listener registered: ${EVENT} → invoice email dispatch`);
}
module.exports = {
  register,
  onInvoiceCreated,
  EVENT,
  // Exported for tests
  _internals: {
    isValidEmail,
    MAX_ATTACHMENT_BYTES,
    claimDispatch,
    releaseDispatch
  }
};