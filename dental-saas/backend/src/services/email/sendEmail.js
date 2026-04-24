/**
 * sendEmail.js
 * Platform Email — Multi-Provider SMTP Dispatcher
 * v5.0 — html-to-text integration + OrthoNoe rebrand
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
const { convert: htmlToText } = require("html-to-text");
const logger = require("../../utils/logger");

// ── html-to-text options (email-optimized) ────────────────────────────────────
const HTML_TO_TEXT_OPTS = {
    wordwrap: 80,
    selectors: [
        { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
        { selector: "img", format: "skip" },
        { selector: "table.data", format: "dataTable" },
    ],
};

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
 * @param {string}   [opts.text]        - Plain-text fallback (auto-generated from HTML if omitted)
 * @param {string}   [opts.replyTo]     - Reply-To address
 * @param {object[]} [opts.attachments] - Nodemailer attachment objects
 * @returns {Promise<object>} Nodemailer info + _previewUrl (dev only) + _provider + _providerChain
 */
async function sendEmail({ to, subject, html, text, replyTo, attachments = [] }) {
    const fromAddress = process.env.SMTP_FROM_ADDRESS || "noreply@platform.local";
    const fromName = process.env.SMTP_FROM_NAME || "OrthoNoe";

    const mailOptions = {
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        html,
        text: text || htmlToText(html || "", HTML_TO_TEXT_OPTS),
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

// ─── closeTransporter (backward compat — no-op in v4) ────────────────────────
async function closeTransporter() {
    // providerRouter builds transporters on demand — no persistent singleton to close
    logger.debug("[sendEmail] closeTransporter — no-op in v4 (providerRouter manages lifecycle)");
}

module.exports = { sendEmail, closeTransporter };
