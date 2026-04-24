const mongoose = require("mongoose");
const PlatformNotificationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["SUBSCRIPTION_EXPIRING", "RETRY_FAILED", "RETRY_EXHAUSTED", "PLAN_CHANGED", "ORG_SUSPENDED", "SYSTEM_ALERT"],
    required: true
  },
  title: String,
  message: String,
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization"
  },
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "PlatformUser"
  }],
  severity: {
    type: String,
    enum: ["info", "warning", "critical"],
    default: "info"
  }
}, {
  timestamps: true
});
PlatformNotificationSchema.index({
  createdAt: -1
});
PlatformNotificationSchema.index({
  organizationId: 1
});
PlatformNotificationSchema.index({
  readBy: 1
});
const modelName = "PlatformNotification";
module.exports = {
  modelName,
  schema: PlatformNotificationSchema
};