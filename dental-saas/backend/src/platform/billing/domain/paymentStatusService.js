/**
 * paymentStatusService.js
 * v13.0 — Controlled Payment Status Mutation Service
 *
 * ENFORCEMENT RULE:
 * This is the ONLY entry point for mutating payment status.
 * Controllers, webhook handlers, and reconciliation jobs must
 * NEVER write payment.status directly.
 *
 * All status changes:
 *   1. Pass through the state machine (assertValidTransition)
 *   2. Are logged in the audit trail
 *   3. Are version-guarded (OAV)
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const {
  assertValidTransition
} = require("./paymentStateMachine");
const PlatformInvoiceDef = require("../../../platform/billing/models/PlatformInvoice.model");
const PlatformInvoice = getPlatformModel(PlatformInvoiceDef);
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");

/**
 * updatePaymentStatus
 * Applies a status transition to a BillingInvoice (payment record).
 * Enforces state machine rules before writing.
 *
 * @param {object} params
 * @param {string} params.paymentId - BillingInvoice._id OR providerPaymentId
 * @param {string} params.nextStatus - Target status
 * @param {string} [params.actorId] - Who or what triggered this change (system/user ID)
 * @param {string} [params.actorType] - "system" | "platform_user"
 * @param {string} [params.regionCode] - For audit routing
 * @param {object} [params.session] - Mongoose session for transactional use
 * @param {object} [params.metadata] - Arbitrary context for audit
 * @returns {Promise<object>} Updated invoice document
 */
async function updatePaymentStatus({
  paymentId,
  nextStatus,
  actorId = "000000000000000000000000",
  actorType = "system",
  regionCode,
  session,
  metadata = {}
}) {
  // 1. Load the payment record
  const invoice = await PlatformInvoice.findById(paymentId).session(session || null);
  if (!invoice) {
    throw new Error(`[paymentStatusService] Payment not found: ${paymentId}`);
  }
  const currentStatus = invoice.paymentStatus || "pending";

  // 2. Enforce state machine — throws if invalid
  assertValidTransition(currentStatus, nextStatus);
  logger.info({
    paymentId,
    currentStatus,
    nextStatus,
    actorId,
    actorType,
    regionCode
  }, "[paymentStatusService] Applying payment status transition");

  // 3. Apply transition
  invoice.paymentStatus = nextStatus;
  invoice.version = (invoice.version || 0) + 1;
  const queryOptions = session ? {
    session
  } : {};
  await invoice.save(queryOptions);

  // 4. Audit
  try {
    await auditService.createAuditRecord({
      regionCode: regionCode || "GLOBAL",
      organizationId: invoice.organizationId,
      actorId,
      actorType,
      action: "PAYMENT_STATUS_TRANSITION",
      entity: "PLATFORM_INVOICE",
      entityId: invoice._id,
      details: {
        from: currentStatus,
        to: nextStatus,
        ...metadata
      }
    }, session);
  } catch (auditErr) {
    // Audit failure must not block payment state change — log and continue
    logger.error({
      auditErr,
      paymentId,
      nextStatus
    }, "[paymentStatusService] Audit write failed — continuing");
  }
  return invoice;
}

/**
 * updatePaymentStatusByProviderPaymentId
 * Convenience lookup by providerPaymentId (e.g. pi_xxx from Stripe).
 * Used by canonical event processor and webhook handlers.
 *
 * @param {object} params
 * @param {string} params.providerPaymentId - e.g. "pi_abc123"
 * @param {string} params.nextStatus
 * @param {object} [rest] - Passed to updatePaymentStatus
 */
async function updatePaymentStatusByProviderPaymentId({
  providerPaymentId,
  nextStatus,
  ...rest
}) {
  const invoice = await PlatformInvoice.findOne({
    providerPaymentId
  });
  if (!invoice) {
    throw new Error(`[paymentStatusService] No invoice found with providerPaymentId: ${providerPaymentId}`);
  }
  return updatePaymentStatus({
    paymentId: invoice._id,
    nextStatus,
    ...rest
  });
}
module.exports = {
  updatePaymentStatus,
  updatePaymentStatusByProviderPaymentId
};