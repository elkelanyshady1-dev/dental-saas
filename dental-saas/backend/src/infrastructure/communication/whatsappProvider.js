/**
 * whatsappProvider.js
 * Platform Infrastructure — WhatsApp Provider Abstraction
 * v1.0
 *
 * Wraps WhatsApp delivery behind a provider-agnostic interface.
 * Environment switching:
 *   development → Console log (no real send)
 *   staging/prod → WhatsApp Business API via Twilio or Meta Cloud API
 *
 * Env vars:
 *   WHATSAPP_PROVIDER=twilio|meta|console (default: console in dev)
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 *   META_WHATSAPP_TOKEN, META_PHONE_NUMBER_ID
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const logger = require("../../utils/logger");

/**
 * sendWhatsapp
 *
 * @param {{ to: string, body: string, type?: string, templateName?: string, templateParams?: string[] }} opts
 * @returns {Promise<{ messageId: string, provider: string }>}
 */
async function sendWhatsapp({ to, body, type = "GENERIC", templateName, templateParams }) {
    const env = process.env.NODE_ENV || "development";
    const provider = (process.env.WHATSAPP_PROVIDER || "console").toLowerCase();

    // ── Development: console only ───────────────────────────────────────────
    if (env === "development" || provider === "console") {
        logger.info({ to, type }, "[WhatsApp:Dev] 💬 Would send WhatsApp (console only)");
        console.log("\n─────────────────────────────────────────────");
        console.log("  💬 DEV WHATSAPP PREVIEW");
        console.log(`  To:       ${to}`);
        console.log(`  Type:     ${type}`);
        if (templateName) console.log(`  Template: ${templateName}`);
        console.log(`  Body:     ${body || "(template)"}`);
        console.log("─────────────────────────────────────────────\n");
        return { messageId: `dev-${Date.now()}`, provider: "console" };
    }

    // ── Twilio WhatsApp ─────────────────────────────────────────────────────
    if (provider === "twilio") {
        try {
            const twilio = require("twilio");
            const client = twilio(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_AUTH_TOKEN
            );
            const from = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
            const message = await client.messages.create({
                body: body || templateName,
                from,
                to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
            });
            logger.info({ sid: message.sid, to, type }, "[WhatsApp:Twilio] Message sent");
            return { messageId: message.sid, provider: "twilio-whatsapp" };
        } catch (err) {
            logger.error({ err: err.message, to, type }, "[WhatsApp:Twilio] Send failed");
            throw err;
        }
    }

    // ── Meta Cloud API ──────────────────────────────────────────────────────
    if (provider === "meta") {
        try {
            const axios = require("axios");
            const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
            const token = process.env.META_WHATSAPP_TOKEN;

            const messagePayload = templateName
                ? {
                    messaging_product: "whatsapp",
                    to: to.replace("+", ""),
                    type: "template",
                    template: {
                        name: templateName,
                        language: { code: "en" },
                        components: templateParams?.length ? [{
                            type: "body",
                            parameters: templateParams.map(p => ({ type: "text", text: p })),
                        }] : [],
                    },
                }
                : {
                    messaging_product: "whatsapp",
                    to: to.replace("+", ""),
                    type: "text",
                    text: { body },
                };

            const res = await axios.post(
                `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
                messagePayload,
                { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
            );

            const msgId = res.data?.messages?.[0]?.id;
            logger.info({ msgId, to, type }, "[WhatsApp:Meta] Message sent");
            return { messageId: msgId, provider: "meta" };
        } catch (err) {
            const detail = err.response?.data?.error?.message || err.message;
            logger.error({ err: detail, to, type }, "[WhatsApp:Meta] Send failed");
            throw new Error(detail);
        }
    }

    throw new Error(`[WhatsApp] Unknown provider: "${provider}". Set WHATSAPP_PROVIDER=twilio|meta|console`);
}

module.exports = { sendWhatsapp };
