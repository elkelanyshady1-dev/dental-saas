/**
 * billingAuditLog.service.js
 * Sprint 7 — Billing Lifecycle Audit Trail Service
 *
 * Thin write-only wrapper around BillingAuditLog.model.js.
 * All billing services use this module to emit audit events.
 *
 * Design principles:
 *   - Never throws (billing audit failures must not interrupt business flows)
 *   - Supports optional session for transactional writes
 *   - Returns the created document or null on failure
 *
 * PLANE: Platform (accessible from all billing services)
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const BillingAuditLogDef = require("../models/BillingAuditLog.model");
const BillingAuditLog = getPlatformModel(BillingAuditLogDef);
const logger = require("@utils/logger");

/**
 * logBillingEvent — primary write entry point.
 *
 * @param {object} params
 * @param {string|mongoose.Types.ObjectId} params.organizationId
 * @param {string|mongoose.Types.ObjectId} [params.contractId]
 * @param {string|mongoose.Types.ObjectId} [params.invoiceId]
 * @param {string} params.eventType                 — must be in BillingAuditLog enum
 * @param {object} [params.previousState]           — before snapshot
 * @param {object} [params.newState]                — after snapshot
 * @param {string} [params.performedBy="system"]    — "system", "webhook", or PlatformUser._id
 * @param {object} [params.metadata]                — arbitrary context
 * @param {mongoose.ClientSession} [params.session] — MongoDB session for transactional writes
 *
 * @returns {Promise<BillingAuditLog|null>}
 */
async function logBillingEvent({
  organizationId,
  contractId = null,
  invoiceId = null,
  eventType,
  previousState = null,
  newState = null,
  performedBy = "system",
  metadata = null,
  session = null
} = {}) {
  try {
    const doc = new BillingAuditLog({
      organizationId,
      contractId,
      invoiceId,
      eventType,
      previousState,
      newState,
      performedBy,
      metadata
    });
    const opts = session ? {
      session
    } : {};
    await doc.save(opts);
    return doc;
  } catch (err) {
    // Non-fatal: log the error but never propagate to caller
    logger.error({
      err,
      eventType,
      organizationId: organizationId?.toString(),
      contractId: contractId?.toString()
    }, "[BillingAuditLog] Write failed (non-fatal)");
    return null;
  }
}

/**
 * getOrgBillingHistory — read paginated audit trail for an org.
 *
 * @param {string} organizationId
 * @param {object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.limit=50]
 * @param {string} [opts.eventType]   — filter by specific event type
 * @param {string} [opts.contractId]  — filter by contract
 *
 * @returns {Promise<{ data: object[], pagination: object }>}
 */
async function getOrgBillingHistory(organizationId, {
  page = 1,
  limit = 50,
  eventType,
  contractId
} = {}) {
  const filter = {
    organizationId
  };
  if (eventType) filter.eventType = eventType;
  if (contractId) filter.contractId = contractId;
  const skip = (page - 1) * limit;
  const total = await BillingAuditLog.countDocuments(filter);
  const data = await BillingAuditLog.find(filter).sort({
    createdAt: -1
  }).skip(skip).limit(limit).lean();
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  };
}
module.exports = {
  logBillingEvent,
  getOrgBillingHistory
};