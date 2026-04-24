/**
 * smtp.provider.js
 * Platform Infrastructure — SMTP (nodemailer) Email Provider
 * v1.0 — canonical SMTP implementation
 *
 * This is INFRASTRUCTURE-ONLY. It does not:
 *   - render templates
 *   - decide subject lines
 *   - contain any business logic
 *
 * Callers upstream (EmailService) render the Handlebars template and
 * pass the finished { to, subject, html } here. The provider wraps
 * nodemailer with a pooled, cached transporter and nothing else.
 *
 * Required env:
 *   SMTP_HOST           (required)
 *   SMTP_PORT           (default 587)
 *   SMTP_SECURE         ("true" forces TLS; default auto — true when port=465)
 *   SMTP_USER, SMTP_PASS (optional — both or neither)
 *
 * Optional "from" defaults (used only when mailOptions.from is omitted):
 *   EMAIL_FROM          preferred — single string e.g. "OrthoNoe <noreply@orthonoe.com>"
 *   SMTP_FROM_ADDRESS   legacy fallback address
 *   SMTP_FROM_NAME      legacy fallback display name
 *
 * PLANE: Platform / Infrastructure
 */

"use strict";

const nodemailer = require("nodemailer");
const logger     = require("@utils/logger");

// ─── Lazy singleton transporter ───────────────────────────────────────────────
// Build-on-first-use so boot doesn't crash when SMTP env is absent in dev
// (Ethereal / console fallbacks live upstream in providerRouter).
let _transporter = null;
let _transporterKey = null;

function _configKey() {
    return [
        process.env.SMTP_HOST || "",
        process.env.SMTP_PORT || "",
        process.env.SMTP_SECURE || "",
        process.env.SMTP_USER || "",
        process.env.SMTP_PASS ? "**" : "",
    ].join("|");
}

/**
 * buildTransport
 * Returns a cached nodemailer transporter configured from env.
 * Env changes (hot-reload / test) invalidate the cache on next call.
 *
 * @returns {import("nodemailer").Transporter}
 */
function buildTransport() {
    const key = _configKey();
    if (_transporter && _transporterKey === key) return _transporter;

    const host = process.env.SMTP_HOST;
    if (!host) {
        throw new Error("[smtp.provider] SMTP_HOST is not set");
    }

    const port = Number.parseInt(process.env.SMTP_PORT || "587", 10);
    const secureEnv = (process.env.SMTP_SECURE || "").toLowerCase();
    const secure = secureEnv === "true" ? true
                 : secureEnv === "false" ? false
                 : port === 465;

    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    _transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user && pass ? { user, pass } : undefined,
        pool: true,
        maxConnections: 5,
        tls: { rejectUnauthorized: process.env.NODE_ENV === "production" },
    });
    _transporterKey = key;

    logger.info(
        { host, port, secure, auth: Boolean(user && pass) },
        "[smtp.provider] Transporter built"
    );

    return _transporter;
}

function _resolveFrom(explicitFrom) {
    if (explicitFrom) return explicitFrom;
    if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
    const addr = process.env.SMTP_FROM_ADDRESS;
    if (!addr) return "noreply@platform.local";
    const name = process.env.SMTP_FROM_NAME;
    return name ? `"${name}" <${addr}>` : addr;
}

/**
 * sendEmail
 * Low-level send — accepts pre-rendered mail options. No templates, no
 * subject defaults, no business logic.
 *
 * @param {Object}   opts
 * @param {string}   opts.to
 * @param {string}   opts.subject
 * @param {string}   opts.html
 * @param {string}   [opts.text]
 * @param {string}   [opts.from]
 * @param {string}   [opts.replyTo]
 * @param {object[]} [opts.attachments]
 * @returns {Promise<{ messageId: string, provider: "smtp", envelope?: object }>}
 */
async function sendEmail({ to, subject, html, text, from, replyTo, attachments } = {}) {
    if (!to)      throw new Error("[smtp.provider] 'to' is required");
    if (!subject) throw new Error("[smtp.provider] 'subject' is required");
    if (!html && !text) throw new Error("[smtp.provider] 'html' or 'text' is required");

    const transporter = buildTransport();

    const info = await transporter.sendMail({
        from: _resolveFrom(from),
        to,
        subject,
        ...(html ? { html } : {}),
        ...(text ? { text } : {}),
        ...(replyTo ? { replyTo } : {}),
        ...(attachments && attachments.length ? { attachments } : {}),
    });

    return {
        messageId: info.messageId,
        provider: "smtp",
        envelope: info.envelope,
    };
}

/**
 * closeTransport — test/shutdown helper. No-op if nothing built yet.
 */
async function closeTransport() {
    if (_transporter && typeof _transporter.close === "function") {
        _transporter.close();
    }
    _transporter = null;
    _transporterKey = null;
}

module.exports = { buildTransport, sendEmail, closeTransport };
