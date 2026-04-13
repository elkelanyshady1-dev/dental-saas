const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: "User"
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
    },
    tokenHash: {
        type: String,
        required: true
    },
    regionCode: {
        type: String,
        uppercase: true
    },
    // v30.0 — Session binding: links access tokens to specific sessions
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: true
    },
    revoked: {
        type: Boolean,
        default: false
    },
    replacedByToken: {
        type: String,
        default: null,
    },
    userAgent: String,
    ipAddress: String,
    lastUsedAt: {
        type: Date,
        default: Date.now,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
    createdByIp: String,
}, { timestamps: true });

// Optional derived field for device name
refreshTokenSchema.virtual("deviceName").get(function () {
    if (!this.userAgent) return "Unknown Device";
    // Simple parser for device name from userAgent
    if (this.userAgent.includes("Windows")) return "Windows PC";
    if (this.userAgent.includes("Macintosh")) return "Mac";
    if (this.userAgent.includes("iPhone")) return "iPhone";
    if (this.userAgent.includes("Android")) return "Android Device";
    if (this.userAgent.includes("Linux")) return "Linux Device";
    return "Web Browser";
});

refreshTokenSchema.set("toJSON", { virtuals: true });
refreshTokenSchema.set("toObject", { virtuals: true });

refreshTokenSchema.index({ userId: 1, revoked: 1 });
refreshTokenSchema.index({ tokenHash: 1 });

// Standardized single-field indexes
refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expires: 0 });
// FIX 5 — Sprint-1: compound query index for "active tokens by user"
refreshTokenSchema.index({ userId: 1, revoked: 1, expiresAt: 1 });


const modelName = "RefreshToken";

module.exports = {
    modelName,
    schema: refreshTokenSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, refreshTokenSchema),
};
