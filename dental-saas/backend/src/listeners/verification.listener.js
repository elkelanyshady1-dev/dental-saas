/**
 * verification.listener.js
 * Listeners — Verification Token Delivery via Communication Service
 * v1.0
 *
 * Listens for `verification.token.created` events emitted by the
 * Verification Engine and delivers the token via the appropriate channel.
 *
 * Fallback chain:
 *   PHONE_OTP: sms → whatsapp (NO email — phone channels only)
 *   All others: email only
 *
 * NOTE: Like email.events.js, these listeners bypass schemaRegistry
 * because they are infrastructure events, not domain crossed-cutting events.
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const { EventEmitter } = require("events");
const eventBus = require("@core/eventBus");
const { sendCommunication } = require("@services/communicationService");
const logger = require("@utils/logger");

// ─── Message builders per purpose ─────────────────────────────────────────────

function buildOtpSmsPayload(data) {
    return {
        phone: data.identifier,
        code: data.rawToken,
        message: `Your DentalSaaS verification code: ${data.rawToken}. Valid for 10 minutes.`,
    };
}

function buildOtpWhatsappPayload(data) {
    return {
        phone: data.identifier,
        body: `Your DentalSaaS verification code: ${data.rawToken}. Valid for 10 minutes. Do not share this code.`,
    };
}

function buildOtpEmailPayload(data) {
    return {
        email: data.metadata?.email || data.identifier,
        name: data.metadata?.name || data.identifier.split("@")[0],
        otp: data.rawToken,
    };
}

function buildEmailVerifyPayload(data) {
    const verifyUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/verify-email?token=${data.rawToken}`;
    return {
        email: data.identifier,
        name: data.metadata?.name || data.identifier.split("@")[0],
        verifyUrl,
    };
}

function buildPasswordResetPayload(data) {
    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${data.rawToken}`;
    return {
        email: data.identifier,
        name: data.metadata?.name || data.identifier.split("@")[0],
        resetUrl,
    };
}

function buildMagicLoginPayload(data) {
    const magicUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/auth/magic?token=${data.rawToken}`;
    return {
        email: data.identifier,
        name: data.metadata?.name || data.identifier.split("@")[0],
        magicLink: magicUrl,
    };
}

// ─── Channel dispatch map ─────────────────────────────────────────────────────
// Maps (purpose, channel) → { type, payloadBuilder }

const DISPATCH_MAP = {
    PHONE_OTP: {
        sms: { type: "OTP", builder: buildOtpSmsPayload },
        whatsapp: { type: "OTP", builder: buildOtpWhatsappPayload },
        email: { type: "EMAIL_OTP", builder: buildOtpEmailPayload },
    },
    EMAIL_VERIFY: {
        email: { type: "EMAIL_VERIFY", builder: buildEmailVerifyPayload },
    },
    PASSWORD_RESET: {
        email: { type: "PASSWORD_RESET", builder: buildPasswordResetPayload },
    },
    MAGIC_LOGIN: {
        email: { type: "MAGIC_LINK", builder: buildMagicLoginPayload },
    },
};

/**
 * Deliver a verification token through the channel fallback chain.
 * Tries each channel in order: primary → fallback → final.
 * Emits `verification.fallback.used` if primary fails.
 */
async function handleVerificationCreated(data) {
    const { purpose, channelOrder = [], identifier } = data;

    if (!purpose || !channelOrder.length) {
        logger.error({ data }, "[verification.listener] Invalid event data — missing purpose or channelOrder");
        return;
    }

    const purposeMap = DISPATCH_MAP[purpose];
    if (!purposeMap) {
        logger.error({ purpose }, "[verification.listener] No dispatch map for purpose");
        return;
    }

    let delivered = false;
    let deliveredVia = null;

    for (let i = 0; i < channelOrder.length; i++) {
        const channel = channelOrder[i];
        const dispatch = purposeMap[channel];

        if (!dispatch) {
            logger.warn({ purpose, channel }, "[verification.listener] No dispatch config for channel — skipping");
            continue;
        }

        try {
            const payload = dispatch.builder(data);

            await sendCommunication({
                channel,
                type: dispatch.type,
                payload,
            });

            delivered = true;
            deliveredVia = channel;

            // Emit fallback metric if not primary
            if (i > 0) {
                try {
                    EventEmitter.prototype.emit.call(eventBus, "verification.fallback.used", {
                        purpose,
                        identifier: identifier?.slice(0, 8) + "****",
                        failedChannels: channelOrder.slice(0, i),
                        deliveredVia: channel,
                    });
                } catch { /* non-blocking */ }

                logger.warn(
                    { purpose, failedChannels: channelOrder.slice(0, i), deliveredVia: channel },
                    "[verification.listener] Delivered via fallback channel"
                );
            } else {
                logger.info(
                    { purpose, channel, identifier: identifier?.slice(0, 8) + "****" },
                    "[verification.listener] Delivered via primary channel"
                );
            }

            break; // Success — stop trying channels
        } catch (err) {
            logger.warn(
                { purpose, channel, err: err.message, identifier: identifier?.slice(0, 8) + "****" },
                `[verification.listener] Channel "${channel}" failed — trying next`
            );
        }
    }

    if (!delivered) {
        logger.error(
            { purpose, identifier: identifier?.slice(0, 8) + "****", channelOrder },
            "[verification.listener] ALL channels failed — verification token NOT delivered"
        );
        // Don't throw — don't reveal delivery status to end user
    }
}

// ─── Register listener ────────────────────────────────────────────────────────

function registerVerificationListeners() {
    // Remove existing to prevent leaks on hot-reload
    eventBus.removeAllListeners("verification.token.created");
    eventBus.removeAllListeners("verification.token.verified");
    eventBus.removeAllListeners("verification.token.failed");
    eventBus.removeAllListeners("verification.fallback.used");

    // Main delivery listener
    EventEmitter.prototype.on.call(eventBus, "verification.token.created", (data) => {
        handleVerificationCreated(data).catch((err) => {
            logger.error({ err: err.message }, "[verification.listener] Unhandled error in delivery handler");
        });
    });

    // Metrics listeners (Section 10)
    EventEmitter.prototype.on.call(eventBus, "verification.token.verified", (data) => {
        _incrementMetric(data.purpose, "verified");
    });
    EventEmitter.prototype.on.call(eventBus, "verification.token.failed", (data) => {
        _incrementMetric(data.purpose, "failed");
    });
    EventEmitter.prototype.on.call(eventBus, "verification.fallback.used", (data) => {
        _incrementMetric(data.purpose, "fallback");
    });

    logger.info("[verification.listener] Verification event listeners registered");
}

/**
 * Increment CommunicationMetrics for verification events.
 */
async function _incrementMetric(purpose, field) {
    try {
        const CommunicationMetrics = require("@platform/models/CommunicationMetrics.model").default;
        const type = `VERIFY_${purpose || "UNKNOWN"}`;
        // Map to existing metric fields: sent=verified, failed=failed, retried=fallback
        const fieldMap = { verified: "sent", failed: "failed", fallback: "retried" };
        await CommunicationMetrics.increment("email", type, fieldMap[field] || "sent");
    } catch { /* metrics are non-blocking */ }
}

// ── Auto-register on require ──────────────────────────────────────────────────
registerVerificationListeners();

module.exports = { registerVerificationListeners };
