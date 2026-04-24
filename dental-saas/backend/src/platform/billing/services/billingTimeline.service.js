/**
 * billingTimeline.service.js
 * Stripe-Style Billing Architecture — Timeline Event Emitter
 *
 * PURPOSE:
 * Single entry point for writing to the BillingTimeline projection.
 * All callers use emitBillingTimelineEvent() — never write to BillingTimeline directly.
 *
 * SAFETY CONTRACT:
 *  - This function NEVER throws.
 *  - All errors are logged only.
 *  - BillingTimeline write failures MUST NOT interrupt billing flows.
 *
 * IDEMPOTENCY:
 *  For events with a providerEventId, duplicate detection is performed before insert.
 *  For internal events (no providerEventId), dedup is by (orgId + contractId + eventType + time window).
 *
 * PLANE: Platform / Billing
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const BillingTimelineDef = require("../models/BillingTimeline.model");
let _BillingTimeline_cache = null;
function BillingTimeline() {
    return _BillingTimeline_cache || (_BillingTimeline_cache = getPlatformModel(BillingTimelineDef));
}
const logger = require("@utils/logger");

/**
 * emitBillingTimelineEvent
 *
 * Writes a BillingTimeline event document.
 * Never throws — all errors are caught and logged.
 *
 * @param {object} params
 * @param {string|import("mongoose").ObjectId} params.organizationId  REQUIRED
 * @param {string|import("mongoose").ObjectId} [params.contractId]
 * @param {string|import("mongoose").ObjectId} [params.invoiceId]
 * @param {string} params.eventType   One of BillingTimeline eventType enum values
 * @param {string} [params.providerEventId]  Provider webhook event ID for dedup
 * @param {"ledger"|"audit"|"system"} [params.source="system"]
 * @param {object} [params.payload]   Event-specific contextual data
 * @param {Date}   [params.occurredAt] Override timestamp (for backfill); defaults to now
 *
 * @returns {Promise<void>}  Always resolves — never rejects
 */
async function emitBillingTimelineEvent({
  organizationId,
  contractId = null,
  invoiceId = null,
  eventType,
  providerEventId = null,
  source = "system",
  payload = null,
  occurredAt = null
}) {
  if (!organizationId || !eventType) {
    logger.warn({
      organizationId,
      eventType
    }, "[BillingTimeline] emitBillingTimelineEvent called with missing required fields — skipped");
    return;
  }
  try {
    // ── Idempotency / Duplicate Detection ────────────────────────────────────
    // For provider events (webhooks), check by providerEventId.
    // This prevents duplicate entries during webhook retries or replay runs.
    if (providerEventId) {
      const exists = await BillingTimeline().exists({
        organizationId,
        contractId: contractId || null,
        eventType,
        providerEventId
      });
      if (exists) {
        logger.info({
          organizationId,
          contractId,
          eventType,
          providerEventId
        }, "[BillingTimeline] Duplicate event detected — skipping insert");
        return;
      }
    }
    await BillingTimeline().create({
      organizationId,
      contractId: contractId || null,
      invoiceId: invoiceId || null,
      eventType,
      providerEventId: providerEventId || null,
      source,
      payload: payload || null,
      occurredAt: occurredAt || new Date()
    });
    logger.debug({
      organizationId,
      contractId,
      eventType
    }, "[BillingTimeline] Event emitted");
  } catch (err) {
    // NEVER propagate — timeline is a projection layer only.
    logger.error({
      err: {
        message: err.message,
        code: err.code
      },
      organizationId,
      contractId,
      eventType
    }, "[BillingTimeline] Insert failed (non-fatal — billing flow continues)");
  }
}
module.exports = {
  emitBillingTimelineEvent
};