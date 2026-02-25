const mongoose = require("mongoose");

const passwordResetTokenSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    token: {
        type: String, // Hashed
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }, // TTL index
    },
    isUsed: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

module.exports = mongoose.model("PasswordResetToken", passwordResetTokenSchema);
