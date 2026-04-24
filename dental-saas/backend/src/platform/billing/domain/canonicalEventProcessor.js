/**
 * canonicalEventProcessor.js
 * v13.0 — Provider-Agnostic Canonical Billing Event Processor
 *
 * RULE: Business logic in this file must NEVER inspect provider-specific
 * event types (e.g. "payment_intent.succeeded", "charge.dispute.created").
 *
 * All events arrive normalized to the canonical shape before reaching here.
 * The StripeProvider (or future PaymobProvider) is responsible for normalization.
 *
 * Canonical Event Shape:
 * {
 *     provider:    "stripe" | "paymob" | "paypal",
 *     type:        "payment.succeeded" | "payment.failed" | "refund.completed" | "dispute.created",
 *     externalId:  String,   -- Provider's unique event ID
 *     amount:      Number,   -- In minor currency units
 *     currency:    String,   -- ISO currency code
 *     metadata:    Object,   -- Provider-neutral metadata
 *     raw:         Object    -- Original provider payload (for debugging only — never read by business logic)
 * }
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const BillingEventLogDef = require("@shared/models/BillingEventLog");
const BillingEventLog = getPlatformModel(BillingEventLogDef);
const {
  computePayloadHash
} = require("@shared/models/BillingEventLog");
const {
  writeLedgerEntry
} = require("../models/BillingLedger.model");
const {
  updatePaymentStatusByProviderPaymentId
} = require("./paymentStatusService");
const PlatformInvoiceDef = require("../../../platform/billing/models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const PaymentAttemptDef = require("../models/PaymentAttempt.model");
const PaymentAttempt = getPlatformModel(PaymentAttemptDef);
const TicketDef = require("@shared/models/Ticket");
const Ticket = getPlatformModel(TicketDef);
const AuditLogDef = require("@shared/models/AuditLog");
const AuditLog = getPlatformModel(AuditLogDef);
const logger = require("@utils/logger");
// Sprint 8: BillingTimeline projection
const {
  emitBillingTimelineEvent
} = require("../services/billingTimeline.service");

/**
 * SUPPORTED_PROVIDERS
 * Guard list — any event from an unrecognized provider is rejected immediately.
 */
const SUPPORTED_PROVIDERS = ["stripe", "paymob", "paypal"];

/**
 * CANONICAL_TYPE_HANDLERS
 * Maps canonical event types to their respective handler functions.
 * Adding a new canonical event type = add an entry here + implement handler below.
 */
const CANONICAL_TYPE_HANDLERS = {
  "payment.succeeded": handlePaymentSucceeded,
  "payment.failed": handlePaymentFailed,
  "refund.completed": handleRefundCompleted,
  "dispute.created": handleDisputeCreated,
  "subscription.created": handleSubscriptionCreated,
  "subscription.canceled": handleSubscriptionCanceled,
  "subscription.updated": handleSubscriptionUpdated
};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * handleCanonicalEvent
 * Main entry point. Called by all webhook controllers after normalization.
 *
 * @param {object} event - Canonical event (must match canonical shape)
 * @param {object} [options]
 * @param {string} [options.regionCode] - Region context for audit routing
 * @param {string} [options.correlationId] - Request correlation ID for tracing
 */
async function handleCanonicalEvent(event, options = {}) {
  const {
    regionCode = "GLOBAL",
    correlationId
  } = options;

  // ── Guard 1: Provider validation ──────────────────────────────────────────
  if (!SUPPORTED_PROVIDERS.includes(event.provider)) {
    throw new Error(`[canonicalEventProcessor] Unsupported provider: "${event.provider}". ` + `Supported: ${SUPPORTED_PROVIDERS.join(", ")}`);
  }

  // ── Guard 2: Canonical type validation ────────────────────────────────────
  if (!CANONICAL_TYPE_HANDLERS[event.type]) {
    logger.warn({
      provider: event.provider,
      type: event.type,
      externalId: event.externalId,
      correlationId
    }, "[canonicalEventProcessor] Unrecognized canonical event type — skipping");
    return {
      processed: false,
      reason: "unrecognized_canonical_type"
    };
  }

  // ── Guard 3: Required field presence ─────────────────────────────────────
  if (!event.externalId) {
    throw new Error("[canonicalEventProcessor] Event missing required field: externalId");
  }

  // ── Guard 4: Idempotency check ────────────────────────────────────────────
  const payloadHash = computePayloadHash(event);
  const alreadyProcessed = await BillingEventLog.exists({
    provider: event.provider,
    externalEventId: event.externalId
  });
  if (alreadyProcessed) {
    logger.info({
      provider: event.provider,
      externalId: event.externalId,
      type: event.type,
      correlationId
    }, "[canonicalEventProcessor] Duplicate event — idempotent skip");
    return {
      processed: false,
      reason: "duplicate"
    };
  }

  // ── Process ───────────────────────────────────────────────────────────────
  logger.info({
    provider: event.provider,
    type: event.type,
    externalId: event.externalId,
    amount: event.amount,
    currency: event.currency,
    correlationId
  }, "[canonicalEventProcessor] Processing canonical event");
  await CANONICAL_TYPE_HANDLERS[event.type](event, {
    regionCode,
    correlationId
  });

  // ── Record in idempotency log (only after successful processing) ───────────
  await BillingEventLog.create({
    provider: event.provider,
    externalEventId: event.externalId,
    type: event.type,
    payloadHash,
    processedAt: new Date(),
    regionCode
  });
  logger.info({
    provider: event.provider,
    type: event.type,
    externalId: event.externalId,
    correlationId
  }, "[canonicalEventProcessor] Event processed and logged");
  return {
    processed: true
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANONICAL EVENT HANDLERS
// All handlers receive (event, context) — context = { regionCode, correlationId }
// ─────────────────────────────────────────────────────────────────────────────

async function handlePaymentSucceeded(event, {
  regionCode,
  correlationId
}) {
  const {
    amount,
    currency,
    metadata
  } = event;

  // ── Pull reconciliation keys from canonical metadata ───────────────────────
  // paymentIntentId: the Stripe pi_xxx ID — becomes invoice.providerPaymentId
  // platformInvoiceId: our invoice ID embedded in Stripe checkout session metadata
  const paymentIntentId = metadata?.paymentIntentId || null;
  const platformInvoiceId = metadata?.platformInvoiceId || null;

  // ── Two-path invoice resolution ────────────────────────────────────────────
  //
  // PATH 1 — New self-serve contracts (checkout session flow):
  //   CheckoutOrchestrator embeds invoiceId in Stripe metadata.
  //   Invoice exists BEFORE payment, providerPaymentId not yet set.
  //   First webhook: finds by platformInvoiceId → stores paymentIntentId → marks paid.
  //
  // PATH 2 — Legacy / dunning retry contracts:
  //   Invoice was linked to providerPaymentId by an earlier system.
  //   Retry webhooks: finds by providerPaymentId → status===paid → exits idempotently.
  //
  let invoice = null;
  if (platformInvoiceId) {
    invoice = await PlatformInvoice.findById(platformInvoiceId);
    if (invoice) {
      logger.info({
        platformInvoiceId,
        paymentIntentId,
        correlationId
      }, "[canonicalEventProcessor] payment.succeeded: resolved invoice via platformInvoiceId (checkout path)");
    }
  }
  if (!invoice && paymentIntentId) {
    invoice = await PlatformInvoice.findOne({
      providerPaymentId: paymentIntentId
    });
    if (invoice) {
      logger.info({
        paymentIntentId,
        invoiceId: invoice._id,
        correlationId
      }, "[canonicalEventProcessor] payment.succeeded: resolved invoice via providerPaymentId (legacy/dunning path)");
    }
  }
  if (!invoice) {
    logger.warn({
      platformInvoiceId,
      paymentIntentId,
      correlationId
    }, "[canonicalEventProcessor] payment.succeeded: no invoice found — cannot reconcile payment");
    return;
  }

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // Stripe retries webhooks for up to 72 hours.
  // If the invoice is already paid, this is a duplicate delivery — exit cleanly.
  if (invoice.status === "paid") {
    logger.info({
      invoiceId: invoice._id,
      correlationId
    }, "[canonicalEventProcessor] payment.succeeded: invoice already paid — idempotent skip");
    return;
  }

  // ── Store providerPaymentId if not yet set ─────────────────────────────────
  // This links the invoice to the Stripe payment intent so that:
  //   a) retry webhooks find it via PATH 2 (providerPaymentId lookup)
  //   b) updatePaymentStatusByProviderPaymentId works correctly
  //   c) refund/dispute handlers can locate this invoice
  if (paymentIntentId && !invoice.providerPaymentId) {
    invoice.providerPaymentId = paymentIntentId;
    // save is deferred — done below with status update
  }

  // ── Apply payment state machine transition ─────────────────────────────────
  // pending/authorized → captured
  // Must happen BEFORE invoice.save() so the state machine validates the transition.
  if (invoice.providerPaymentId) {
    await updatePaymentStatusByProviderPaymentId({
      providerPaymentId: invoice.providerPaymentId,
      nextStatus: "captured",
      actorType: "system",
      regionCode,
      metadata: {
        source: "canonical_event",
        type: "payment.succeeded",
        correlationId
      }
    });
  }

  // ── Mark invoice paid ──────────────────────────────────────────────────────
  invoice.status = "paid";
  invoice.paidAt = new Date();
  await invoice.save();
  logger.info({
    invoiceId: invoice._id,
    organizationId: invoice.organizationId,
    amount,
    currency
  }, "[canonicalEventProcessor] payment.succeeded: invoice marked paid");

  // ── Auto-reactivation (dunning/suspended contracts) ────────────────────────
  // setImmediate ensures webhook response is sent before this runs.
  // Non-fatal: failure here does not roll back the invoice payment.
  setImmediate(async () => {
    try {
      const {
        reactivateOnPayment
      } = require("../../services/dunningProcessor.service");
      await reactivateOnPayment(invoice._id.toString());
    } catch (err) {
      logger.error({
        err,
        invoiceId: invoice._id
      }, "[canonicalEventProcessor] reactivateOnPayment failed (non-fatal)");
    }
  });
  await _writeAudit({
    organizationId: invoice.organizationId,
    action: "PAYMENT_SUCCEEDED",
    entity: "PLATFORM_INVOICE",
    entityId: invoice._id,
    details: {
      paymentIntentId,
      platformInvoiceId,
      amount,
      currency,
      correlationId
    }
  });

  // ── Ledger: payment.succeeded ─────────────────────────────────────────────────
  await writeLedgerEntry({
    eventType: "payment.succeeded",
    organizationId: invoice.organizationId,
    contractId: invoice.contractId,
    invoiceId: invoice._id,
    providerEventId: event.externalId,
    provider: event.provider,
    amount: invoice.totalAmount,
    currency: invoice.currency,
    source: "canonicalEventProcessor",
    metadata: {
      paymentIntentId,
      platformInvoiceId,
      correlationId
    }
  });

  // ── Persist PaymentAttempt ─────────────────────────────────────────────────
  await _persistPaymentAttempt({
    invoiceId: invoice._id,
    contractId: invoice.contractId ?? null,
    organizationId: invoice.organizationId,
    provider: event.provider,
    providerPaymentId: invoice.providerPaymentId ?? paymentIntentId,
    providerEventId: event.externalId,
    amount: invoice.totalAmount ?? event.amount / 100,
    currency: invoice.currency,
    status: "captured",
    requestId: correlationId ?? null,
    metadata: {
      source: "payment.succeeded",
      paymentIntentId,
      platformInvoiceId,
      correlationId
    }
  });

  // Sprint 8: BillingTimeline — PAYMENT_SUCCEEDED
  setImmediate(async () => {
    await emitBillingTimelineEvent({
      organizationId: invoice.organizationId,
      contractId: invoice.contractId || null,
      invoiceId: invoice._id,
      eventType: "PAYMENT_SUCCEEDED",
      providerEventId: event.externalId,
      source: "system",
      payload: {
        provider: event.provider,
        amount,
        currency,
        paymentIntentId,
        correlationId
      }
    });
  });
}

/**
 * payment.failed
 * The payment was rejected, expired, or declined.
 * Transition: pending/authorized → failed
 */
async function handlePaymentFailed(event, {
  regionCode,
  correlationId
}) {
  const {
    externalId: providerPaymentId,
    metadata
  } = event;
  const invoice = await PlatformInvoice.findOne({
    providerPaymentId
  });
  if (!invoice) {
    logger.warn({
      providerPaymentId,
      correlationId
    }, "[canonicalEventProcessor] payment.failed: no invoice found");
    return;
  }
  await updatePaymentStatusByProviderPaymentId({
    providerPaymentId,
    nextStatus: "failed",
    actorType: "system",
    regionCode,
    metadata: {
      source: "canonical_event",
      type: "payment.failed",
      correlationId
    }
  });

  // Update invoice status
  invoice.status = "uncollectible";
  invoice.failureReason = metadata?.failureReason || "payment_failed";
  await invoice.save();
  await _writeAudit({
    organizationId: invoice.organizationId,
    action: "PAYMENT_FAILED",
    entity: "PLATFORM_INVOICE",
    entityId: invoice._id,
    details: {
      providerPaymentId,
      reason: invoice.failureReason,
      correlationId
    }
  });

  // ── Ledger: payment.failed ──────────────────────────────────────────────────
  await writeLedgerEntry({
    eventType: "payment.failed",
    organizationId: invoice.organizationId,
    contractId: invoice.contractId,
    invoiceId: invoice._id,
    providerEventId: event.externalId,
    provider: event.provider,
    amount: invoice.totalAmount,
    currency: invoice.currency,
    source: "canonicalEventProcessor",
    metadata: {
      providerPaymentId,
      reason: invoice.failureReason,
      correlationId
    }
  });

  // ── Persist PaymentAttempt ─────────────────────────────────────────────────
  await _persistPaymentAttempt({
    invoiceId: invoice._id,
    contractId: invoice.contractId ?? null,
    organizationId: invoice.organizationId,
    provider: event.provider,
    providerPaymentId,
    providerEventId: event.externalId,
    amount: invoice.totalAmount ?? 0,
    currency: invoice.currency,
    status: "failed",
    errorCode: metadata?.errorCode ?? null,
    errorMessage: invoice.failureReason ?? null,
    requestId: correlationId ?? null,
    metadata: {
      source: "payment.failed",
      providerPaymentId,
      correlationId
    }
  });

  // Sprint 8: BillingTimeline — PAYMENT_FAILED
  setImmediate(async () => {
    await emitBillingTimelineEvent({
      organizationId: invoice.organizationId,
      contractId: invoice.contractId || null,
      invoiceId: invoice._id,
      eventType: "PAYMENT_FAILED",
      providerEventId: event.externalId,
      source: "system",
      payload: {
        provider: event.provider,
        reason: invoice.failureReason,
        correlationId
      }
    });
  });
}

/**
 * refund.completed
 * A refund was confirmed by the provider.
 * Transition: captured → refunded (or captured → partially_refunded)
 */
async function handleRefundCompleted(event, {
  regionCode,
  correlationId
}) {
  const {
    externalId: providerPaymentId,
    amount,
    metadata
  } = event;
  const invoice = await PlatformInvoice.findOne({
    providerPaymentId
  });
  if (!invoice) {
    logger.warn({
      providerPaymentId,
      correlationId
    }, "[canonicalEventProcessor] refund.completed: no invoice found");
    return;
  }
  const newRefundedTotal = (invoice.refundedAmountMinor || 0) + amount;
  const isFullRefund = newRefundedTotal >= invoice.totalAmountMinor;
  const nextStatus = isFullRefund ? "refunded" : "partially_refunded";
  await updatePaymentStatusByProviderPaymentId({
    providerPaymentId,
    nextStatus,
    actorType: "system",
    regionCode,
    metadata: {
      source: "canonical_event",
      type: "refund.completed",
      correlationId
    }
  });
  await _writeAudit({
    organizationId: invoice.organizationId,
    action: "REFUND_COMPLETED",
    entity: "PLATFORM_INVOICE",
    entityId: invoice._id,
    details: {
      providerPaymentId,
      amount,
      isFullRefund,
      correlationId
    }
  });

  // ── Ledger: invoice.refunded ────────────────────────────────────────────────
  await writeLedgerEntry({
    eventType: "invoice.refunded",
    organizationId: invoice.organizationId,
    contractId: invoice.contractId,
    invoiceId: invoice._id,
    providerEventId: event.externalId,
    provider: event.provider,
    // amount is in minor units from the provider; convert to decimal for ledger
    amount: Math.round(amount) / 100,
    currency: invoice.currency,
    source: "canonicalEventProcessor",
    metadata: {
      providerPaymentId,
      isFullRefund,
      correlationId
    }
  });

  // ── Persist PaymentAttempt ─────────────────────────────────────────────────
  await _persistPaymentAttempt({
    invoiceId: invoice._id,
    contractId: invoice.contractId ?? null,
    organizationId: invoice.organizationId,
    provider: event.provider,
    providerPaymentId,
    providerEventId: event.externalId,
    amount: Math.round(amount) / 100,
    currency: invoice.currency,
    status: "refunded",
    requestId: correlationId ?? null,
    metadata: {
      source: "refund.completed",
      isFullRefund,
      correlationId
    }
  });
}

/**
 * dispute.created
 * A payment has been disputed by the customer.
 * Transition: captured → disputed
 */
async function handleDisputeCreated(event, {
  regionCode,
  correlationId
}) {
  const {
    externalId: providerPaymentId,
    metadata
  } = event;
  const invoice = await PlatformInvoice.findOne({
    providerPaymentId
  });
  if (!invoice) {
    logger.warn({
      providerPaymentId,
      correlationId
    }, "[canonicalEventProcessor] dispute.created: no invoice found");
    return;
  }

  // Idempotency check — avoid duplicate dispute tickets
  const existing = await Ticket.findOne({
    providerDisputeId: event.externalId
  });
  if (existing) {
    logger.info({
      providerDisputeId: event.externalId,
      correlationId
    }, "[canonicalEventProcessor] Dispute ticket already exists");
    return;
  }
  await updatePaymentStatusByProviderPaymentId({
    providerPaymentId,
    nextStatus: "disputed",
    actorType: "system",
    regionCode,
    metadata: {
      source: "canonical_event",
      type: "dispute.created",
      correlationId
    }
  });

  // Create dispute ticket
  await Ticket.create({
    organizationId: invoice.organizationId,
    regionCode: regionCode || invoice.regionCode,
    createdBy: "000000000000000000000000",
    // system actor
    category: "dispute",
    priority: "HIGH",
    status: "OPEN",
    subject: `PAYMENT DISPUTE: ${event.externalId}`,
    description: `Dispute received from ${event.provider}. Amount: ${event.amount} ${event.currency}`,
    linkedInvoiceId: invoice._id,
    providerDisputeId: event.externalId,
    financialImpactMinor: event.amount,
    slaDeadline: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12h SLA
  });
  await _writeAudit({
    organizationId: invoice.organizationId,
    action: "DISPUTE_CREATED",
    entity: "PLATFORM_INVOICE",
    entityId: invoice._id,
    details: {
      providerDisputeId: event.externalId,
      amount: event.amount,
      correlationId
    }
  });

  // ── Persist PaymentAttempt ─────────────────────────────────────────────────
  await _persistPaymentAttempt({
    invoiceId: invoice._id,
    contractId: invoice.contractId ?? null,
    organizationId: invoice.organizationId,
    provider: event.provider,
    providerPaymentId,
    providerEventId: event.externalId,
    amount: event.amount / 100,
    currency: event.currency ?? invoice.currency,
    status: "disputed",
    requestId: correlationId ?? null,
    metadata: {
      source: "dispute.created",
      disputeId: event.externalId,
      correlationId
    }
  });
}

/**
 * subscription.created — informational (org subscription provisioned elsewhere)
 */
async function handleSubscriptionCreated(event, {
  regionCode,
  correlationId
}) {
  logger.info({
    event,
    correlationId
  }, "[canonicalEventProcessor] subscription.created — informational only");
  await writeLedgerEntry({
    eventType: "subscription.created",
    organizationId: event.metadata?.organizationId || null,
    providerEventId: event.externalId,
    provider: event.provider,
    amount: 0,
    currency: event.currency || "USD",
    source: "canonicalEventProcessor",
    metadata: {
      correlationId,
      raw: event.metadata
    }
  });
}

/**
 * subscription.canceled — informational (handled by subscription service)
 */
async function handleSubscriptionCanceled(event, {
  regionCode,
  correlationId
}) {
  logger.info({
    event,
    correlationId
  }, "[canonicalEventProcessor] subscription.canceled — informational only");
  await writeLedgerEntry({
    eventType: "subscription.canceled",
    organizationId: event.metadata?.organizationId || null,
    providerEventId: event.externalId,
    provider: event.provider,
    amount: 0,
    currency: event.currency || "USD",
    source: "canonicalEventProcessor",
    metadata: {
      correlationId,
      raw: event.metadata
    }
  });
}

/**
 * subscription.updated — informational
 */
async function handleSubscriptionUpdated(event, {
  regionCode,
  correlationId
}) {
  logger.info({
    event,
    correlationId
  }, "[canonicalEventProcessor] subscription.updated — informational only");
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function _writeAudit({
  organizationId,
  action,
  entity,
  entityId,
  details
}) {
  try {
    await AuditLog.create({
      organizationId,
      actorId: "000000000000000000000000",
      actorType: "system",
      action,
      entity,
      entityId,
      regionCode: "GLOBAL",
      metadata: details,
      success: true
    });
  } catch (err) {
    logger.error({
      err,
      action,
      entityId
    }, "[canonicalEventProcessor] Audit write failed — non-fatal");
  }
}

/**
 * _persistPaymentAttempt
 * Creates a PaymentAttempt document for every payment event.
 * attemptNumber is computed by counting prior attempts for this invoice.
 * NON-FATAL: failure is logged but never propagated.
 */
async function _persistPaymentAttempt({
  invoiceId,
  contractId,
  organizationId,
  provider,
  providerPaymentId,
  providerEventId,
  amount,
  currency,
  status,
  errorCode,
  errorMessage,
  requestId,
  metadata
}) {
  try {
    const existingCount = await PaymentAttempt.countDocuments({
      invoiceId
    });
    await PaymentAttempt.create({
      invoiceId,
      contractId,
      organizationId,
      provider,
      providerPaymentId,
      providerEventId,
      amount,
      currency,
      status,
      attemptNumber: existingCount + 1,
      errorCode: errorCode ?? null,
      errorMessage: errorMessage ?? null,
      requestId: requestId ?? null,
      metadata: metadata ?? {}
    });
  } catch (err) {
    logger.error({
      err,
      invoiceId,
      status,
      provider
    }, "[canonicalEventProcessor] _persistPaymentAttempt failed — non-fatal");
  }
}
module.exports = {
  handleCanonicalEvent
};