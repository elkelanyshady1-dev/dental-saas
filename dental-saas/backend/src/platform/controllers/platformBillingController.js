"use strict";

/**
 * platformBillingController.js
 * Sprint 6 — BillingInvoice removed; PlatformInvoice is sole billing model.
 *
 * All invoice queries now target the platforminvoices collection via PlatformInvoice.
 * Manual payment marking now extends OrgContract.effectiveTo instead of
 * org.subscription.currentPeriodEnd.
 */

const mongoose = require("mongoose");
const PlatformInvoice = require("../../platform/billing/models/PlatformInvoice.model").default;
const OrgContract = require("../../platform/billing/models/OrgContract.model").default;
const Organization = require("@shared/models/Organization").default;

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

        const invoices = await PlatformInvoice.find({ organizationId: org._id })
            .populate("createdBy", "name email")
            .populate("contractId", "planCode contractStatus")
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
        const invoice = await PlatformInvoice.findById(req.params.invoiceId)
            .populate("organizationId", "name slug")
            .populate("createdBy", "name email")
            .populate("contractId", "planCode contractStatus currency")
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

        let { status } = req.body;

        // Sprint 6: PlatformInvoice status enum alignment
        const LEGACY_MAP = { "pending": "open", "failed": "uncollectible" };
        if (LEGACY_MAP[status]) status = LEGACY_MAP[status];

        const VALID_STATUSES = ["draft", "open", "paid", "void", "uncollectible"];
        if (!VALID_STATUSES.includes(status)) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
                message: `Invalid invoice status. Allowed: ${VALID_STATUSES.join(", ")}`
            });
        }

        const invoice = await PlatformInvoice.findById(req.params.invoiceId).session(session);
        if (!invoice) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: "Invoice not found" });
        }

        const oldStatus = invoice.status;
        invoice.status = status;

        if (status === "paid" && oldStatus !== "paid") {
            invoice.paidAt = new Date();

            // Sprint 6: Extend OrgContract.effectiveTo instead of subscription.currentPeriodEnd
            if (invoice.contractId) {
                const contract = await OrgContract.findById(invoice.contractId).session(session);
                if (contract) {
                    const newEnd = contract.effectiveTo
                        ? new Date(contract.effectiveTo)
                        : new Date();
                    newEnd.setMonth(newEnd.getMonth() + 1);
                    await OrgContract.findByIdAndUpdate(
                        contract._id,
                        { $set: { effectiveTo: newEnd } },
                        { session }
                    );
                }
            }
        }

        await invoice.save({ session });

        const auditService = require("../../services/auditService");
        await auditService.createAuditRecord({
            organizationId: invoice.organizationId || "000000000000000000000000",
            branchId: "000000000000000000000000",
            userId: req.platformUser._id,
            actorId: req.platformUser._id,
            actorType: "platform_user",
            action: "INVOICE_STATUS_UPDATED",
            entity: "PLATFORM_INVOICE",
            entityId: invoice._id,
            details: { invoiceId: invoice._id, oldStatus, newStatus: status },
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
            statusCode: 200,
            success: true
        });
        await session.commitTransaction();
        session.endSession();

        res.json({ message: "Invoice status updated successfully", invoice });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        res.status(500).json({ message: err.message });
    }
};
