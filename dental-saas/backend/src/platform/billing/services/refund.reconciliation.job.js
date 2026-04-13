/**
 * refund.reconciliation.job.js
 * v13.0 Geopolitical Sovereignty — Regional Reconciliation
 */
"use strict";

// v31.1 — Region list from in-memory registry (no DB query)
const { getActiveRegionCodes } = require("@infra/regions/regionRegistry");
const { getRegionContext } = require("@infra/regionRouter");
const { getProvider } = require("../providers/paymentProviderFactory");
const { refundExecutionRecordSchema } = require("@shared/models/RefundExecutionRecord");
const { invoiceSchema } = require("@shared/models/BillingInvoice");
const { ticketSchema } = require("@shared/models/Ticket");
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");
const mongoose = require("mongoose");

/**
 * scanAndReconcileRefunds
 * Iterates through active regions to sync local refund state with Stripe.
 */
async function scanAndReconcileRefunds() {
    const { v4: uuidv4 } = require("uuid");
    const correlationId = `job-reconciliation-${uuidv4()}`;

    try {
        // v31.1 — O(1) registry lookup replaces Region.find({ status: "ACTIVE" })
        const activeRegionCodes = getActiveRegionCodes();
        for (const regionCode of activeRegionCodes) {
            try {
                await processRegionRefundReconciliation(regionCode, correlationId);
            } catch (err) {
                logger.error({ regionCode, err: err.message }, "Refund reconciliation failed for region");
            }
        }
    } catch (err) {
        logger.error({ err }, "Failed to fetch active regions for Refund Reconciliation");
    }
}

async function processRegionRefundReconciliation(regionCode, correlationId) {
    const { mongooseConnection } = await getRegionContext(regionCode);
    // Default to stripe for existing records; future records will carry provider field
    const provider = getProvider("stripe");
    const { metrics } = require("@infra/metrics/metrics");

    const RegionalRefundRecord = mongooseConnection.model("RefundExecutionRecord", refundExecutionRecordSchema);
    const RegionalInvoice = mongooseConnection.model("Invoice", invoiceSchema);
    const RegionalTicket = mongooseConnection.model("Ticket", ticketSchema);

    const threshold = new Date(Date.now() - 15 * 60 * 1000);

    const pendingRecords = await RegionalRefundRecord.find({
        regionCode,
        status: "PENDING",
        createdAt: { $lt: threshold }
    }).sort({ createdAt: 1 });

    for (const record of pendingRecords) {
        try {
            const refunds = await provider.listRefunds(record.providerChargeId || record.stripeChargeId);
            const amountToMatch = record.amountMinor;
            const matchedRefund = refunds.find(r => r.amount === amountToMatch && r.status !== "failed");

            if (matchedRefund) {
                const session = await mongooseConnection.startSession();
                try {
                    await session.withTransaction(async (sess) => {
                        const invoice = await RegionalInvoice.findById(record.invoiceId).session(sess);
                        const ticket = await RegionalTicket.findById(record.ticketId).session(sess);

                        if (invoice && invoice.refundedAmountMinor < amountToMatch) {
                            await RegionalInvoice.updateOne(
                                { _id: invoice._id },
                                {
                                    $inc: { refundedAmountMinor: amountToMatch, version: 1 },
                                    $set: { isRefunded: (invoice.refundedAmountMinor + amountToMatch) >= invoice.finalAmount }
                                },
                                { session: sess }
                            );
                        }

                        if (ticket && ticket.status !== "RESOLVED") {
                            ticket.status = "RESOLVED";
                            ticket.refundAmountApprovedMinor = amountToMatch;
                            ticket.providerRefundId = matchedRefund.id;
                            await ticket.save({ session: sess });
                        }

                        record.status = "COMPLETED";
                        record.providerRefundId = matchedRefund.id;
                        await record.save({ session: sess });

                        await auditService.createAuditRecord({
                            regionCode,
                            organizationId: ticket ? ticket.organizationId : record.organizationId,
                            actorId: "000000000000000000000000",
                            actorType: "system",
                            action: "REFUND_RECONCILED_FIX",
                            entity: "BILLING_INVOICE",
                            entityId: record.invoiceId,
                            details: { recordId: record._id, stripeRefundId: matchedRefund.id, correlationId }
                        }, sess);
                    });
                    metrics.refundReconciliationTotal.inc({ outcome: "repaired", regionCode });
                } finally {
                    session.endSession();
                }
            } else {
                record.status = "FAILED";
                await record.save();
                metrics.refundReconciliationTotal.inc({ outcome: "failed", regionCode });
            }
        } catch (err) {
            logger.error({ err, recordId: record._id, regionCode }, "Failed to reconcile regional record");
        }
    }
}

module.exports = { scanAndReconcileRefunds };
