"use strict";

/**
 * otp.controller.js
 * Email-First OTP endpoints.
 *
 * v2.0 — SMS channel DISABLED. Only email OTP is supported.
 *
 * Request contract (both endpoints):
 *   {
 *     channel: "email",        // REQUIRED — only "email" accepted
 *     email:   string,         // required
 *     otp?:    string          // verify-otp only
 *   }
 *
 * SMS requests are rejected with 400 + SMS_OTP_DISABLED error code.
 */

const asyncHandler = require("@utils/asyncHandler");
const otpService   = require("./otp.service");

const VALID_CHANNELS = new Set(["email"]);

function validateChannelIdentifier({ channel, phone, email }) {
    // ── SMS Disabled Gate ──────────────────────────────────────────────────
    if (channel === "sms") {
        return {
            ok: false,
            message: "SMS OTP is no longer supported. Please use email verification.",
            errorCode: "SMS_OTP_DISABLED",
        };
    }

    if (!channel || !VALID_CHANNELS.has(channel)) {
        return { ok: false, message: "channel must be 'email'", errorCode: "INVALID_CHANNEL" };
    }

    if (phone) {
        return {
            ok: false,
            message: "Phone-based OTP is disabled. Use email instead.",
            errorCode: "SMS_OTP_DISABLED",
        };
    }

    if (!email) {
        return { ok: false, message: "email is required for channel 'email'", errorCode: "MISSING_EMAIL" };
    }

    return { ok: true };
}

exports.sendOtp = asyncHandler(async (req, res) => {
    const { channel, phone, email } = req.body || {};

    const check = validateChannelIdentifier({ channel, phone, email });
    if (!check.ok) {
        return res.status(400).json({
            success: false,
            message: check.message,
            errorCode: check.errorCode,
        });
    }

    await otpService.sendOtp({ channel: "email", email });

    res.status(200).json({
        success: true,
        message: "OTP sent to your email",
        channel: "email",
    });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
    const { channel, phone, email, otp } = req.body || {};

    const check = validateChannelIdentifier({ channel, phone, email });
    if (!check.ok) {
        return res.status(400).json({
            success: false,
            message: check.message,
            errorCode: check.errorCode,
        });
    }

    if (!otp) {
        return res.status(400).json({
            success: false,
            message: "otp is required",
            errorCode: "MISSING_OTP",
        });
    }

    if (!/^\d{6}$/.test(String(otp))) {
        return res.status(400).json({
            success: false,
            message: "OTP must be exactly 6 digits",
            errorCode: "INVALID_OTP_FORMAT",
        });
    }

    const result = await otpService.verifyOtp({
        channel: "email",
        email,
        otp: String(otp),
    });

    res.status(200).json({
        success: true,
        message: "Verified successfully",
        verified: result.verified,
        channel: result.channel,
    });
});
