/**
 * sync.handler.js
 * Hybrid Execution Model — direct provider call with retry, backoff, timeout.
 *
 * Used for user-waiting flows: OTP, magic-link, password reset.
 * Blocks the caller until the provider ACKs (or every retry fails).
 *
 * ⚠️ Known limitation: an HTTP request can time out locally while the
 * provider still accepts the message, producing a duplicate on retry.
 * True at-most-once requires provider-side idempotency tokens; that is
 * out of scope for Phase 1 and is tracked against the adapter work.
 *
 * @per-plane Infrastructure
 */

"use strict";

const logger = require("@utils/logger");
const config = require("@config/communication.config");
const { sendSms } = require("../smsProvider");
const { sendWhatsapp } = require("../whatsappProvider");
const { EmailService } = require("@services/email/emailService");

// ─── Payload adapters ─────────────────────────────────────────────────────────
// The listener payload shape (phone/code/message) differs from the provider
// contract (to/body/type). Adapters translate and fail fast on missing fields
// so we surface bad wiring rather than swallowing it.

function adaptSmsPayload(type, payload) {
    const to = payload.to || payload.phone;
    const body = payload.body || payload.message;
    if (!to) throw new Error("[sync.handler] SMS payload missing `to`/`phone`");
    if (!body) throw new Error("[sync.handler] SMS payload missing `body`/`message`");
    return { to, body, type };
}

function adaptWhatsappPayload(type, payload) {
    const to = payload.to || payload.phone;
    if (!to) throw new Error("[sync.handler] WhatsApp payload missing `to`/`phone`");
    return {
        to,
        body: payload.body || payload.message,
        type,
        templateName: payload.templateName,
        templateParams: payload.templateParams,
    };
}

// ─── Timeout wrapper ──────────────────────────────────────────────────────────

function _withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`[sync.handler] ${label} timed out after ${ms}ms`));
        }, ms);
        if (timer.unref) timer.unref();
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ─── Provider invocation ──────────────────────────────────────────────────────

async function _callProvider({ channel, type, payload }) {
    if (config.SIMULATE_PROVIDER_FAILURE) {
        throw new Error("[sync.handler] Simulated provider failure (diagnostic)");
    }

    switch (channel) {
        case "email":
            return EmailService.process(type, payload);
        case "sms":
            return sendSms(adaptSmsPayload(type, payload));
        case "whatsapp":
            return sendWhatsapp(adaptWhatsappPayload(type, payload));
        default:
            throw new Error(`[sync.handler] Unsupported channel: ${channel}`);
    }
}

// ─── Retry loop ───────────────────────────────────────────────────────────────

async function deliverSync({ channel, type, payload }) {
    const maxAttempts = config.SYNC_MAX_RETRIES + 1;
    let lastErr;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await _withTimeout(
                _callProvider({ channel, type, payload }),
                config.PROVIDER_TIMEOUT_MS,
                `${channel}:${type}`
            );
            if (attempt > 1) {
                logger.info(
                    { channel, type, attempt },
                    "[sync.handler] Delivered after retry"
                );
            }
            return { mode: "sync", attempts: attempt, result };
        } catch (err) {
            lastErr = err;
            logger.warn(
                { channel, type, attempt, err: err.message },
                "[sync.handler] Attempt failed"
            );
            if (attempt < maxAttempts) {
                const backoff = config.SYNC_BACKOFF_MS * attempt;
                await new Promise((r) => setTimeout(r, backoff));
            }
        }
    }

    logger.error(
        { channel, type, attempts: maxAttempts, err: lastErr?.message },
        "[sync.handler] All retries exhausted"
    );
    throw lastErr;
}

module.exports = { deliverSync };
