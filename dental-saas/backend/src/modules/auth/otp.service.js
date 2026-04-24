"use strict";

/**
 * otp.service.js
 * Channel-aware OTP service (sms | email).
 *
 * Sends OTPs through the unified Communication dispatcher. No direct
 * provider imports — channel/provider selection lives in infrastructure.
 *
 * Flow:
 *   sendOtp({channel, phone|email})
 *     → normalize subject
 *     → rate-limit check
 *     → generate OTP (crypto.randomInt)
 *     → sendCommunication({channel, type, payload})   [SYNC via dispatcher]
 *     → persist HMAC-hashed record
 *
 * Security:
 *   - OTP generated with crypto.randomInt (CSPRNG)
 *   - Stored as HMAC-SHA256(OTP_SECRET, otp)
 *   - Verified with timingSafeEqual
 *   - Plaintext OTP lives only in the sending call frame — never logged
 */

const crypto    = require("crypto");
const getPlatformModel = require("@core/db/getPlatformModel");
const OtpRecordDef = require("./otp.model");
let _OtpRecord_cache = null;
function OtpRecord() {
    return _OtpRecord_cache || (_OtpRecord_cache = getPlatformModel(OtpRecordDef));
}
const { sendCommunication } = require("@services/communicationService");
const { checkRateLimit, resetRateLimit } = require("./rateLimiter");
const logger    = require("@utils/logger");

const OTP_TTL_MS     = 5 * 60 * 1000;  // 5 minutes
const RATE_LIMIT_MS  = 60 * 1000;       // 60 seconds between requests
const MAX_ATTEMPTS   = 5;
const OTP_DIGITS     = 6;

const VALID_CHANNELS = new Set(["sms", "email"]);

// ─── Normalizers ──────────────────────────────────────────────────────────────

const EGYPTIAN_MOBILE_RE = /^20(10|11|12|15)\d{8}$/;
const EMAIL_RE           = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(raw) {
    if (typeof raw !== "string") throw makeError("Invalid phone number", 400, "INVALID_PHONE");

    const digits = raw.replace(/\D/g, "");

    let normalized;

    if (/^20\d{10}$/.test(digits)) {
        normalized = digits;                // 2010XXXXXXXX → keep
    } else if (/^0\d{10}$/.test(digits)) {
        normalized = `2${digits}`;          // 010XXXXXXXX  → 2010XXXXXXXX
    } else if (/^1\d{9}$/.test(digits)) {
        normalized = `20${digits}`;         // 10XXXXXXXX   → 2010XXXXXXXX
    } else {
        throw makeError("Invalid Egyptian phone number format", 400, "INVALID_PHONE");
    }

    if (!EGYPTIAN_MOBILE_RE.test(normalized)) {
        throw makeError("Phone number is not a valid Egyptian mobile number", 400, "INVALID_PHONE");
    }

    return normalized;
}

function normalizeEmail(raw) {
    if (typeof raw !== "string") throw makeError("Invalid email", 400, "INVALID_EMAIL");
    const email = raw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
        throw makeError("Invalid email format", 400, "INVALID_EMAIL");
    }
    return email;
}

function resolveSubject({ channel, phone, email }) {
    if (!VALID_CHANNELS.has(channel)) {
        throw makeError("channel must be 'sms' or 'email'", 400, "INVALID_CHANNEL");
    }
    if (channel === "sms") {
        if (!phone) throw makeError("phone is required for sms channel", 400, "MISSING_PHONE");
        return normalizePhone(phone);
    }
    if (!email) throw makeError("email is required for email channel", 400, "MISSING_EMAIL");
    return normalizeEmail(email);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateOtp() {
    const min = 10 ** (OTP_DIGITS - 1);
    const max = 10 ** OTP_DIGITS;
    // crypto.randomInt(min, max) — inclusive-exclusive, CSPRNG
    return String(crypto.randomInt(min, max));
}

function hashOtp(otp) {
    const secret = process.env.OTP_SECRET;
    if (!secret) throw new Error("OTP_SECRET environment variable is not set");
    return crypto.createHmac("sha256", secret).update(otp).digest("hex");
}

function timingSafeMatch(a, b) {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

function makeError(message, statusCode, errorCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.errorCode  = errorCode;
    return err;
}

function maskSubject(subject, channel) {
    if (channel === "email") {
        const [local, domain] = subject.split("@");
        if (!domain) return "***";
        const head = local.slice(0, Math.min(2, local.length));
        return `${head}***@${domain}`;
    }
    // sms — mask all but last 2
    return subject.slice(0, -2).replace(/\d/g, "*") + subject.slice(-2);
}

/**
 * Build the Communication payload for the chosen channel.
 *
 *   SMS   → dispatcher → sync.handler.adaptSmsPayload → smsProvider.sendSms
 *           needs { to, body }
 *   EMAIL → dispatcher → sync.handler → EmailService.process("EMAIL_OTP", payload)
 *           needs { email, otp, issuedAt, magicLinkUrl? }
 */
function buildDispatchArgs({ channel, subject, otp, magicLinkUrl, ipAddress, userAgent }) {
    if (channel === "sms") {
        return {
            channel: "sms",
            type: "OTP",
            payload: {
                to:   subject,
                body: otp,        // SMSMisr template uses `values`; Twilio/Vonage use `body` directly
                type: "OTP",
            },
        };
    }
    return {
        channel: "email",
        type: "EMAIL_OTP",
        payload: {
            email:    subject,
            otp,
            issuedAt: new Date(),
            ...(magicLinkUrl ? { magicLinkUrl } : {}),
            ...(ipAddress ? { ipAddress } : {}),
            ...(userAgent ? { userAgent } : {}),
        },
    };
}

// ─── Service ──────────────────────────────────────────────────────────────────

async function sendOtp({ channel, phone, email, ipAddress, userAgent } = {}) {
    const subject = resolveSubject({ channel, phone, email });

    // 0. Sliding-window rate limit (3 per 5 minutes per subject)
    await checkRateLimit("otp", subject);

    // 1. Rate limit check (per subject+channel) — per-request cooldown
    const cutoff = new Date(Date.now() - RATE_LIMIT_MS);
    const recent = await OtpRecord().findOne({
        subject,
        channel,
        createdAt: { $gt: cutoff },
    })
        .sort({ createdAt: -1 })
        .lean();

    if (recent) {
        const retryAfterSec = Math.ceil(
            (recent.createdAt.getTime() + RATE_LIMIT_MS - Date.now()) / 1000
        );
        throw makeError(
            `Please wait ${retryAfterSec} seconds before requesting a new OTP`,
            429,
            "OTP_RATE_LIMITED"
        );
    }

    // 2. Generate OTP (plaintext only lives in this scope)
    const otp = generateOtp();

    // 2b. For email channel, attempt to generate a magic link fallback
    let magicLinkUrl = null;
    if (channel === "email") {
        try {
            const magicService = require("./magic.service");
            const magicResult = await magicService.createMagicLink(subject, { ipAddress, _skipRateLimit: true, _skipSendEmail: true });
            if (magicResult?.magicUrl) {
                magicLinkUrl = magicResult.magicUrl;
            }
        } catch (magicErr) {
            // Non-blocking: magic link generation is a bonus, not required
            logger.warn(
                { err: magicErr.message, subject: maskSubject(subject, channel) },
                "OTP magic link fallback generation failed"
            );
        }
    }

    // 3. Dispatch via Communication layer (retry/backoff/failover handled upstream).
    //    Send FIRST, persist AFTER — we never store an OTP the user never received.
    const dispatchArgs = buildDispatchArgs({ channel, subject, otp, magicLinkUrl, ipAddress, userAgent });
    await sendCommunication(dispatchArgs);

    // 4. Delivery succeeded — replace any prior records for this subject+channel.
    await OtpRecord().deleteMany({ subject, channel });

    await OtpRecord().create({
        subject,
        channel,
        otpHash:   hashOtp(otp),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    logger.info(
        { subject: maskSubject(subject, channel), channel },
        "OTP sent"
    );
}

async function verifyOtp({ channel, phone, email, otp } = {}) {
    const subject = resolveSubject({ channel, phone, email });

    const record = await OtpRecord().findOne({ subject, channel }).sort({ createdAt: -1 });

    if (!record) {
        throw makeError("No OTP found for this subject", 400, "OTP_NOT_FOUND");
    }

    if (record.expiresAt < new Date()) {
        await OtpRecord().deleteOne({ _id: record._id });
        throw makeError("OTP has expired", 400, "OTP_EXPIRED");
    }

    if (record.attempts >= MAX_ATTEMPTS) {
        throw makeError(
            "Maximum verification attempts exceeded. Please request a new OTP",
            429,
            "OTP_MAX_ATTEMPTS"
        );
    }

    const inputHash = hashOtp(otp);
    const isMatch   = timingSafeMatch(inputHash, record.otpHash);

    if (!isMatch) {
        record.attempts += 1;
        await record.save();
        const remaining = MAX_ATTEMPTS - record.attempts;
        logger.warn(
            { subject: maskSubject(subject, channel), channel, attempts: record.attempts },
            "OTP verification invalid attempt"
        );
        throw makeError(
            `Invalid OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining`,
            400,
            "OTP_INVALID"
        );
    }

    await OtpRecord().deleteOne({ _id: record._id });

    // Clear rate limit on success
    await resetRateLimit("otp", subject);

    logger.info(
        { subject: maskSubject(subject, channel), channel },
        "OTP verification success"
    );

    return { verified: true, channel, subject };
}

module.exports = {
    sendOtp,
    verifyOtp,
    // exported for tests & any adjacent service that needs a shared normalizer
    normalizePhone,
    normalizeEmail,
};
