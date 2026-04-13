/**
 * notification.service.js
 * Thin service layer — validates payload then enqueues notification job.
 * Controllers and eventBus handlers call this; never persist directly.
 *
 * @per-org-transactional — Queue enqueuer only, no direct data queries.
 * organizationId received explicitly in payload, validated before enqueue.
 * Persistence is handled by the queue worker (notification.queue.js).
 */

const { addNotificationJob } = require("./notification.queue");
const logger = require("@utils/logger");

/**
 * Enqueue a notification for async persistence.
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
 * @returns {Promise<void>}   Returns immediately — non-blocking
 */
async function enqueueNotification(payload) {
    if (!payload?.organizationId) {
        logger.warn("[NotificationService] enqueueNotification called without organizationId — skipped");
        return;
    }
    if (!payload?.type || !payload?.title || !payload?.message) {
        logger.warn({ org: payload.organizationId }, "[NotificationService] Missing required fields — skipped");
        return;
    }

    try {
        await addNotificationJob({
            organizationId: String(payload.organizationId),
            userId: payload.userId ? String(payload.userId) : null,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            entityType: payload.entityType || null,
            entityId: payload.entityId ? String(payload.entityId) : null,
            metadata: payload.metadata || {},
            priority: payload.priority || "normal",
        });
    } catch (err) {
        // Non-fatal: log and continue — never block the caller
        logger.error({ err: err.message, type: payload.type }, "[NotificationService] Failed to enqueue notification");
    }
}

module.exports = { enqueueNotification };
