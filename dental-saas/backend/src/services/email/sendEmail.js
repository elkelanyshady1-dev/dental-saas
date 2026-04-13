/**
 * sendEmail.js
 * Platform Email — Multi-Provider SMTP Dispatcher
 * v4.0 — Delegates to ProviderRouter for failover chain
 *
 * All provider selection, account creation, and failover logic
 * is handled by providerRouter.js.
 *
 * This module is the public API for backward compatibility —
 * all callers (EmailService, communicationMetricsController, etc.)
 * continue to import { sendEmail } from here.
 *
 * PLANE: Platform / Shared
 */

"use strict";

const { sendWithFailover } = require("./providerRouter");
const logger = require("../../utils/logger");

/**
 * sendEmail
 *
 * Sends a transactional email via the provider failover chain.
 * Provider order: ses → sendgrid → smtp (prod) | smtp → ethereal (staging) | ethereal (dev)
 * Configurable via EMAIL_PROVIDER_CHAIN env var.
 *
 * @param {object} opts
 * @param {string}   opts.to            - Recipient address
 * @param {string}   opts.subject       - Email subject line
 * @param {string}   opts.html          - Rendered HTML body
 * @param {string}   [opts.text]        - Plain-text fallback (auto-stripped from HTML if omitted)
 * @param {string}   [opts.replyTo]     - Reply-To address
 * @param {object[]} [opts.attachments] - Nodemailer attachment objects
 * @returns {Promise<object>} Nodemailer info + _previewUrl (dev only) + _provider + _providerChain
 */
async function sendEmail({ to, subject, html, text, replyTo, attachments = [] }) {
    const fromAddress = process.env.SMTP_FROM_ADDRESS || "noreply@platform.local";
    const fromName = process.env.SMTP_FROM_NAME || "DentalSaaS Platform";

    const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        html,
        text: text || _htmlToText(html),
        ...(replyTo ? { replyTo } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
    };

    const { info, provider, providerChain, previewUrl } = await sendWithFailover(mailOptions);

    // Attach provider metadata to info for callers (emailWorker records these in EmailEvent)
    info._provider = provider;
    info._providerChain = providerChain;
    if (previewUrl) info._previewUrl = previewUrl;

    logger.info(
        { messageId: info.messageId, to, subject, provider, providerChain },
        "[sendEmail] Email sent"
    );

    return info;
}

// ─── _htmlToText ──────────────────────────────────────────────────────────────
function _htmlToText(html) {
    if (!html) return "";
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// ─── closeTransporter (backward compat — no-op in v4) ────────────────────────
async function closeTransporter() {
    // providerRouter builds transporters on demand — no persistent singleton to close
    logger.debug("[sendEmail] closeTransporter — no-op in v4 (providerRouter manages lifecycle)");
}

module.exports = { sendEmail, closeTransporter };
