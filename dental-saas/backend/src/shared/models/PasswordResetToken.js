const mongoose = require("mongoose");

const passwordResetTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    token: {
        type: String, // Hashed
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true
    },
    isUsed: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

// Standardized single-field indexes
passwordResetTokenSchema.index({ userId: 1 });
passwordResetTokenSchema.index({ expiresAt: 1 }, { expires: 0 });

const modelName = "PasswordResetToken";

module.exports = {
    modelName,
    schema: passwordResetTokenSchema,
    default: mongoose.models[modelName] || mongoose.model(modelName, passwordResetTokenSchema),
};
