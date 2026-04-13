/**
 * refund.service.js
 * v9.1 Support Engine — Hardened Refund Logic
 */

"use strict";

const mongoose = require("mongoose");
const { getRegionContext } = require("@infra/regionRouter");
const { getProvider } = require("../../billing/providers/paymentProviderFactory");
const { auditLogSchema } = require("@shared/models/AuditLog");
const { ticketSchema } = require("@shared/models/Ticket");
const Organization = require("@shared/models/Organization").default;
const { invoiceSchema } = require("@shared/models/BillingInvoice");
const { refundExecutionRecordSchema } = require("@shared/models/RefundExecutionRecord");
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");

class RefundService {
    /**
     * approveRefund
     * v11.0 Hardening — Atomic transaction + Idempotency Record
     */
    async approveRefund(regionCode, ticketId, actorId, ipAddress, correlationId = null) {
        if (!regionCode) throw new Error("Geopolitical Sovereignty Violation: Region context missing in Refund Flow.");

        const { mongooseConnection } = await getRegionContext(regionCode);
        // Resolve provider from the organization's subscription.paymentProvider field
        const org = await Organization.findOne({ _id: (await mongooseConnection.model("Ticket", ticketSchema).findById(ticketId))?.organizationId });
        const provider = getProvider(org?.subscription?.paymentProvider || "stripe");
        const session = await mongooseConnection.startSession();
        const { metrics } = require("@infra/metrics/metrics");

        const RegionalTicket = mongooseConnection.model("Ticket", ticketSchema);
        const RegionalInvoice = mongooseConnection.model("Invoice", invoiceSchema);
        const RegionalRefundRecord = mongooseConnection.model("RefundExecutionRecord", refundExecutionRecordSchema);

        metrics.activeRefundTransactions.inc({ regionCode });

        try {
            // 1. Initial Validations
            const ticket = await RegionalTicket.findById(ticketId);
            if (!ticket || ticket.category !== "REFUND_REQUEST") {
                metrics.refundExecutionTotal.inc({ status: "failed", regionCode });
                throw new Error("Invalid refund ticket.");
            }
            if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
                return { success: true, message: "Ticket already finalized." };
            }

            const invoice = await RegionalInvoice.findById(ticket.linkedInvoiceId);
            if (!invoice) {
                metrics.refundExecutionTotal.inc({ status: "failed", regionCode });
                throw new Error("Linked invoice not found.");
            }

            const amountToRefund = ticket.refundAmountRequestedMinor;
            const idempotencyKey = `refund-${invoice._id}-${amountToRefund}`;

            // 2. Fetch/Create Record (Anchor)
            let record = await RegionalRefundRecord.findOne({
                invoiceId: invoice._id,
                amountMinor: amountToRefund
            });

            if (record && record.status === "COMPLETED") {
                return { success: true, stripeRefundId: record.stripeRefundId, resumed: true };
            }

            if (!record) {
                record = await RegionalRefundRecord.create({
                    regionCode,
                    invoiceId: invoice._id,
                    ticketId: ticket._id,
                    amountMinor: amountToRefund,
                    status: "PENDING",
                    providerChargeId: invoice.paymentReference,
                    correlationId
                });
            } else {
                record.attemptCount += 1;
                record.lastAttemptAt = new Date();
                await record.save();
            }

            // 3. Trigger Provider Refund (EXTERNAL)
            const providerRefund = await provider.refundPayment(
                invoice.paymentReference,
                amountToRefund,
                idempotencyKey
            );

            if (!providerRefund || providerRefund.status === "failed") {
                record.status = "FAILED";
                await record.save();
                metrics.refundExecutionTotal.inc({ status: "failed", regionCode });
                throw new Error("Stripe refund rejected.");
            }

            // 4. Transactional Internal Update
            session.startTransaction();

            const updatedInvoice = await RegionalInvoice.findOneAndUpdate(
                { _id: invoice._id, version: invoice.version },
                {
                    $inc: { refundedAmountMinor: amountToRefund, version: 1 },
                    $set: { isRefunded: (invoice.refundedAmountMinor + amountToRefund) >= invoice.finalAmount }
                },
                { session, new: true }
            );

            if (!updatedInvoice) {
                metrics.mongoTransactionAbortTotal.inc({ regionCode });
                throw new Error("OAV Conflict: Invoice modified by another process.");
            }

            // Update Ticket
            ticket.status = "RESOLVED";
            ticket.refundAmountApprovedMinor = amountToRefund;
            ticket.providerRefundId = providerRefund.id;
            await ticket.save({ session });

            // Finalize Record
            record.status = "COMPLETED";
            record.providerRefundId = providerRefund.id;
            await record.save({ session });

            // Append Audit (Chained)
            await auditService.createAuditRecord({
                regionCode,
                organizationId: ticket.organizationId,
                branchId: "000000000000000000000000",
                actorId: actorId,
                actorType: "platform_user",
                action: "REFUND_COMPLETED",
                entity: "BILLING_INVOICE",
                entityId: invoice._id,
                success: true,
                details: {
                    ticketId,
                    recordId: record._id,
                    providerRefundId: providerRefund.id,
                    idempotencyKey,
                    correlationId
                },
                ipAddress
            }, session);

            await session.commitTransaction();
            metrics.refundExecutionTotal.inc({ status: "completed", regionCode });
            return { success: true, providerRefundId: providerRefund.id };

        } catch (err) {
            if (session.inAtomicity()) {
                metrics.mongoTransactionAbortTotal.inc();
                await session.abortTransaction();
            }
            logger.error({
                err,
                ticketId,
                actorId,
                correlationId,
                action: "REFUND_FAILED"
            }, "[RefundService] Refund execution failed");
            throw err;
        } finally {
            metrics.activeRefundTransactions.dec();
            session.endSession();
        }
    }
}

module.exports = new RefundService();
