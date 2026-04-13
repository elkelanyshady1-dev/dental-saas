/**
 * notification.controller.js
 *
 * GET    /api/v1/org/notifications              — list (paginated, filterable)
 * GET    /api/v1/org/notifications/unread-count — unread badge count
 * PATCH  /api/v1/org/notifications/:id/read     — mark single as read
 * PATCH  /api/v1/org/notifications/mark-all-read — mark all user-scoped as read
 * DELETE /api/v1/org/notifications/:id          — soft delete
 *
 * Per-org DB: queries scoped by connection, NOT by organizationId filter.
 * No client-supplied organizationId trusted.
 */

const mongoose = require("mongoose");
const notificationProjection = require("../../projections/notification/notification.projection");
const AuditLogDef = require("../../shared/models/AuditLog");
const getModel = require("../../core/db/getModel");
const { successResponse, errorResponse } = require("@utils/responseFormatter");
const NotificationDef = require("./notification.model");
const { getRole } = require("@utils/auth/getRole");

// Per-request model resolution (RLS-compliant)
function _getSecureNotification(req) {
    return getModel(req.dbConnection, NotificationDef);
}
function _getSecureAuditLog(req) {
    return getModel(req.dbConnection, AuditLogDef);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns base filter (per-org DB: scoped by connection, no organizationId needed) */
const orgFilter = (req, extra = {}) => ({
    isDeleted: false,
    ...extra,
});

/** RBAC filter: hide role-restricted notifications the user cannot see */
const isAllowedForUser = (notification, roleName) => {
    const allowed = notification?.metadata?.allowedRoles;
    if (!allowed || !Array.isArray(allowed) || allowed.length === 0) return true;
    return allowed.includes(roleName);
};

// ─── GET /notifications ───────────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
    try {
        const {
            unreadOnly,
            priority,
            limit: rawLimit = 20,
            cursor,
        } = req.query;

        const limit = Math.min(parseInt(rawLimit) || 20, 100);

        const list = await notificationProjection.buildNotificationList({
            organizationId: req.organizationId,
            userId: req.user._id,
            role: getRole(req),
            limit,
            cursor
        });

        const hasMore = list.length > limit;
        const items = hasMore ? list.slice(0, limit) : list;

        // RBAC: filter out role-restricted notifications (if not already handled in projection)
        const visible = items.filter(n => isAllowedForUser(n, getRole(req)));

        const nextCursor = hasMore && visible.length > 0
            ? visible[visible.length - 1].createdAt
            : null;

        return successResponse(res, visible, { hasMore, nextCursor });
    } catch (err) {
        return errorResponse(res, err.message, "FETCH_FAILED", 500);
    }
};

// ─── GET /notifications/unread-count ─────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
    try {
        const Notification = _getSecureNotification(req);
        const count = await Notification.countDocuments(orgFilter(req, { isRead: false }));
        return res.json({ success: true, count });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── PATCH /notifications/:id/read ───────────────────────────────────────────
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid notification ID" });
        }

        const Notification = _getSecureNotification(req);
        const notification = await Notification.findOne(orgFilter(req, { _id: id }));
        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        // User-scoped check: if userId set, only that user can mark it read
        if (notification.userId && String(notification.userId) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: "Permission denied" });
        }

        // RBAC visibility check
        if (!isAllowedForUser(notification, getRole(req))) {
            return res.status(403).json({ success: false, message: "Permission denied" });
        }

        notification.isRead = true;
        await notification.save();

        return res.json({ success: true, data: { _id: notification._id, isRead: true } });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── PATCH /notifications/mark-all-read ──────────────────────────────────────
exports.markAllRead = async (req, res) => {
    try {
        const Notification = _getSecureNotification(req);
        const result = await Notification.updateMany(
            orgFilter(req, {
                userId: req.user._id,
                isRead: false,
            }),
            { $set: { isRead: true } }
        );

        return res.json({ success: true, updated: result.modifiedCount });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─── DELETE /notifications/:id (soft delete) ──────────────────────────────────
exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid notification ID" });
        }

        const Notification = _getSecureNotification(req);
        const notification = await Notification.findOne(orgFilter(req, { _id: id }));
        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        // User-scoped check
        if (notification.userId && String(notification.userId) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: "Permission denied" });
        }

        // Soft delete — hard deletes prohibited
        notification.isDeleted = true;
        await notification.save();

        // Emit audit event (non-fatal)
        try {
            const AuditLog = _getSecureAuditLog(req);
            await AuditLog.create({
                userId: req.user._id,
                actorId: req.user._id,
                actorType: "tenant_user",
                action: "NOTIFICATION_DELETED",
                entity: "notification",
                entityType: "NOTIFICATION",
                entityId: notification._id,
                metadata: { type: notification.type, title: notification.title },
                ipAddress: req.ip,
                userAgent: req.headers["user-agent"],
                statusCode: 200,
                success: true,
            });
        } catch (auditErr) {
            // Non-fatal — audit failure should not block successful deletion
        }

        return res.json({ success: true, message: "Notification deleted" });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};
