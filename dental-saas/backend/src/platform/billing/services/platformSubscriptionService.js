/**
 * platformSubscriptionService.js
 * v13.0 Geopolitical Sovereignty — Hardened Multi-Region Management
 */
"use strict";

const mongoose = require("mongoose");
const Organization = require("@shared/models/Organization").default;
const { getRegionContext } = require("@infra/regionRouter");
const { getProviderForOrg } = require("../providers/paymentProviderFactory");
const { subscriptionMutationRecordSchema } = require("../models/SubscriptionMutationRecord.model");
const { revenueSnapshotProjectionSchema } = require("../models/RevenueSnapshotProjection.model");
const { domainEventOutboxSchema } = require("@shared/models/DomainEventOutbox");
const { ticketSchema } = require("@shared/models/Ticket");
// Sprint 6: BillingInvoice removed — tombstone proxy exports { invoiceSchema } pointing to PlatformInvoice.schema
const { invoiceSchema } = require("@shared/models/BillingInvoice");
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");
const distributedLock = require("../../../utils/DistributedLock");
const { metrics } = require("@infra/metrics/metrics");

/**
 * waitForMutation
 * v11.3 Scalability — Eliminates busy-wait polling using Redis Pub/Sub.
 */
async function waitForMutation(idempotencyKey, timeoutMs = 15000) {
    const channel = `mutation:${idempotencyKey}`;

    // 1. Subscribe and wait for notification
    const result = await distributedLock.subscribeWithTimeout(channel, timeoutMs);

    // This simplified version assumes we are on the correct regional connection for checking the mutation
    // However, since it's a fallback, we need to know the region. 
    // For now, it's called from within methods that know the region.
    return result;
}

/**
 * Distributed Mutation Mutex (Polling implementation)
 */
async function acquireOrgLockDistributed(orgId) {
    const lockKey = `org_lock:${orgId}`;
    const start = Date.now();
    while (true) {
        const token = await distributedLock.acquire(lockKey, 15000);
        if (token) return token;
        if (Date.now() - start > 45000) throw new Error("ORG_LOCK_TIMEOUT");
        await new Promise(resolve => setTimeout(resolve, 100));
    }
}

/**
 * cancelSubscription
 * Hardened with Regional Connection and Transactional Outbox
 */
exports.cancelSubscription = async ({ orgId, mode, actor, req }) => {
    const idempotencyKey = `sub-cancel-${orgId}-${mode}`;
    const lockKey = `mutation:${idempotencyKey}`;
    const orgLockKey = `org_lock:${orgId}`;

    const lockToken = await distributedLock.acquire(lockKey, 30000);

    if (lockToken) {
        try {
            // 2. Load Org and Validate (Control Plane read)
            const org = await Organization.findById(orgId);
            if (!org) throw new Error("Organization not found");
            if (!org.regionCode) throw new Error("Organization region context missing.");

            const regionCode = org.regionCode;

            // Resolve Region Context
            const { mongooseConnection } = await getRegionContext(regionCode);
            const provider = getProviderForOrg(org);
            const RegionalMutation = mongooseConnection.model("SubscriptionMutationRecord", subscriptionMutationRecordSchema);
            const RegionalRevenue = mongooseConnection.model("RevenueSnapshotProjection", revenueSnapshotProjectionSchema);
            const RegionalOutbox = mongooseConnection.model("DomainEventOutbox", domainEventOutboxSchema);

            // Check established state in regional ledger
            let mutation = await RegionalMutation.findOne({ idempotencyKey });
            if (mutation && mutation.status === "COMPLETED") return { success: true, idempotent: true };

            if (!mutation) {
                mutation = await RegionalMutation.create({
                    organizationId: orgId,
                    regionCode,
                    type: "CANCEL",
                    idempotencyKey,
                    actorId: actor._id,
                    correlationId: req.correlationId || "manual-cancel",
                    status: "PENDING"
                });
            }

            if (!org.subscription.providerSubscriptionId) throw new Error("No active subscription found");

            // 3. External Call (via provider abstraction)
            const cancelAtPeriodEnd = mode === "period_end";
            const providerResult = await provider.cancelSubscription(
                org.subscription.providerSubscriptionId,
                { cancelAtPeriodEnd, idempotencyKey }
            );

            // 4. Local Transactional State Change
            const orgLockToken = await acquireOrgLockDistributed(orgId);
            const session = await mongooseConnection.startSession();

            try {
                const transactionLogic = async (sess) => {
                    await Organization.updateOne(
                        { _id: orgId },
                        {
                            $set: {
                                "subscription.status": cancelAtPeriodEnd ? "active" : "canceled",
                                "subscription.autoRenew": !cancelAtPeriodEnd
                            }
                        },
                        { session: sess }
                    );

                    await RegionalRevenue.findOneAndUpdate(
                        { organizationId: orgId, regionCode },
                        { $set: { snapshotDate: new Date() } },
                        { upsert: true, session: sess }
                    );

                    await auditService.createAuditRecord({
                        regionCode,
                        organizationId: orgId,
                        branchId: "000000000000000000000000",
                        actorId: actor._id,
                        actorType: "platform_user",
                        action: "PLATFORM_SUBSCRIPTION_CANCEL",
                        entity: "Organization",
                        entityId: orgId,
                        details: { mode, providerSubscriptionId: providerResult.id },
                        signatureVersion: 1
                    }, sess);

                    await RegionalOutbox.create([{
                        regionCode,
                        aggregateType: "Subscription",
                        aggregateId: orgId,
                        eventType: "SUBSCRIPTION_CANCELLED",
                        payload: { orgId, actorId: actor._id, mode, providerSubscriptionId: providerResult.id },
                        correlationId: req.correlationId || "manual-cancel",
                        status: "PENDING"
                    }], { session: sess });

                    mutation.status = "COMPLETED";
                    mutation.providerReferenceId = providerResult.id;
                    mutation.completedAt = new Date();
                    await mutation.save({ session: sess });
                };

                await session.withTransaction(transactionLogic);

                await distributedLock.publish(`mutation:${idempotencyKey}`, JSON.stringify({
                    status: "COMPLETED",
                    idempotencyKey
                }));
                metrics.mutationPubSubNotificationsTotal?.inc({ status: "COMPLETED", regionCode });

                return { success: true, providerResult };
            } catch (error) {
                throw error;
            } finally {
                session.endSession();
                if (orgLockToken) await distributedLock.release(orgLockKey, orgLockToken);
            }
        } catch (error) {
            logger.error({ error: { message: error.message, stack: error.stack }, orgId, idempotencyKey }, "cancelSubscription mutation failed");
            throw error;
        } finally {
            await distributedLock.release(lockKey, lockToken);
        }
    } else {
        return await waitForMutation(idempotencyKey);
    }
};

/**
 * adjustCredits
 * Hardened with Regional Connection and Transactional Outbox
 */
exports.adjustCredits = async ({ orgId, amountMinor, actor, req }) => {
    if (amountMinor <= 0) throw new Error("Amount must be positive");

    const idempotencyKey = `sub-credit-${orgId}-${Date.now()}`; // Simplified PK for example
    const lockKey = `mutation:${idempotencyKey}`;
    const orgLockKey = `org_lock:${orgId}`;

    const lockToken = await distributedLock.acquire(lockKey, 30000);
    if (lockToken) {
        try {
            const org = await Organization.findById(orgId);
            if (!org) throw new Error("Organization not found");
            if (!org.regionCode) throw new Error("Organization region context missing.");

            const regionCode = org.regionCode;
            const { mongooseConnection } = await getRegionContext(regionCode);
            const provider = getProviderForOrg(org);
            const RegionalMutation = mongooseConnection.model("SubscriptionMutationRecord", subscriptionMutationRecordSchema);
            const RegionalRevenue = mongooseConnection.model("RevenueSnapshotProjection", revenueSnapshotProjectionSchema);
            const RegionalOutbox = mongooseConnection.model("DomainEventOutbox", domainEventOutboxSchema);

            const mutation = await RegionalMutation.create({
                organizationId: orgId,
                regionCode,
                type: "CREDIT_ADJUST",
                amountMinor,
                idempotencyKey,
                actorId: actor._id,
                correlationId: req.correlationId || "manual-credit",
                status: "PENDING"
            });

            if (!org.subscription.providerCustomerId) throw new Error("Organization has no billing customer ID");

            const providerResult = await provider.applyCustomerCredit(
                org.subscription.providerCustomerId,
                amountMinor,
                // Sprint 4: billingCurrency removed from subscription subdoc — use org.billingCurrency
                (org.billingCurrency || "usd").toLowerCase(),
                idempotencyKey
            );

            const orgLockToken = await acquireOrgLockDistributed(orgId);
            const session = await mongooseConnection.startSession();

            try {
                const transactionLogic = async (sess) => {
                    const updatedOrg = await Organization.findOneAndUpdate(
                        { _id: orgId },
                        // Sprint 4: subscription.creditBalance removed — credit now lives on OrgContract
                        // Write credit update to OrgContract only (backfill job ensures org has a contract)
                        {},
                        { returnDocument: 'after', session: sess }
                    );
                    // Update OrgContract.creditBalance
                    const OrgContract = require("../../billing/models/OrgContract.model").default;
                    await OrgContract.findOneAndUpdate(
                        { organizationId: orgId, contractStatus: "active" },
                        { $inc: { creditBalance: amountMinor } },
                        { sort: { createdAt: -1 }, session: sess }
                    );

                    await RegionalRevenue.findOneAndUpdate(
                        { organizationId: orgId, regionCode },
                        {
                            $inc: { refundTotalMinor: amountMinor },
                            $set: { snapshotDate: new Date() }
                        },
                        { upsert: true, session: sess }
                    );

                    await auditService.createAuditRecord({
                        regionCode,
                        organizationId: orgId,
                        branchId: "000000000000000000000000",
                        actorId: actor._id,
                        actorType: "platform_user",
                        action: "PLATFORM_SUBSCRIPTION_CREDIT_ADJUST",
                        entity: "Organization",
                        entityId: orgId,
                        details: { amountMinor, providerTransactionId: providerResult.id },
                        signatureVersion: 1
                    }, sess);

                    await RegionalOutbox.create([{
                        regionCode,
                        aggregateType: "Subscription",
                        aggregateId: orgId,
                        eventType: "SUBSCRIPTION_CREDIT_ADJUSTED",
                        payload: { orgId, actorId: actor._id, amountMinor, providerTransactionId: providerResult.id },
                        correlationId: req.correlationId || "manual-credit",
                        status: "PENDING"
                    }], { session: sess });

                    mutation.status = "COMPLETED";
                    mutation.providerReferenceId = providerResult.id;
                    mutation.completedAt = new Date();
                    await mutation.save({ session: sess });

                    // Sprint 4: creditBalance now lives on OrgContract, not org.subscription
                    const activeContract = await require("../../billing/models/OrgContract.model")
                        .findOne({ organizationId: orgId, contractStatus: "active" })
                        .select("creditBalance")
                        .session(sess)
                        .lean();
                    return activeContract?.creditBalance || 0;
                };

                let finalBalance;
                await session.withTransaction(async (s) => {
                    finalBalance = await transactionLogic(s);
                });

                await distributedLock.publish(`mutation:${idempotencyKey}`, JSON.stringify({
                    status: "COMPLETED",
                    idempotencyKey
                }));
                metrics.mutationPubSubNotificationsTotal?.inc({ status: "COMPLETED", regionCode });

                return { success: true, creditBalance: finalBalance };
            } finally {
                session.endSession();
                if (orgLockToken) await distributedLock.release(orgLockKey, orgLockToken);
            }
        } finally {
            await distributedLock.release(lockKey, lockToken);
        }
    } else {
        return await waitForMutation(idempotencyKey);
    }
};

/**
 * executeRefund
 * v13.0 Hardening — Regional Refund Orchestration
 */
exports.executeRefund = async ({ orgId, ticketId, amountMinor, actor, req }) => {
    const idempotencyKey = `sub-refund-${ticketId}-${amountMinor}`;
    const lockKey = `mutation:${idempotencyKey}`;
    const orgLockKey = `org_lock:${orgId}`;

    const lockToken = await distributedLock.acquire(lockKey, 30000);
    if (lockToken) {
        try {
            const org = await Organization.findById(orgId);
            if (!org) throw new Error("Organization not found");
            if (!org.regionCode) throw new Error("Organization region context missing.");

            const regionCode = org.regionCode;
            const { mongooseConnection } = await getRegionContext(regionCode);
            const provider = getProviderForOrg(org);

            const RegionalMutation = mongooseConnection.model("SubscriptionMutationRecord", subscriptionMutationRecordSchema);
            const RegionalRevenue = mongooseConnection.model("RevenueSnapshotProjection", revenueSnapshotProjectionSchema);
            const RegionalOutbox = mongooseConnection.model("DomainEventOutbox", domainEventOutboxSchema);
            const RegionalTicket = mongooseConnection.model("Ticket", ticketSchema);
            const RegionalInvoice = mongooseConnection.model("Invoice", invoiceSchema);

            let mutation = await RegionalMutation.findOne({ idempotencyKey });
            if (mutation && mutation.status === "COMPLETED") return { success: true, idempotent: true };

            if (!mutation) {
                mutation = await RegionalMutation.create({
                    organizationId: orgId,
                    regionCode,
                    type: "REFUND",
                    amountMinor,
                    idempotencyKey,
                    actorId: actor._id,
                    correlationId: req.correlationId || `refund-${ticketId}`,
                    status: "PENDING"
                });
            }

            const ticket = await RegionalTicket.findById(ticketId);
            if (!ticket) throw new Error("Ticket not found");
            if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") throw new Error("Ticket resolved or closed");

            const invoice = await RegionalInvoice.findById(ticket.linkedInvoiceId);
            if (!invoice || !invoice.paymentReference) throw new Error("No qualifying Payment Intent found");

            const providerResult = await provider.refundPayment(
                invoice.paymentReference,
                amountMinor,
                idempotencyKey
            );

            const orgLockToken = await acquireOrgLockDistributed(orgId);
            const session = await mongooseConnection.startSession();

            try {
                const transactionLogic = async (sess) => {
                    await RegionalTicket.updateOne(
                        { _id: ticketId },
                        {
                            $set: {
                                status: "RESOLVED",
                                linkedMutationId: mutation._id,
                                resolvedAt: new Date()
                            },
                            $inc: { financialImpactMinor: amountMinor }
                        },
                        { session: sess }
                    );

                    await RegionalRevenue.findOneAndUpdate(
                        { organizationId: orgId, regionCode },
                        {
                            $inc: { refundTotalMinor: amountMinor },
                            $set: { snapshotDate: new Date() }
                        },
                        { upsert: true, session: sess }
                    );

                    await auditService.createAuditRecord({
                        regionCode,
                        organizationId: orgId,
                        branchId: "000000000000000000000000",
                        actorId: actor._id,
                        actorType: "platform_user",
                        action: "PLATFORM_SUBSCRIPTION_REFUND",
                        entity: "Ticket",
                        entityId: ticketId,
                        details: { amountMinor, providerRefundId: providerResult.id, mutationId: mutation._id },
                        signatureVersion: 1
                    }, sess);

                    await RegionalOutbox.create([{
                        regionCode,
                        aggregateType: "Ticket",
                        aggregateId: ticketId,
                        eventType: "TICKET_REFUND_EXECUTED",
                        payload: { orgId, ticketId, amountMinor, providerRefundId: providerResult.id },
                        correlationId: req.correlationId || `refund-${ticketId}`,
                        status: "PENDING"
                    }], { session: sess });

                    mutation.status = "COMPLETED";
                    mutation.providerReferenceId = providerResult.id;
                    mutation.completedAt = new Date();
                    await mutation.save({ session: sess });
                };

                await session.withTransaction(transactionLogic);

                await distributedLock.publish(`mutation:${idempotencyKey}`, JSON.stringify({
                    status: "COMPLETED",
                    idempotencyKey
                }));
                metrics.mutationPubSubNotificationsTotal?.inc({ status: "COMPLETED", regionCode });

                return { success: true, providerResult };
            } finally {
                session.endSession();
                if (orgLockToken) await distributedLock.release(orgLockKey, orgLockToken);
            }
        } catch (error) {
            logger.error({ error: { message: error.message }, ticketId, idempotencyKey }, "executeRefund failed");
            throw error;
        } finally {
            await distributedLock.release(lockKey, lockToken);
        }
    } else {
        return await waitForMutation(idempotencyKey);
    }
};
