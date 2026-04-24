/**
 * providers/email/index.js
 * Platform Infrastructure — Email Provider Router
 * v1.0
 *
 * Selects the email provider implementation by EMAIL_PROVIDER env and
 * delegates the send. Mirrors the shape of providers/sms/*.provider.js.
 *
 * This router is for CALLERS that want a single-provider, no-failover
 * direct send (e.g. future worker paths, diagnostics, one-off tools).
 *
 * The existing failover chain lives in services/email/providerRouter.js
 * and walks SES → SendGrid → SMTP → Ethereal. That router now delegates
 * its SMTP implementation to ./smtp.provider.js — so there is a single
 * source of truth for SMTP config either way.
 *
 * Env:
 *   EMAIL_PROVIDER=smtp   (default "smtp"; extend to ses|sendgrid later)
 *
 * Interface:
 *   sendEmail({ to, subject, html, text?, from?, replyTo?, attachments? })
 *     → { messageId, provider }
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const smtp = require("./smtp.provider");

const PROVIDER_REGISTRY = Object.freeze({
    smtp,
    // Future: ses: require("./ses.provider"),
    //         sendgrid: require("./sendgrid.provider"),
});

function _resolveProvider() {
    const name = (process.env.EMAIL_PROVIDER || "smtp").toLowerCase();
    const provider = PROVIDER_REGISTRY[name];
    if (!provider) {
        const available = Object.keys(PROVIDER_REGISTRY).join("|");
        throw new Error(
            `[providers/email] Unknown EMAIL_PROVIDER="${name}". Available: ${available}`
        );
    }
    return { name, provider };
}

/**
 * sendEmail
 * Delegates to the configured provider. Does not render templates, does
 * not pick subject lines. Payload must be fully resolved.
 *
 * @param {Object} payload - see smtp.provider.sendEmail for shape
 * @returns {Promise<{ messageId: string, provider: string }>}
 */
async function sendEmail(payload) {
    const { name, provider } = _resolveProvider();
    const result = await provider.sendEmail(payload);
    return { ...result, provider: result.provider || name };
}

module.exports = { sendEmail, PROVIDER_REGISTRY };
