const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ["info", "warning", "error", "success"],
            default: "info",
        },
        link: {
            type: String,
            default: null,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
            default: null,
        },
        branchId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            default: null,
        },
    },
    { timestamps: true }
);

notificationSchema.index({ organizationId: 1, userId: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

const modelName = "Notification";

module.exports = {
    modelName,
    schema: notificationSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, notificationSchema),
};
