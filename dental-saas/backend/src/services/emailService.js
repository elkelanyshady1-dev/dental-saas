const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const logger = require("../utils/logger");

// Per-org DB resolution for owner email lookup
const dbManager = require("@core/db/dbManager");
const getModel = require("@core/db/getModel");
const UserDef = require("../shared/models/User");

const invoiceTemplate = require("../templates/invoiceTemplate");
const graceTemplate = require("../templates/graceTemplate");
const retryTemplate = require("../templates/retryTemplate");
const suspensionTemplate = require("../templates/suspensionTemplate");

// Setup simple SMTP transporter (Mocking actual provider for dev)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.mailtrap.io",
    port: process.env.SMTP_PORT || 2525,
    auth: {
        user: process.env.SMTP_USER || "user",
        pass: process.env.SMTP_PASS || "pass",
    },
});

/**
 * Helper to fetch recipient email safely
 * Uses per-org DB to resolve the owner's email when organizationId is available.
 */
async function getRecipientEmail(org) {
    if (org.contactEmail) return org.contactEmail;
    if (org.ownerId && org.ownerId.email) return org.ownerId.email;

    // Fallback if ownerId is just an ObjectId — resolve from per-org DB
    // @rls-platform-service — cross-org email delivery, no org-scoped req
    if (org._id && org.ownerId) {
        try {
            const orgConn = dbManager.getConnection(String(org._id));
            const User = getModel(orgConn, UserDef);
            const owner = await User.findById(org.ownerId).lean();
            return owner ? owner.email : "admin@example.com";
        } catch {
            // Connection might fail for inactive org — fall back gracefully
            return "admin@example.com";
        }
    }

    return "admin@example.com";
}

/**
 * Handle platform users (who don't have an organization context)
 */
async function sendPlatformEmail({ user, subject, html }) {
    try {
        const recipient = user.email;
        await transporter.sendMail({
            from: '"SaaS Platform" <noreply@example.com>',
            to: recipient,
            subject,
            html,
        });
        logger.info({ service: "EmailService", action: "platform_email_sent", recipient, subject }, "Platform email sent");
    } catch (err) {
        logger.error({ err, service: "EmailService", action: "platform_email_failed", recipient: user.email }, "Failed to send platform email");
    }
}

/**
 * Creates a simple PDF buffer for the invoice
 */
async function generateInvoicePDF(invoice, org) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            let buffers = [];

            doc.on("data", buffers.push.bind(buffers));
            doc.on("end", () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            const meta = invoice.metadata || {};

            doc.fontSize(20).text("INVOICE", { align: "center" }).moveDown();

            doc.fontSize(12).text(`Organization: ${org.name}`);
            doc.text(`Invoice ID: ${invoice._id}`);
            doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString()}`);
            doc.text(`Due Date: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}`);
            doc.moveDown();

            doc.text(`Plan: ${meta.plan ? meta.plan.toUpperCase() : 'SUBSCRIPTION'}`);
            doc.text(`Base Price: $${invoice.basePlanAmount}`);
            if (meta.inflationApplied) {
                doc.text(`Inflation Applied: +$${meta.inflationApplied}`);
            }
            if (invoice.couponDiscountAmount) {
                doc.text(`Coupon Discount: -$${invoice.couponDiscountAmount}`);
            }
            doc.moveDown();

            doc.fontSize(14).font('Helvetica-Bold').text(`Total Amount: $${invoice.totalAmount} ${invoice.currency || "USD"}`);
            doc.moveDown();
            doc.fontSize(12).font('Helvetica').text(`Status: ${invoice.status.toUpperCase()}`);

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Generic internal sender to handle Logging and Error catching
 */
async function sendEmailSafely({ org, invoiceId, type, cycleId, subject, html, attachments = [] }) {
    try {
        const recipient = await getRecipientEmail(org);

        try {
            await transporter.sendMail({
                from: '"SaaS Platform" <billing@example.com>',
                to: recipient,
                subject,
                html,
                attachments
            });
            return true;

        } catch (err) {
            logger.error({ err, service: "EmailService", action: "send_failed", recipient, type }, "Failed to send email");
            // We intentionally do NOT throw here so the calling transaction doesn't fail
            return null;
        }

    } catch (err) {
        logger.error({ err, service: "EmailService", action: "unhandled_preparation_error", orgId: org._id, type }, "Unhandled error preparing email");
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED SERVICE METHODS
// ─────────────────────────────────────────────────────────────────────────────

exports.sendInvoiceEmail = async (invoice, org) => {
    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice, org);

    // We use the invoice ID as cycle identifier since invoices are unique
    return sendEmailSafely({
        org,
        invoiceId: invoice._id,
        type: "INVOICE_CREATED",
        cycleId: invoice._id.toString(),
        subject: `New Invoice Generated - ${org.name}`,
        html: invoiceTemplate(invoice),
        attachments: [
            {
                filename: `Invoice_${invoice._id}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }
        ]
    });
};

exports.sendGraceEmail = async (org, contract = null) => {
    // Sprint 6: cycleId from OrgContract.effectiveTo instead of subscription.currentPeriodEnd
    const cycleId = contract?.effectiveTo
        ? new Date(contract.effectiveTo).toISOString()
        : org._id.toString();

    return sendEmailSafely({
        org,
        invoiceId: null,
        type: "GRACE_STARTED",
        cycleId,
        subject: `Action Required: Subscription Overdue - ${org.name}`,
        html: graceTemplate(org, contract?.effectiveTo || null),
    });
};


exports.sendRetryFailedEmail = async (org, invoice) => {
    const isExhausted = invoice.retryCount >= invoice.maxRetries;
    const type = isExhausted ? "RETRY_EXHAUSTED" : "RETRY_FAILED";

    // Cycle ID includes retry count so we don't spam the exact same retry email twice if it retries again,
    // actually, for retry failed, maybe we DO want to send one *per failure attempt*.
    // Using invoiceId + retryCount gives us 1 email max per distinct failed attempt.
    const cycleId = `${invoice._id}_retry_${invoice.retryCount}`;

    return sendEmailSafely({
        org,
        invoiceId: invoice._id,
        type,
        cycleId,
        subject: `Payment Failed - Invoice ${invoice._id}`,
        html: retryTemplate(org, invoice, isExhausted),
    });
};

exports.sendSuspensionEmail = async (org, contract = null) => {
    // Sprint 6: cycleId from OrgContract.effectiveTo instead of subscription.currentPeriodEnd
    const cycleId = contract?.effectiveTo
        ? new Date(contract.effectiveTo).toISOString()
        : org._id.toString();

    return sendEmailSafely({
        org,
        invoiceId: null,
        type: "SUBSCRIPTION_SUSPENDED",
        cycleId,
        subject: `Account Suspended - ${org.name}`,
        html: suspensionTemplate(org),
    });
};


exports.sendTemporaryPasswordEmail = async (user, tempPassword) => {
    const subject = "Temporary Password for Your Account";
    const html = `
        <h1>Temporary Password Issued</h1>
        <p>A temporary password has been generated for your account: <strong>${tempPassword}</strong></p>
        <p>You will be required to change this password upon your next login.</p>
    `;

    if (user.organizationId) {
        const Organization = require("../shared/models/Organization").default;
        // @rls-platform-service — cross-org email delivery, no org-scoped req
        const org = await Organization.findById(user.organizationId).lean();
        return sendEmailSafely({
            org: org || { _id: user.organizationId, contactEmail: user.email },
            type: "TEMP_PASSWORD",
            subject,
            html
        });
    } else {
        return sendPlatformEmail({ user, subject, html });
    }
};

exports.sendResetLinkEmail = async (user, token) => {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const subject = "Password Reset Request";
    const html = `
        <h1>Password Reset</h1>
        <p>You requested a password reset. Click the link below to set a new password:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>This link will expire in 1 hour.</p>
    `;

    if (user.organizationId) {
        const Organization = require("../shared/models/Organization").default;
        // @rls-platform-service — cross-org email delivery, no org-scoped req
        const org = await Organization.findById(user.organizationId).lean();
        return sendEmailSafely({
            org: org || { _id: user.organizationId, contactEmail: user.email },
            type: "PASSWORD_RESET",
            subject,
            html
        });
    } else {
        return sendPlatformEmail({ user, subject, html });
    }
};
