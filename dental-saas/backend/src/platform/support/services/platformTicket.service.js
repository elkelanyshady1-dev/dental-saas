/**
 * ticket.service.js
 * v13.0 Geopolitical Sovereignty — Regional Support Engine
 */
"use strict";

const { getRegionContext } = require("@infra/regionRouter");
const { ticketSchema } = require("@shared/models/Ticket");
const { auditLogSchema } = require("@shared/models/AuditLog");
const { auditLogSchema: auditSchemaForForensics } = require("@shared/models/AuditLog"); // Alias for clarity
const { subscriptionMutationRecordSchema } = require("../../billing/models/SubscriptionMutationRecord.model");
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");

const ALLOWED_TRANSITIONS = {
    "OPEN": ["IN_REVIEW", "CLOSED", "ESCALATED"],
    "IN_REVIEW": ["WAITING_CUSTOMER", "RESOLVED", "CLOSED", "ESCALATED"],
    "WAITING_CUSTOMER": ["IN_REVIEW", "RESOLVED", "CLOSED"],
    "ESCALATED": ["IN_REVIEW", "RESOLVED", "CLOSED"],
    "RESOLVED": ["CLOSED", "IN_REVIEW", "ESCALATED"],
    "CLOSED": [],
    "REJECTED": []
};

/**
 * calculateSlaDeadline
 */
function calculateSlaDeadline(priority) {
    const hours = { "CRITICAL": 4, "HIGH": 12, "MEDIUM": 24, "LOW": 48 }[priority] || 24;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

/**
 * transitionStatus
 */
async function transitionStatus(regionCode, ticketId, newStatus, actorId, actorType, details = {}, session = null) {
    if (!regionCode) throw new Error("Region context missing.");
    const { mongooseConnection } = await getRegionContext(regionCode);
    const RegionalTicket = mongooseConnection.model("Ticket", ticketSchema);

    const ticket = await RegionalTicket.findById(ticketId).session(session);
    if (!ticket) throw new Error("Ticket not found.");

    const currentStatus = ticket.status;

    // 1. Validate Transition
    if (currentStatus !== newStatus) {
        const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
        if (!allowed.includes(newStatus)) {
            throw new Error(`Illegal transition from ${currentStatus} to ${newStatus}`);
        }

        // 🛡️ v11.0 Hardening — Re-open Guard
        if (currentStatus === "RESOLVED" && newStatus === "IN_PROGRESS") {
            if (!details.reopen) {
                throw new Error("Explicit re-open flag required to return from RESOLVED to IN_PROGRESS.");
            }
            if (!details.reason) {
                throw new Error("Re-open reason is mandatory.");
            }
        }
    }

    // 2. Perform Update
    ticket.status = newStatus;
    await ticket.save({ session });

    // 3. Audit Log
    logger.info({ ticketId: ticket._id, regionCode, actorId, from: currentStatus, to: newStatus }, "Ticket status transition recorded");
    await auditService.createAuditRecord({
        regionCode,
        organizationId: ticket.organizationId,
        branchId: "000000000000000000000000",
        actorId,
        actorType,
        action: "TICKET_STATUS_CHANGED",
        entity: "TICKET",
        entityId: ticket._id,
        details: { from: currentStatus, to: newStatus, ...details },
        success: true
    }, session);

    return ticket;
}

/**
 * updatePriority
 * v11.0 Rule: Recalculate SLA on priority change
 */
async function updatePriority(regionCode, ticketId, newPriority, actorId, actorType, session = null) {
    if (!regionCode) throw new Error("Region context missing.");
    const { mongooseConnection } = await getRegionContext(regionCode);
    const RegionalTicket = mongooseConnection.model("Ticket", ticketSchema);

    const ticket = await RegionalTicket.findById(ticketId).session(session);
    if (!ticket) throw new Error("Ticket not found.");

    const oldPriority = ticket.priority;
    if (oldPriority === newPriority) return ticket;

    ticket.priority = newPriority;
    ticket.slaDeadline = calculateSlaDeadline(newPriority);
    await ticket.save({ session });

    await auditService.createAuditRecord({
        regionCode,
        organizationId: ticket.organizationId,
        branchId: "000000000000000000000000",
        actorId,
        actorType,
        action: "TICKET_PRIORITY_CHANGED",
        entity: "TICKET",
        entityId: ticket._id,
        details: { from: oldPriority, to: newPriority, newDeadline: ticket.slaDeadline },
        success: true
    }, session);

    return ticket;
}

/**
 * validateRefundRequest
 */
async function validateRefundRequest(regionCode, ticketId, amountMinor) {
    if (!regionCode) throw new Error("Region context missing.");
    const { mongooseConnection } = await getRegionContext(regionCode);
    const RegionalTicket = mongooseConnection.model("Ticket", ticketSchema);

    // Note: Population across connections is tricky. 
    // Usually BillingInvoice would be on the same regional connection.
    const ticket = await RegionalTicket.findById(ticketId); // We might need to manually populate if another connection
    if (!ticket) throw new Error("Ticket not found");

    if (ticket.category !== "billing" && ticket.category !== "dispute") {
        throw new Error("Refunds only valid for billing or dispute categories");
    }
    if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
        throw new Error("Cannot refund a resolved or closed ticket");
    }

    return ticket;
}

/**
 * escalateTicket
 */
async function escalateTicket(regionCode, ticketId, reason, actorId, actorType, session = null) {
    if (!regionCode) throw new Error("Region context missing.");
    const { mongooseConnection } = await getRegionContext(regionCode);
    const RegionalTicket = mongooseConnection.model("Ticket", ticketSchema);

    const ticket = await RegionalTicket.findById(ticketId).session(session);
    if (!ticket) throw new Error("Ticket not found");

    const oldLevel = ticket.escalationLevel;
    const newLevel = Math.min(oldLevel + 1, 5); // Max L5 (Executive)

    if (oldLevel === newLevel) return ticket;

    ticket.escalationLevel = newLevel;
    ticket.status = "ESCALATED";
    await ticket.save({ session });

    await auditService.createAuditRecord({
        regionCode,
        organizationId: ticket.organizationId,
        branchId: "000000000000000000000000",
        actorId,
        actorType,
        action: "TICKET_ESCALATED",
        entity: "TICKET",
        entityId: ticket._id,
        details: { from: oldLevel, to: newLevel, reason },
        success: true
    }, session);

    return ticket;
}

/**
 * getForensicContext
 */
async function getForensicContext(regionCode, ticketId) {
    if (!regionCode) throw new Error("Region context missing.");
    const { mongooseConnection } = await getRegionContext(regionCode);

    const RegionalTicket = mongooseConnection.model("Ticket", ticketSchema);
    const RegionalAuditLog = mongooseConnection.model("AuditLog", auditLogSchema);
    const RegionalMutation = mongooseConnection.model("SubscriptionMutationRecord", subscriptionMutationRecordSchema);

    const ticket = await RegionalTicket.findById(ticketId);
    if (!ticket) throw new Error("Ticket not found");

    // Organizations are globally shared in Control Plane, but we use the default connection for them
    const Organization = require("@shared/models/Organization").default;

    // StripeEvent and RefreshToken might be regionally isolated or legacy. 
    // Assuming they are on regional connection for v13 scalability.
    // If not, we fall back to default.
    const stripeEventSchema = require("@shared/models/StripeEvent").stripeEventSchema || null;

    const [org, mutations, audits] = await Promise.all([
        Organization.findById(ticket.organizationId).select("subscription regionCode"),
        RegionalMutation.find({ organizationId: ticket.organizationId }).sort({ createdAt: -1 }).limit(10),
        RegionalAuditLog.find({ organizationId: ticket.organizationId }).sort({ createdAt: -1 }).limit(10)
    ]);

    return {
        subscription: org?.subscription || null,
        regionCode: org?.regionCode,
        mutations,
        audits
    };
}

module.exports = {
    transitionStatus,
    updatePriority,
    calculateSlaDeadline,
    validateRefundRequest,
    escalateTicket,
    getForensicContext
};
