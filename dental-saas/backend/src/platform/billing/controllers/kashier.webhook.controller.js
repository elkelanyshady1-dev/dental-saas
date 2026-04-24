/**
 * kashier.webhook.controller.js
 * Phase 2 Hardening — strict Kashier webhook gateway.
 *
 * Pipeline (order matters):
 *   1. Hard-fail if `req.rawBody` is missing — we refuse to trust
 *      `JSON.stringify(req.body)` in production because body serialisation is
 *      not deterministic.
 *   2. Signature verification (HMAC-SHA256 via KashierProvider.verifyWebhook).
 *   3. Parse event → canonical shape.
 *   4. Short-circuit non-`payment_success` events with 200 OK (idempotent
 *      acknowledgement so Kashier doesn't retry; no downstream work happens).
 *   5. Metadata guard: reject when orgId or planVersionId is missing.
 *   6. Idempotency: KashierEvent unique index on eventId.
 *   7. Resolve the OrgContract via event.contractId OR invoice → contractId.
 *   8. Validate payment amount/currency against the contract
 *      (billingValidation.assertPaymentMatchesContract).
 *   9. Dispatch to paymentSuccessHandler.
 *  10. Log the full success record for audit.
 *
 * Raw body capture (production):
 *   app.use("/api/public/webhooks/kashier", express.json({
 *     verify: (req, _res, buf) => { req.rawBody = buf; }
 *   }));
 *
 * PLANE: Platform / Billing
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const {
  getProvider
} = require("@billing/providers/paymentProviderFactory");
const {
  handlePaymentSuccess
} = require("@billing/services/paymentSuccessHandler");
const {
  assertPaymentMatchesContract
} = require("@billing/services/billingValidation.service");
const OrgContractDef = require("@billing/models/OrgContract.model");
const OrgContract = getPlatformModel(OrgContractDef);
const KashierEventDef = require("@shared/models/KashierEvent");
const KashierEvent = getPlatformModel(KashierEventDef);
const logger = require("@utils/logger");

// Phase 3 Final Hardening:
//   Contract lookup is contractId-only. The invoice-fallback path was
//   removed on purpose so webhooks cannot bind a payment to a contract the
//   checkout session never mentioned. Every Kashier session created from
//   checkoutOrchestrator now carries contractId in its metadata.

// ─── Controller ──────────────────────────────────────────────────────────────
async function handleKashierWebhook(req, res) {
  const correlationId = req.correlationId || null;
  const signature = req.headers["x-kashier-signature"] || req.headers["x-kashier-sig"] || null;

  // 1. Phase 2 Hardening — Task 6: hard-fail on missing rawBody.
  //    Stringifying req.body here would yield a different byte sequence
  //    than what Kashier signed, so HMAC verification would never match —
  //    or worse, would silently pass if we also stringified on the sender
  //    side. Refuse the request up-front so misconfiguration is noisy.
  if (!req.rawBody) {
    logger.error({
      correlationId
    }, "[kashier.webhook] RAW_BODY_REQUIRED");
    return res.status(400).json({
      error: "RAW_BODY_REQUIRED",
      message: "Raw request body must be captured by express.json({ verify }) before reaching this route."
    });
  }
  const provider = getProvider("kashier");

  // 2. Signature verification
  let valid = false;
  try {
    valid = await provider.verifyWebhook({
      rawBody: req.rawBody,
      signature
    });
  } catch (err) {
    logger.error({
      err,
      correlationId
    }, "[kashier.webhook] signature check threw");
    return res.status(400).send("Invalid signature");
  }
  if (!valid) {
    logger.warn({
      correlationId
    }, "[kashier.webhook] invalid signature — rejected");
    return res.status(401).send("Invalid signature");
  }

  // 3. Parse event
  let event;
  try {
    event = await provider.parseEvent(req.body || {});
  } catch (err) {
    logger.error({
      err,
      correlationId
    }, "[kashier.webhook] parseEvent failed");
    return res.status(400).send("Malformed event");
  }
  if (!event.externalId) {
    logger.warn({
      correlationId,
      event
    }, "[kashier.webhook] event missing externalId — cannot dedupe");
    return res.status(400).send("Event is missing id");
  }

  // 4. Phase 2 Hardening — Task 3: short-circuit non-success events.
  //    We still record the event id below to prevent repeat processing,
  //    but no downstream activation happens.
  if (event.type !== "payment_success") {
    logger.info({
      eventId: event.externalId,
      type: event.type,
      correlationId
    }, "[kashier.webhook] ignoring non-success event");
    return res.status(200).json({
      received: true,
      handled: false,
      reason: "not_a_success_event"
    });
  }

  // 5. Phase 2/3 Hardening — metadata integrity.
  //    orgId + planVersionId + contractId + interval are ALL required so
  //    the payment can be tied to a deterministic contract and the right
  //    billing period. `interval` MUST come from the session metadata —
  //    defaulting it here (e.g. to "monthly") would silently activate a
  //    yearly payment for one month if the metadata were dropped.
  if (!event.orgId || !event.planVersionId || !event.contractId || !event.interval) {
    logger.warn({
      correlationId,
      eventId: event.externalId,
      hasOrgId: !!event.orgId,
      hasPlanVersionId: !!event.planVersionId,
      hasContractId: !!event.contractId,
      hasInterval: !!event.interval
    }, "[kashier.webhook] INVALID_EVENT_METADATA");
    return res.status(400).json({
      error: "INVALID_EVENT_METADATA",
      message: "orgId, planVersionId, contractId, and interval are required in webhook metadata."
    });
  }

  // 6. Idempotency. The unique index on KashierEvent.eventId is the hard
  //    guarantee — the upfront find is a fast-path to avoid work on retries.
  const existing = await KashierEvent.findOne({
    eventId: event.externalId
  }).lean();
  if (existing) {
    logger.info({
      eventId: event.externalId,
      correlationId
    }, "[kashier.webhook] duplicate — already processed");
    return res.status(200).json({
      received: true,
      duplicate: true
    });
  }
  try {
    await KashierEvent.create({
      eventId: event.externalId,
      type: event.type,
      correlationId
    });
  } catch (err) {
    if (err && err.code === 11000) {
      return res.status(200).json({
        received: true,
        duplicate: true
      });
    }
    logger.error({
      err,
      correlationId
    }, "[kashier.webhook] failed to persist dedup record");
    return res.status(500).send("Internal error");
  }

  // 7. Phase 3 Final Hardening — contract lookup is strict.
  //    contractId is required at the metadata guard above, so we know it
  //    exists here. Still check the lookup resolves to a real document —
  //    rejecting with 404 CONTRACT_NOT_FOUND lets ops diagnose stale IDs.
  const contract = await OrgContract.findById(event.contractId);
  if (!contract) {
    logger.error({
      correlationId,
      eventId: event.externalId,
      contractId: event.contractId
    }, "[kashier.webhook] CONTRACT_NOT_FOUND");
    return res.status(404).json({
      error: "CONTRACT_NOT_FOUND",
      message: "No OrgContract found for the event."
    });
  }

  // 8. Phase 2 Hardening — Task 2: validate payment against contract.
  try {
    assertPaymentMatchesContract({
      amount: event.amountMinor,
      currency: event.currency,
      contract
    });
  } catch (err) {
    logger.error({
      err,
      correlationId,
      eventId: event.externalId,
      code: err.code,
      expected: err.expected,
      actual: err.actual
    }, "[kashier.webhook] payment/contract mismatch");
    return res.status(409).json({
      error: err.code || "PAYMENT_CONTRACT_MISMATCH",
      message: err.message
    });
  }

  // 9. Dispatch
  let result;
  try {
    result = await handlePaymentSuccess(event);
  } catch (err) {
    logger.error({
      err,
      correlationId,
      event
    }, "[kashier.webhook] handler failed");
    return res.status(500).send("Internal processing error");
  }

  // 10. Phase 2 Hardening — Task 7: structured success audit log.
  logger.info({
    event: "KASHIER_PAYMENT_SUCCESS",
    orgId: event.orgId,
    planVersionId: event.planVersionId,
    contractId: String(contract._id),
    eventId: event.externalId,
    amount: event.amountMinor,
    currency: event.currency,
    correlationId
  }, "[kashier.webhook] payment success processed");
  return res.status(200).json({
    received: true,
    ...result
  });
}
module.exports = {
  handleKashierWebhook
};