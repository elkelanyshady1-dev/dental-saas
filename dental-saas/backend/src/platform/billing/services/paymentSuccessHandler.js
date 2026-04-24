/**
 * paymentSuccessHandler.js
 * Canonical dispatcher for `payment_success` events (Kashier + Stripe).
 *
 * Pre-Phase-8 Hardening pipeline (strict, fail-fast, in this order):
 *   1. Type guard                       — ignore non-success events.
 *   2. Metadata integrity check         — orgId + planVersionId + contractId + interval REQUIRED.
 *   3. Double-payment idempotency       — contract.lastPaymentId === event.paymentId → no-op.
 *   4. Provider-specific activation     — activate{Manual,Provider}Subscription.
 *                                         Contract state is aligned inside _doActivate.
 *   5. Invoice reconciliation            — markInvoicePaid, best-effort + idempotent
 *                                         (short-circuits when already paid).
 *   6. PAYMENT_SUCCESS_PROCESSED log    — single unified audit entry.
 *
 * Event shape (from provider.parseEvent):
 *   { provider, type, externalId, paymentId, amountMinor, currency,
 *     orgId, planVersionId, contractId, invoiceId, interval, metadata, raw }
 *
 * PLANE: Platform / Billing
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const {
  activateManualSubscription,
  activateProviderSubscription
} = require("./subscription.service");
const PlatformInvoiceDef = require("@billing/models/PlatformInvoice.model");
let _PlatformInvoice_cache = null;
function PlatformInvoice() {
    return _PlatformInvoice_cache || (_PlatformInvoice_cache = getPlatformModel(PlatformInvoiceDef));
}
const OrgContractDef = require("@billing/models/OrgContract.model");
let _OrgContract_cache = null;
function OrgContract() {
    return _OrgContract_cache || (_OrgContract_cache = getPlatformModel(OrgContractDef));
}
const logger = require("@utils/logger");

// ─── Top-level dispatcher ────────────────────────────────────────────────────
async function handlePaymentSuccess(event) {
  if (!event || typeof event !== "object") {
    throw Object.assign(new Error("INVALID_EVENT"), {
      code: "INVALID_EVENT"
    });
  }

  // 1. Type guard
  if (event.type !== "payment_success") {
    logger.info({
      provider: event.provider,
      type: event.type,
      externalId: event.externalId
    }, "[paymentSuccessHandler] ignoring non-success event");
    return {
      handled: false,
      reason: "not_a_success_event"
    };
  }

  // 2. Metadata integrity check (GLOBAL — Section 6).
  //    Every success event from every provider must carry these fields.
  //    Defence-in-depth against direct callers (tests, replay tools) that
  //    bypass the webhook controller's validator.
  if (!event.orgId || !event.planVersionId || !event.contractId || !event.interval) {
    throw Object.assign(new Error("INVALID_EVENT_METADATA: orgId, planVersionId, contractId, and interval are required"), {
      code: "INVALID_EVENT_METADATA",
      hasOrgId: !!event.orgId,
      hasPlanVersionId: !!event.planVersionId,
      hasContractId: !!event.contractId,
      hasInterval: !!event.interval
    });
  }

  // Final-hardening — Section 3: payment ID is REQUIRED.
  // Without it the dedup guard cannot prevent replays AND the contract's
  // `lastPaymentId` audit field is left null. Refuse the event up-front
  // with a 400 so the provider's webhook layer surfaces the bad payload.
  const paymentId = event.paymentId || event.externalId;
  if (!paymentId) {
    throw Object.assign(new Error("PAYMENT_ID_REQUIRED: event must carry paymentId or externalId."), {
      code: "PAYMENT_ID_REQUIRED",
      status: 400
    });
  }

  // 3. Double-payment idempotency (Section 9).
  //    KashierEvent / StripeEvent collections already dedupe at the
  //    webhook layer (by provider eventId). This second guard protects
  //    against out-of-band replays — e.g. admin manually fires
  //    handlePaymentSuccess with the same paymentId. If the contract's
  //    lastPaymentId already matches, short-circuit cleanly.
  const existingContract = await OrgContract().findById(event.contractId).lean();
  if (!existingContract) {
    // Dispatcher-level CONTRACT_NOT_FOUND — webhook controller should
    // already catch this but we want the dispatcher to fail loudly
    // for internal callers too.
    throw Object.assign(new Error(`CONTRACT_NOT_FOUND: ${event.contractId}`), {
      code: "CONTRACT_NOT_FOUND",
      contractId: String(event.contractId)
    });
  }
  // Phase 9 hardening — Section 6: CONTRACT_ID_MISMATCH double-safety.
  // findById should never return a doc whose _id differs from the query,
  // but if it ever did (corrupted alias, malicious replay with a coerced
  // id, mongoose middleware bug) we refuse to apply the payment.
  if (event.contractId !== String(existingContract._id)) {
    throw Object.assign(new Error(`CONTRACT_ID_MISMATCH: event=${event.contractId}, fetched=${String(existingContract._id)}`), {
      code: "CONTRACT_ID_MISMATCH",
      status: 500,
      eventContractId: String(event.contractId),
      fetchedContractId: String(existingContract._id)
    });
  }
  if (existingContract.lastPaymentId === paymentId) {
    // Final-hardening — Section 8: warn level so SRE can grep replay
    // attempts that escape the per-provider event-id dedup. Includes
    // contractId + paymentId + provider so it is debuggable in isolation.
    logger.warn({
      event: "DUPLICATE_PAYMENT_ATTEMPT",
      contractId: String(event.contractId),
      paymentId,
      provider: event.provider
    }, "[paymentSuccessHandler] duplicate payment attempt — short-circuited");
    return {
      handled: false,
      reason: "duplicate_payment",
      duplicate: true
    };
  }

  // 4. Provider-specific activation.
  let dispatchResult;
  switch (event.provider) {
    case "kashier":
      dispatchResult = await _handleKashierSuccess(event, paymentId);
      break;
    case "stripe":
      dispatchResult = await _handleStripeSuccess(event, paymentId);
      break;
    default:
      throw Object.assign(new Error(`UNKNOWN_PROVIDER: ${event.provider}`), {
        code: "UNKNOWN_PROVIDER",
        provider: event.provider
      });
  }

  // 5. Invoice reconciliation (best-effort, idempotent).
  await markInvoicePaid(event.invoiceId, paymentId);

  // ── Final-hardening — Section 2: POST_PAYMENT_AMOUNT_DRIFT (LOG ONLY) ──
  // After the invoice is settled, do a non-blocking sanity check that the
  // invoice amount agrees with the contract amount. Any divergence here
  // indicates an upstream tampering bug or a partial-pay flow that
  // bypassed the orchestrator's INVOICE_AMOUNT_MISMATCH guard. We log
  // but do NOT throw — the payment has already been applied.
  if (event.invoiceId) {
    try {
      const reloadedInvoice = await PlatformInvoice().findById(event.invoiceId).lean();
      const contractAmountMinor = typeof existingContract.lockedPrice === "number" ? Math.round(existingContract.lockedPrice * 100) : null;
      const invoiceAmountMinor = reloadedInvoice?.totalAmountMinor ?? null;
      if (reloadedInvoice && contractAmountMinor !== null && invoiceAmountMinor !== null && invoiceAmountMinor !== contractAmountMinor) {
        logger.error({
          event: "POST_PAYMENT_AMOUNT_DRIFT",
          invoiceId: String(event.invoiceId),
          contractId: String(event.contractId),
          invoiceAmount: invoiceAmountMinor,
          contractAmount: contractAmountMinor
        }, "[paymentSuccessHandler] post-payment amount drift detected (logged, not thrown)");
      }
    } catch (driftErr) {
      // Drift check itself failing must not affect the success result.
      logger.warn({
        err: driftErr
      }, "[paymentSuccessHandler] amount-drift check failed");
    }
  }

  // 6. Unified audit log (Section 8).
  logger.info({
    event: "PAYMENT_SUCCESS_PROCESSED",
    orgId: event.orgId,
    provider: event.provider,
    contractId: event.contractId,
    invoiceId: event.invoiceId || null,
    amountMinor: event.amountMinor || null,
    currency: event.currency || null,
    paymentId
  }, "[paymentSuccessHandler] payment success processed");
  return dispatchResult;
}

// ─── Invoice reconciliation ─────────────────────────────────────────────────
/**
 * markInvoicePaid
 * Idempotent terminal-state transition for a PlatformInvoice.
 *
 *   - No-op when invoiceId is missing.
 *   - No-op when invoice already has status === "paid"
 *     (prevents double settlement on retries / replays).
 *   - Never throws — a failed invoice update MUST NOT block activation.
 *     The subscription is already active by the time we get here; an
 *     unreconciled invoice is a data drift that finance reconciliation
 *     can clean up, not a correctness bug.
 */
async function markInvoicePaid(invoiceId, paymentId) {
  if (!invoiceId) return;
  try {
    const invoice = await PlatformInvoice().findById(invoiceId);
    if (!invoice) {
      logger.warn({
        event: "INVOICE_MARK_PAID_MISSING",
        invoiceId: String(invoiceId)
      }, "[paymentSuccessHandler] invoice not found — skipped");
      return;
    }
    if (invoice.status === "paid") {
      // Idempotent short-circuit — already settled, don't overwrite
      // paidAt / providerPaymentId with a second payment's values.
      logger.info({
        event: "INVOICE_ALREADY_PAID",
        invoiceId: String(invoiceId)
      }, "[paymentSuccessHandler] invoice already paid — no-op");
      return;
    }
    const update = {
      status: "paid",
      paymentStatus: "captured",
      paidAt: new Date()
    };
    if (paymentId) update.providerPaymentId = paymentId;
    await PlatformInvoice().findByIdAndUpdate(invoiceId, update);
    logger.info({
      event: "INVOICE_MARKED_PAID",
      invoiceId: String(invoiceId),
      providerPaymentId: paymentId || null
    }, "[paymentSuccessHandler] invoice marked paid");
  } catch (err) {
    logger.error({
      err,
      event: "INVOICE_MARK_PAID_FAILED",
      invoiceId: String(invoiceId),
      providerPaymentId: paymentId || null
    }, "[paymentSuccessHandler] invoice update failed — activation stands; requires reconciliation");
  }
}

// ─── Provider branches ──────────────────────────────────────────────────────
async function _handleKashierSuccess(event, paymentId) {
  const {
    orgId,
    planVersionId,
    interval,
    contractId
  } = event;
  const org = await activateManualSubscription({
    orgId,
    contractId,
    planVersionId,
    interval,
    paymentId
  });
  return {
    handled: true,
    result: {
      orgId: String(org._id),
      provider: "kashier",
      currentPeriodEnd: org.subscription?.currentPeriodEnd || null
    }
  };
}
async function _handleStripeSuccess(event, paymentId) {
  const {
    orgId,
    planVersionId,
    interval,
    contractId
  } = event;
  const org = await activateProviderSubscription({
    orgId,
    contractId,
    planVersionId,
    interval,
    paymentId,
    provider: "stripe"
  });
  return {
    handled: true,
    result: {
      orgId: String(org._id),
      provider: "stripe",
      currentPeriodEnd: org.subscription?.currentPeriodEnd || null
    }
  };
}
module.exports = {
  handlePaymentSuccess
};