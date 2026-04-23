const getModel = require("@core/db/getModel");
const NotificationDef = require("../models/Notification");

/**
 * Get notifications for current user
 */
exports.getNotifications = async (req, res) => {
  try {
    const Notification = getModel(req.dbConnection, NotificationDef);
    const {
      limit = 20,
      page = 1
    } = req.query;
    const branchId = req.activeBranchId;
    const organizationId = req.organizationId;
    const userId = req.user._id;
    const query = {
      userId
    };
    if (branchId) query.branchId = branchId;
    const notifications = await Notification.find(query).sort({
      createdAt: -1
    }).limit(limit * 1).skip((page - 1) * limit);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

/**
 * Get unread notification count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const Notification = getModel(req.dbConnection, NotificationDef);
    const branchId = req.activeBranchId;
    const organizationId = req.organizationId;
    const userId = req.user._id;
    const query = {
      userId,
      isRead: false
    };
    if (branchId) query.branchId = branchId;
    const count = await Notification.countDocuments(query);
    res.json({
      count
    });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};

/**
 * Mark notification as read
 */
exports.markAsRead = async (req, res) => {
  try {
    const Notification = getModel(req.dbConnection, NotificationDef);
    const {
      id
    } = req.params;
    const organizationId = req.organizationId;
    const userId = req.user._id;
    const notification = await Notification.findOneAndUpdate({
      _id: id,
      userId
    }, {
      isRead: true,
      readAt: Date.now()
    }, {
      new: true
    });
    if (!notification) {
      return res.status(404).json({
        message: "Notification not found"
      });
    }

    // Emit Audit Log
    const auditService = require("../../services/auditService");
    await auditService.createAuditRecord({
      branchId: req.activeBranchId || "000000000000000000000000",
      userId,
      actorId: userId,
      actorType: "tenant_user",
      action: "NOTIFICATION_READ",
      entity: "notification",
      entityId: id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      statusCode: 200,
      success: true
    });
    res.json({
      success: true,
      notification
    });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
};