const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: "User",
        index: true
    },
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Organization",
        index: true
    },
    tokenHash: {
        type: String,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // TTL index
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

refreshTokenSchema.index({ userId: 1, revoked: 1 }); // Exact request
refreshTokenSchema.index({ organizationId: 1 }); // Exact request
refreshTokenSchema.index({ tokenHash: 1 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
