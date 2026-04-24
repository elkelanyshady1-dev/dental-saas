/**
 * platformNotification.controller.js
 * Platform — Notification API
 *
 * GET  /api/platform/notifications            → list unread notifications (paginated)
 * GET  /api/platform/notifications/unread-count → badge count
 * POST /api/platform/notifications/:id/read   → mark one as read
 * POST /api/platform/notifications/read-all   → mark all as read
 *
 * RBAC: VIEW_PLATFORM_ANALYTICS (all authenticated platform users)
 * PLANE: Platform
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const PlatformNotificationDef = require("../../platform/models/PlatformNotification");
let _PlatformNotification_cache = null;
function PlatformNotification() {
    return _PlatformNotification_cache || (_PlatformNotification_cache = getPlatformModel(PlatformNotificationDef));
}
const logger = require("@utils/logger");

// ─── GET /notifications ───────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const userId = req.platformUser?._id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const skip = (page - 1) * limit;
    const unreadOnly = req.query.unread === "true";
    const filter = unreadOnly ? {
      readBy: {
        $nin: [userId]
      }
    } : {};
    const [notifications, total] = await Promise.all([PlatformNotification().find(filter).sort({
      createdAt: -1
    }).skip(skip).limit(limit).lean(), PlatformNotification().countDocuments(filter)]);

    // Annotate each notification with whether THIS user has read it
    const annotated = notifications.map(n => ({
      ...n,
      isRead: Array.isArray(n.readBy) && n.readBy.some(id => String(id) === String(userId))
    }));
    return res.json({
      success: true,
      data: annotated,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[platformNotification] list failed");
    return res.status(500).json({
      success: false,
      error: "Failed to load notifications",
      requestId: req.requestId
    });
  }
};

// ─── GET /notifications/unread-count ─────────────────────────────────────────
exports.unreadCount = async (req, res) => {
  try {
    const userId = req.platformUser?._id;
    const count = await PlatformNotification().countDocuments({
      readBy: {
        $nin: [userId]
      }
    });
    return res.json({
      success: true,
      count,
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[platformNotification] unreadCount failed");
    return res.status(500).json({
      success: false,
      error: "Failed to get count",
      requestId: req.requestId
    });
  }
};

// ─── POST /notifications/:id/read ────────────────────────────────────────────
exports.markRead = async (req, res) => {
  try {
    const userId = req.platformUser?._id;
    const {
      id
    } = req.params;
    await PlatformNotification().updateOne({
      _id: id
    }, {
      $addToSet: {
        readBy: userId
      }
    });
    return res.json({
      success: true,
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[platformNotification] markRead failed");
    return res.status(500).json({
      success: false,
      error: "Failed to mark as read",
      requestId: req.requestId
    });
  }
};

// ─── POST /notifications/read-all ────────────────────────────────────────────
exports.markAllRead = async (req, res) => {
  try {
    const userId = req.platformUser?._id;
    await PlatformNotification().updateMany({
      readBy: {
        $nin: [userId]
      }
    }, {
      $addToSet: {
        readBy: userId
      }
    });
    return res.json({
      success: true,
      requestId: req.requestId
    });
  } catch (err) {
    logger.error({
      err,
      requestId: req.requestId
    }, "[platformNotification] markAllRead failed");
    return res.status(500).json({
      success: false,
      error: "Failed to mark all as read",
      requestId: req.requestId
    });
  }
};