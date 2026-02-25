const mongoose = require("mongoose");

const phoneVerificationTokenSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
        index: true,
    },
    otp: {
        type: String, // Hashed
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 }, // TTL index
    },
    attempts: {
        type: Number,
        default: 0,
    },
    isUsed: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

module.exports = mongoose.model("PhoneVerificationToken", phoneVerificationTokenSchema);
