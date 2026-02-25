const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    // The specific user who performed the action (can be platform admin or tenant user)
    actorId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    actorType: {
        type: String,
        enum: ["platform_user", "tenant_user", "system"],
        default: "tenant_user",
        required: true,
    },
    action: {
        type: String,
        required: true,
    },
    entity: {
        type: String,
    },
    entityId: {
        type: mongoose.Schema.Types.ObjectId,
    },
    ipAddress: {
        type: String,
    },
    userAgent: {
        type: String,
    },
    statusCode: {
        type: Number,
    },
    success: {
        type: Boolean,
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

auditLogSchema.index({ organizationId: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ actorId: 1, actorType: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
