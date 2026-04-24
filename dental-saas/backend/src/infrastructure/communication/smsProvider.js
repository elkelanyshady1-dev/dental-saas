/**
 * smsProvider.js
 * Platform Infrastructure — SMS Provider Abstraction
 * v1.1 — SMSMisr registered as an additional provider
 *
 * Wraps SMS delivery behind a provider-agnostic interface.
 * Environment switching:
 *   development → Console log (no real send)
 *   staging     → Twilio Test Credentials (free)
 *   production  → Twilio | Vonage | SMSMisr (via SMS_PROVIDER env)
 *
 * Env vars:
 *   SMS_PROVIDER=twilio|vonage|smsmisr|console (default: console in dev)
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *   VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_FROM_NUMBER
 *   SMSMISR_USERNAME, SMSMISR_PASSWORD, SMSMISR_SENDER, SMSMISR_TEMPLATE, SMSMISR_LANGUAGE
 *   SMS_FROM_NUMBER (fallback)
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const logger = require("../../utils/logger");
const smsmisrProvider = require("./providers/sms/smsmisr.provider");

/**
 * sendSms
 *
 * @param {{ to: string, body: string, type?: string }} opts
 * @returns {Promise<{ messageId: string, provider: string }>}
 */
async function sendSms({ to, body, type = "GENERIC" }) {
    const env = process.env.NODE_ENV || "development";
    const provider = (process.env.SMS_PROVIDER || "console").toLowerCase();

    // ── Development: console only ───────────────────────────────────────────
    if (env === "development" || provider === "console") {
        logger.info({ to, type, body }, "[SMS:Dev] 📱 Would send SMS (console only)");
        console.log("\n─────────────────────────────────────────────");
        console.log("  📱 DEV SMS PREVIEW");
        console.log(`  To:   ${to}`);
        console.log(`  Type: ${type}`);
        console.log(`  Body: ${body}`);
        console.log("─────────────────────────────────────────────\n");
        return { messageId: `dev-${Date.now()}`, provider: "console" };
    }

    // ── Twilio ──────────────────────────────────────────────────────────────
    if (provider === "twilio") {
        try {
            const twilio = require("twilio");
            const client = twilio(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
            );
            const message = await client.messages.create({
                body,
                from: process.env.TWILIO_FROM_NUMBER || process.env.SMS_FROM_NUMBER,
                to,
            });
            logger.info({ sid: message.sid, to, type }, "[SMS:Twilio] Message sent");
            return { messageId: message.sid, provider: "twilio" };
        } catch (err) {
            logger.error({ err: err.message, to, type }, "[SMS:Twilio] Send failed");
            throw err;
        }
    }

    // ── SMSMisr ─────────────────────────────────────────────────────────────
    if (provider === "smsmisr") {
        try {
            const result = await smsmisrProvider.send({ to, body, type });
            logger.info({ messageId: result.messageId, to, type }, "[SMS:SMSMisr] Message sent");
            return { messageId: result.messageId, provider: result.provider };
        } catch (err) {
            logger.error({ err: err.message, to, type }, "[SMS:SMSMisr] Send failed");
            throw err;
        }
    }

    // ── Vonage ──────────────────────────────────────────────────────────────
    if (provider === "vonage") {
        try {
            const Vonage = require("@vonage/server-sdk");
            const vonage = new Vonage({
                apiKey: process.env.VONAGE_API_KEY,
                apiSecret: process.env.VONAGE_API_SECRET,
            });
            return new Promise((resolve, reject) => {
                vonage.message.sendSms(
                    process.env.VONAGE_FROM_NUMBER || process.env.SMS_FROM_NUMBER || "OrthoNoe",
                    to,
                    body,
                    (err, response) => {
                        if (err) { reject(err); return; }
                        const msg = response.messages?.[0];
                        if (msg?.status !== "0") {
                            reject(new Error(`Vonage error: ${msg?.["error-text"] || "Unknown"}`));
                            return;
                        }
                        logger.info({ id: msg["message-id"], to, type }, "[SMS:Vonage] Message sent");
                        resolve({ messageId: msg["message-id"], provider: "vonage" });
                    }
                );
            });
        } catch (err) {
            logger.error({ err: err.message, to, type }, "[SMS:Vonage] Send failed");
            throw err;
        }
    }

    throw new Error(`[SMS] Unknown provider: "${provider}". Set SMS_PROVIDER=twilio|vonage|smsmisr|console`);
}

module.exports = { sendSms };
