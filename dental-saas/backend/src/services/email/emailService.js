/**
 * emailService.js
 * Platform Email — Template-Driven Email Dispatch Service
 * v2.0 — Handlebars Template Engine Integration
 *
 * Centralises all transactional email sending for the platform.
 *
 * Flow:
 *   EmailService.send(type, payload) → renderTemplate(name, data) → sendEmail(html)
 *
 * Email types:
 *   MAGIC_LINK      → magicLink.hbs
 *   PASSWORD_RESET  → resetPassword.hbs
 *   EMAIL_OTP       → otp.hbs
 *   INVOICE         → invoice.hbs
 *   REFUND          → refund.hbs
 *   TICKET_REPLY    → ticketReply.hbs
 *   GRACE           → grace.hbs       (billing grace period)
 *   SUSPENSION      → suspension.hbs  (account suspended)
 *   RETRY_FAILED    → retryFailed.hbs (payment retry failed)
 *
 * Backward compatibility:
 *   All existing emailService exports are preserved.
 *   They now route through the new template engine.
 *
 * PLANE: Platform / Shared
 */

"use strict";

const { renderTemplate } = require("../../email/engine/renderTemplate");
const { sendEmail } = require("./sendEmail");
const logger = require("../../utils/logger");

// ─── Email type → template name map ──────────────────────────────────────────
const EMAIL_TYPE_MAP = Object.freeze({
    MAGIC_LINK: "magicLink",
    PASSWORD_RESET: "resetPassword",
    EMAIL_OTP: "otp",
    INVOICE: "invoice",
    REFUND: "refund",
    TICKET_REPLY: "ticketReply",
    GRACE: "grace",
    SUSPENSION: "suspension",
    RETRY_FAILED: "retryFailed",
});

// ─── Default subjects per type ────────────────────────────────────────────────
const DEFAULT_SUBJECTS = Object.freeze({
    MAGIC_LINK: "Your Magic Login Link",
    PASSWORD_RESET: "Password Reset Request",
    EMAIL_OTP: "Your Verification Code",
    INVOICE: "New Invoice Generated",
    REFUND: "Refund Confirmation",
    TICKET_REPLY: "Reply to Your Support Ticket",
    GRACE: "Action Required: Payment Overdue — Your Grace Period Has Started",
    SUSPENSION: "Account Suspended — Immediate Action Required",
    RETRY_FAILED: "Payment Failed — Action Required",
});

// ─── EmailService ─────────────────────────────────────────────────────────────
const EmailService = {
    /**
     * process
     * Primary entry point for the email worker.
     * Renders the correct template and dispatches the email.
     *
     * @param {string} type     - EMAIL_TYPE_MAP key (e.g. "MAGIC_LINK")
     * @param {object} payload  - Template data + { email, subject? }
     * @returns {Promise<void>}
     */
    async process(type, payload) {
        const templateName = EMAIL_TYPE_MAP[type];

        if (!templateName) {
            logger.error({ emailType: type }, "[EmailService] Unknown email type — no template mapping found");
            throw new Error(`[EmailService] Unknown email type: "${type}"`);
        }

        if (!payload.email) {
            logger.error({ emailType: type }, "[EmailService] Payload missing required field: email");
            throw new Error(`[EmailService] Missing required field "email" in payload for type "${type}"`);
        }

        const subject = payload.subject || DEFAULT_SUBJECTS[type] || type;

        let html;
        try {
            html = renderTemplate(templateName, { ...payload, subject });
        } catch (renderErr) {
            logger.error(
                { emailType: type, templateName, err: renderErr.message },
                "[EmailService] Template rendering failed"
            );
            throw renderErr;
        }

        let sendResult;
        try {
            sendResult = await sendEmail({
                to: payload.email,
                subject,
                html,
                attachments: payload.attachments || []
            });

            logger.info(
                { emailType: type, to: payload.email, subject, messageId: sendResult?.messageId },
                "[EmailService] Email dispatched"
            );
        } catch (sendErr) {
            logger.error(
                { emailType: type, to: payload.email, err: sendErr.message },
                "[EmailService] Email send failed"
            );
            throw sendErr;
        }

        return sendResult; // includes _previewUrl in dev mode

    },

    // ─── Convenience senders (type-safe wrappers) ─────────────────────────────

    async sendMagicLink({ email, name, link, ipAddress }) {
        return this.process("MAGIC_LINK", {
            email, name, link, ipAddress,
            requestedAt: new Date()
        });
    },

    async sendPasswordReset({ email, name, resetUrl }) {
        return this.process("PASSWORD_RESET", {
            email, name, resetUrl,
            requestedAt: new Date()
        });
    },

    async sendOtp({ email, name, otp }) {
        return this.process("EMAIL_OTP", {
            email, name, otp,
            issuedAt: new Date()
        });
    },

    /**
     * sendInvoiceEmail
     * Backward-compatible drop-in for the existing emailService.sendInvoiceEmail(invoice, org).
     * Now uses the Handlebars template instead of the inline JS template string.
     */
    async sendInvoiceEmail(invoice, org) {
        const recipientEmail = org.contactEmail || org.email;
        if (!recipientEmail) {
            logger.warn({ invoiceId: invoice._id }, "[EmailService] sendInvoiceEmail: no recipient email on org");
            return null;
        }

        return this.process("INVOICE", {
            email: recipientEmail,
            orgName: org.name,
            invoiceNumber: invoice.invoiceNumber,
            billingCycleStart: invoice.billingCycleStart,
            billingCycleEnd: invoice.billingCycleEnd,
            dueDate: invoice.dueDate,
            planVersionTag: invoice.planVersionTag || invoice.metadata?.plan || "Subscription",
            status: invoice.status,
            lineItems: invoice.lineItems || [],
            couponCode: invoice.couponCode,
            couponDiscountAmount: invoice.couponDiscountAmount,
            taxPercent: invoice.taxPercent,
            taxAmount: invoice.taxAmount,
            totalAmount: invoice.totalAmount,
            currency: invoice.currency || "USD",
            invoiceUrl: process.env.FRONTEND_URL
                ? `${process.env.FRONTEND_URL}/platform/billing/invoices/${invoice._id}`
                : null,
            attachments: invoice._pdfBuffer
                ? [{ filename: `Invoice_${invoice.invoiceNumber || invoice._id}.pdf`, content: invoice._pdfBuffer, contentType: "application/pdf" }]
                : [],
            subject: `Invoice ${invoice.invoiceNumber || invoice._id} — ${org.name}`
        });
    },

    async sendRefundEmail({ email, orgName, invoiceNumber, originalAmount, refundAmount, currency, isFullRefund, reasonCode, processedAt, providerRefundId }) {
        return this.process("REFUND", {
            email, orgName, invoiceNumber, originalAmount, refundAmount, currency,
            isFullRefund, reasonCode, processedAt: processedAt || new Date(), providerRefundId,
            supportEmail: process.env.SUPPORT_EMAIL
        });
    },

    async sendTicketReply({ email, recipientName, ticketId, ticketSubject, ticketStatus, agentName, replyBody, ticketUrl }) {
        return this.process("TICKET_REPLY", {
            email, recipientName, ticketId, ticketSubject, ticketStatus,
            agentName, replyBody, repliedAt: new Date(), ticketUrl
        });
    }
};

module.exports = { EmailService };
