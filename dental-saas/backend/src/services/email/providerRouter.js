/**
 * providerRouter.js
 * Platform Email — Provider Failover Chain
 * v1.0
 *
 * Implements a cascading provider chain for email delivery.
 * If the primary provider fails, the next provider in the chain is tried.
 *
 * Chain order (by environment):
 *   development:          ethereal (only)
 *   staging:              smtp → ethereal
 *   production:           ses → sendgrid → smtp
 *
 * Chain is configurable via EMAIL_PROVIDER_CHAIN env var:
 *   EMAIL_PROVIDER_CHAIN=ses,sendgrid,smtp
 *
 * Each provider failure is logged and recorded in the provider chain trace.
 *
 * PLANE: Platform / Infrastructure
 */
"use strict";

const nodemailer = require("nodemailer");
const logger = require("../../utils/logger");
const smtpProvider = require("../../infrastructure/communication/providers/email/smtp.provider");

const ENV = process.env.NODE_ENV || "development";
const IS_DEV = ENV === "development";
const IS_PROD = ENV === "production";

// ─── Provider implementations ─────────────────────────────────────────────────

/**
 * Ethereal provider — development only, auto-creates account
 */
async function _buildEtherealTransport() {
    const account = await nodemailer.createTestAccount();
    return {
        name: "ethereal",
        transporter: nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: { user: account.user, pass: account.pass },
        }),
        _etherealUser: account.user,
    };
}

/**
 * AWS SES SDK provider
 */
async function _buildSesTransport() {
    if (!process.env.AWS_SES_REGION) throw new Error("[ProviderRouter] AWS_SES_REGION not set");
    const { SESv2Client } = require("@aws-sdk/client-sesv2");
    const sesTransport = require("nodemailer-ses-transport");
    const sesClient = new SESv2Client({ region: process.env.AWS_SES_REGION });
    return {
        name: "ses",
        transporter: nodemailer.createTransport(sesTransport({ ses: sesClient })),
    };
}

/**
 * SendGrid SMTP provider
 */
async function _buildSendgridTransport() {
    if (!process.env.SENDGRID_API_KEY) throw new Error("[ProviderRouter] SENDGRID_API_KEY not set");
    return {
        name: "sendgrid",
        transporter: nodemailer.createTransport({
            host: "smtp.sendgrid.net",
            port: 587,
            auth: {
                user: "apikey",
                pass: process.env.SENDGRID_API_KEY,
            },
        }),
    };
}

/**
 * Generic SMTP provider (Mailtrap / Office365 / SES SMTP / any).
 *
 * Delegates to the canonical infrastructure-layer SMTP provider so there
 * is a single source of truth for SMTP configuration. The failover chain
 * still treats this as one step in its walk; only the nodemailer setup
 * has moved.
 */
async function _buildSmtpTransport() {
    return {
        name: "smtp",
        transporter: smtpProvider.buildTransport(),
    };
}

// ─── Provider registry ────────────────────────────────────────────────────────
const _PROVIDERS = {
    ethereal: _buildEtherealTransport,
    ses: _buildSesTransport,
    sendgrid: _buildSendgridTransport,
    smtp: _buildSmtpTransport,
};

/**
 * Resolve the provider chain for the current environment.
 *
 * Priority:
 *   1. EMAIL_PROVIDER_CHAIN env var (comma-separated list)
 *   2. Environment defaults
 */
function _resolveChain() {
    if (process.env.EMAIL_PROVIDER_CHAIN) {
        return process.env.EMAIL_PROVIDER_CHAIN.split(",").map(p => p.trim().toLowerCase());
    }
    if (IS_DEV) return ["ethereal"];
    if (IS_PROD) return ["ses", "sendgrid", "smtp"];
    return ["smtp", "ethereal"]; // staging
}

// ─── sendWithFailover ─────────────────────────────────────────────────────────
/**
 * Attempts to send a mail through each provider in the chain.
 * Returns on first success; throws if all providers fail.
 *
 * @param {object} mailOptions  — Nodemailer mail options (to, from, subject, html, text)
 * @returns {Promise<{ info: object, provider: string, providerChain: string[], previewUrl?: string }>}
 */
async function sendWithFailover(mailOptions) {
    const chain = _resolveChain();
    const attempted = [];
    const errors = [];

    logger.debug({ chain }, "[ProviderRouter] Starting email send with failover chain");

    for (const providerName of chain) {
        const buildFn = _PROVIDERS[providerName];
        if (!buildFn) {
            logger.warn({ providerName }, "[ProviderRouter] Unknown provider — skipping");
            continue;
        }

        try {
            const { name, transporter, _etherealUser } = await buildFn();
            attempted.push(name);

            const info = await transporter.sendMail(mailOptions);

            logger.info(
                { provider: name, messageId: info.messageId, to: mailOptions.to, attemptCount: attempted.length },
                "[ProviderRouter] Email sent successfully"
            );

            // Dev: extract Ethereal preview URL
            let previewUrl = null;
            if (IS_DEV) {
                previewUrl = nodemailer.getTestMessageUrl(info) || null;
                if (previewUrl) {
                    info._previewUrl = previewUrl;
                    console.log(`\n┌${"─".repeat(68)}┐`);
                    console.log(`│  📭 ETHEREAL PREVIEW — Open this URL to see the email:          │`);
                    console.log(`│  ${previewUrl.padEnd(65)} │`);
                    console.log(`└${"─".repeat(68)}┘\n`);
                }
            }

            // Log failover path if we didn't use the first provider
            if (attempted.length > 1) {
                logger.warn(
                    { chain, attempted, usedProvider: name },
                    "[ProviderRouter] Primary provider(s) failed — delivery succeeded via failover"
                );
            }

            return {
                info,
                provider: name,
                providerChain: attempted,
                previewUrl,
            };

        } catch (err) {
            errors.push({ provider: providerName, error: err.message });
            logger.warn(
                { provider: providerName, err: err.message, nextInChain: chain[chain.indexOf(providerName) + 1] || "none" },
                "[ProviderRouter] Provider failed — trying next in chain"
            );
        }
    }

    // All providers exhausted
    const errorSummary = errors.map(e => `${e.provider}: ${e.error}`).join(" | ");
    logger.error(
        { chain, errors, to: mailOptions.to },
        "[ProviderRouter] All providers exhausted — email delivery failed"
    );
    throw new Error(`[ProviderRouter] All email providers failed. Attempts: ${errorSummary}`);
}

module.exports = { sendWithFailover, _resolveChain };
