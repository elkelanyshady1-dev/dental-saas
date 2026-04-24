/**
 * notification.service.js
 * Thin service layer — validates payload then persists a notification.
 *
 * v2.0 — Direct Mongo write (Phase 6 cleanup).
 * v1.x forwarded to a BullMQ notification.queue worker for async
 * persistence; the queue + worker were removed when Redis was eradicated.
 * Notification writes are cheap (single doc insert to an indexed
 * collection), so on-request persistence is acceptable here — the same
 * reasoning that applies to auditService.createAuditRecord.
 *
 * @per-org-transactional — Writes a single Notification doc; no session
 * required (notifications are observability, not part of any domain
 * aggregate's consistency boundary).
 */

const getModel = require("@core/db/getModel");
const { resolveOrgConnection } = require("@core/db/connectionResolver");
const NotificationDef = require("./notification.model");
const logger = require("@utils/logger");

/**
 * Persist a notification.
 *
 * Export name (enqueueNotification) is retained for caller compatibility
 * even though there's no longer a queue. Callers treat the return as
 * fire-and-forget, so internal errors log + swallow rather than throw.
 *
 * @param {Object} payload
 * @param {string|ObjectId} payload.organizationId  REQUIRED
 * @param {string}          payload.type            REQUIRED  e.g. "PATIENT_CREATED"
 * @param {string}          payload.title           REQUIRED
 * @param {string}          payload.message         REQUIRED
 * @param {string|ObjectId} [payload.userId]        Optional: user-scoped notification
 * @param {string}          [payload.entityType]    Optional: "PATIENT" | "APPOINTMENT" etc.
 * @param {string|ObjectId} [payload.entityId]      Optional: related entity _id
 * @param {Object}          [payload.metadata]      Optional: arbitrary extra data
 * @param {string}          [payload.priority]      Optional: "low" | "normal" | "high"
 * @returns {Promise<void>}
 */
async function enqueueNotification(payload) {
  if (!payload?.organizationId) {
    logger.warn("[NotificationService] enqueueNotification called without organizationId — skipped");
    return;
  }
  if (!payload?.type || !payload?.title || !payload?.message) {
    logger.warn({
      org: payload.organizationId
    }, "[NotificationService] Missing required fields — skipped");
    return;
  }
  try {
    const conn = await resolveOrgConnection(payload.organizationId);
    const Notification = getModel(conn, NotificationDef);
    await Notification.create({
      userId: payload.userId || null,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      entityType: payload.entityType || null,
      entityId: payload.entityId || null,
      metadata: payload.metadata || {},
      priority: payload.priority || "normal"
    });
  } catch (err) {
    // Non-fatal: log and continue — never block the caller. Same
    // contract the queue-based v1.x had (queue errors were swallowed).
    logger.error({
      err: err.message,
      type: payload.type
    }, "[NotificationService] Failed to persist notification");
  }
}
module.exports = {
  enqueueNotification
};