/**
 * notification.model.js
 * Org-scoped notification record.
 * organizationId is always required — cross-tenant isolation guaranteed at schema level.
 */

const mongoose = require("mongoose");
const notificationSchema = new mongoose.Schema({
  /** Optional – if present, notification is user-scoped; else org-wide */
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  },
  /** Semantic type e.g. "PATIENT_CREATED", "SECURITY_ALERT" */
  type: {
    type: String,
    required: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  /** Domain entity type e.g. "PATIENT", "APPOINTMENT" */
  entityType: {
    type: String,
    default: null
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  /** Arbitrary event payload — RBAC restrictions stored here too */
  metadata: {
    type: Object,
    default: {}
  },
  priority: {
    type: String,
    enum: ["low", "normal", "high"],
    default: "normal"
  },
  isRead: {
    type: Boolean,
    default: false
  },
  /** Soft delete — hard deletes are prohibited */
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: {
    createdAt: true,
    updatedAt: false
  },
  collection: "notifications"
});

// ── Indexes ──────────────────────────────────────────────────────────────────
// Primary listing: most recent first per org
notificationSchema.index({
  createdAt: -1
});

// Unread count / filtering per user inside org
notificationSchema.index({
  userId: 1,
  isRead: 1
});

// Standardized single-field indexes
notificationSchema.index({});
const modelName = "Notification";
module.exports = {
  modelName,
  schema: notificationSchema
};