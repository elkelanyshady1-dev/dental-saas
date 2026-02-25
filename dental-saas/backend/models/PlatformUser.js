const mongoose = require("mongoose");

const platformUserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
            validate: {
                validator: function (v) {
                    return /^\$2[aby]\$\d{2}\$.{53}$/.test(v);
                },
                message: "Password must be a valid bcrypt hash"
            }
        },
        role: {
            type: String,
            enum: ["superadmin", "finance_admin", "operations_admin", "analyst"],
            default: "analyst",
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        tokenVersion: {
            type: Number,
            default: 0,
        },
        mustChangePassword: {
            type: Boolean,
            default: false,
        },
        passwordResetExpires: Date,
        // 🔒 v1.3.5 - Superadmin 2FA & Lockout
        twoFactorEnabled: {
            type: Boolean,
            default: false,
        },
        twoFactorSecretEncrypted: {
            type: String, // AES-256-GCM encrypted
            select: false,
        },
        recoveryCodes: [
            {
                codeHash: String,
                used: { type: Boolean, default: false },
                usedAt: Date,
            },
        ],
        failed2FAAttempts: {
            type: Number,
            default: 0,
        },
        lastFailed2FAAt: Date,
        twoFALockedUntil: Date,
        trustedIPs: [
            {
                ip: String,
                lastUsedAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

platformUserSchema.index({ name: 1 });
platformUserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model("PlatformUser", platformUserSchema);
