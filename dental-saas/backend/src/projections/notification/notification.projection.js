/**
 * notification.projection.js — CQRS-lite Read Model
 */
"use strict";

const Notification = require("../../modules/notificationDomain/notification.model");

/**
 * Builds a clean list of notifications for a user.
 */
async function buildNotificationList({ organizationId, userId, role, limit = 20, cursor }) {
    const filter = {
        organizationId,
        isDeleted: false
    };

    if (cursor) {
        const cursorDate = new Date(cursor);
        if (!isNaN(cursorDate)) filter.createdAt = { $lt: cursorDate };
    }

    // Note: userId filter and role filtering happen here or in caller
    // For now, let's keep it simple and just projection-ize the query
    const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .lean();

    return notifications.map(transformNotification);
}

/**
 * Internal transformer to enforce DTO shape
 */
function transformNotification(doc) {
    return {
        id: doc._id.toString(),
        type: doc.type,
        priority: doc.priority,
        title: doc.title,
        message: doc.message,
        isRead: doc.isRead,
        metadata: doc.metadata,
        createdAt: doc.createdAt.toISOString()
    };
}

module.exports = {
    buildNotificationList
};
