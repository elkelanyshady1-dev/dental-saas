/**
 * notification.routes.js
 * Mounted under: /api/v1/org/notifications (via orgV1Routes)
 *
 * Route order matters:
 *   /unread-count  and /mark-all-read BEFORE /:id to avoid param capture
 */

const express = require("express");
const router = express.Router();
const controller = require("./notification.controller");

// GET  /                  — paginated list
router.get("/", controller.getNotifications);

// GET  /unread-count      — badge count (must be before /:id)
router.get("/unread-count", controller.getUnreadCount);

// PATCH /mark-all-read    — mark all user-scoped as read (must be before /:id)
router.patch("/mark-all-read", controller.markAllRead);

// PATCH /:id/read         — mark single as read
router.patch("/:id/read", controller.markAsRead);

// DELETE /:id             — soft delete
router.delete("/:id", controller.deleteNotification);

module.exports = router;
