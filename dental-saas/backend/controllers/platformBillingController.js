const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Organization = require("../models/Organization");
const AuditLog = require("../models/AuditLog");
const EmailLog = require("../models/EmailLog");

// ─── Helper: resolve org + 404 guard ─────────────────────────────────────────
async function resolveOrg(id, res) {
    const org = await Organization.findById(id);
    if (!org) {
        res.status(404).json({ message: "Organization not found" });
        return null;
    }
    return org;
}

// ─── GET /platform/organizations/:id/invoices ───────────────────────────────
exports.getOrganizationInvoices = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        const invoices = await Invoice.find({ organizationId: org._id })
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 })
            .lean();

        res.json({ invoices });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/invoices/:invoiceId ──────────────────────────────────────
exports.getInvoiceDetails = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.invoiceId)
            .populate("organizationId", "name slug")
            .populate("createdBy", "name email")
            .lean();

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        res.json({ invoice });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// ─── PATCH /platform/invoices/:invoiceId/status ─────────────────────────────
exports.updateInvoiceStatus = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { status } = req.body;
        if (!["pending", "paid", "failed", "void"].includes(status)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: "Invalid invoice status." });
        }

        const invoice = await Invoice.findById(req.params.invoiceId).session(session);
        if (!invoice) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Invoice not found" });
        }

        const oldStatus = invoice.status;
        invoice.status = status;

        if (status === "paid" && oldStatus !== "paid") {
            invoice.paidAt = new Date();

            // Optionally, we might want to extend the subscription here if manually marked paid
            // But for safety and separation of concerns, manual payment flow usually assumes
            // admin might extend manually via /extend endpoint, or we do it here transactionally.
            // Let's extend it transactionally since it's a billing engine rule.
            const org = await Organization.findById(invoice.organizationId).session(session);
            if (org) {
                const newEnd = org.subscription.currentPeriodEnd ? new Date(org.subscription.currentPeriodEnd) : new Date();
                newEnd.setMonth(newEnd.getMonth() + 1);

                org.subscription.currentPeriodEnd = newEnd;
                org.subscription.graceEndsAt = null;
                org.subscription.status = "active";
                await org.save({ session });
            }
        }

        await invoice.save({ session });

        await AuditLog.create([{
            organizationId: invoice.organizationId,
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "INVOICE_STATUS_UPDATED",
            success: true,
            details: `Invoice ${invoice._id} status changed from ${oldStatus} to ${status}.`,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
        }], { session });

        await session.commitTransaction();
        session.endSession();

        res.json({ message: "Invoice status updated successfully", invoice });
    } catch (err) {
        await session.abortTransaction();
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: err.message });
    }
};

// ─── GET /platform/organizations/:id/email-logs ─────────────────────────────
exports.getEmailLogs = async (req, res) => {
    try {
        const org = await resolveOrg(req.params.id, res);
        if (!org) return;

        const emailLogs = await EmailLog.find({ organizationId: org._id })
            .sort({ createdAt: -1 })
            .lean();

        res.json({ emailLogs });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
