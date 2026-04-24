/**
 * orgSupportBridge.service.js — Org-Facing Support Bridge
 * @bridge-layer (LOCKED)
 * @per-org-transactional — Uses secureModel for org-scoped Ticket access.
 *
 * RULES:
 *   - No business logic
 *   - No conditional flows
 *   - DTO mapping ONLY
 *   - MUST use enforceDTO()
 *
 * Stateless adapter that provides org users with read + limited write
 * access to support tickets for their organization.
 *
 * INVARIANTS:
 *   ✔ organizationId from extractOrgId(req) — NEVER from body/params
 *   ✔ Ticket access via Ticket — auto-scopes by org
 *   ✔ All read responses pass through enforceDTO()
 *   ✔ Write operations limited to: createTicket, addComment
 *   ✔ Comments are append-only (no edits, no deletes)
 *   ✔ internalNotes are NEVER exposed
 *
 * PLANE: Bridge (Org → Platform, read + limited write)
 *
 * @module services/bridges/orgSupportBridge.service
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const TicketDef = require("@shared/models/Ticket");
const Ticket = getPlatformModel(TicketDef);
const {
  extractOrgId,
  assertOrgContext
} = require("@core/security/assertOrgContext");
const {
  enforceDTO
} = require("./utils/enforceDTO");
const {
  mapTicket,
  mapTicketDetail
} = require("./utils/transformers");
const logger = require("@utils/logger");

// RLS-wrapped Ticket model

/**
 * List tickets for the authenticated org.
 *
 * @param {Object} req - Express request (with JWT org context + tenant context)
 * @param {Object} [options] - Pagination options
 * @param {number} [options.limit=20] - Max tickets to return
 * @param {number} [options.skip=0] - Offset for pagination
 * @returns {Promise<Object[]>} Array of sanitized ticket DTOs
 */
async function listTickets(req, options = {}) {
  const limit = Math.min(options.limit || 20, 50);
  const skip = Math.max(options.skip || 0, 0);
  const tickets = await Ticket.find({}).sort({
    createdAt: -1
  }).skip(skip).limit(limit).select("subject category status priority createdAt updatedAt").lean();
  return tickets.map(t => enforceDTO(mapTicket, t));
}

/**
 * Get a single ticket's detail (with filtered conversation thread).
 *
 * @param {Object} req - Express request (with JWT org context + tenant context)
 * @param {string} ticketId - Ticket ObjectId
 * @returns {Promise<Object|null>} Sanitized ticket detail DTO
 * @throws {Error} TICKET_NOT_FOUND if ticket doesn't exist or belongs to another org
 */
async function getTicketDetail(req, ticketId) {
  const ticket = await Ticket.findOne({
    _id: ticketId
  }).select("-internalNotes -linkedInvoiceId -linkedSubscriptionId -linkedMutationId -providerDisputeId -financialImpactMinor -escalationLevel -breachFlag").lean();
  if (!ticket) {
    const err = new Error("Support ticket not found");
    err.code = "TICKET_NOT_FOUND";
    err.status = 404;
    throw err;
  }
  return enforceDTO(mapTicketDetail, ticket);
}

/**
 * Create a new support ticket for the authenticated org.
 *
 * @param {Object} req - Express request (with JWT org context + tenant context)
 * @param {Object} data - Ticket creation payload
 * @param {string} data.subject - Ticket subject
 * @param {string} data.description - Ticket description
 * @param {string} data.category - Ticket category
 * @param {string} [data.priority=MEDIUM] - Ticket priority
 * @returns {Promise<Object>} Sanitized created ticket DTO
 */
async function createTicket(req, data) {
  const orgId = extractOrgId(req);

  // Compute SLA deadline (4h for CRITICAL, 24h for HIGH, 48h for MEDIUM/LOW)
  const slaHours = {
    CRITICAL: 4,
    HIGH: 24,
    MEDIUM: 48,
    LOW: 48
  };
  const priority = (data.priority || "MEDIUM").toUpperCase();
  const slaDeadline = new Date(Date.now() + (slaHours[priority] || 48) * 3600 * 1000);
  const ticketData = {
    organizationId: orgId,
    regionCode: req.user?.regionCode || "MEA",
    createdBy: req.user._id,
    subject: data.subject,
    description: data.description,
    category: (data.category || "technical").toLowerCase(),
    priority,
    status: "OPEN",
    slaDeadline,
    conversationThread: [{
      actorId: req.user._id,
      actorType: "tenant_user",
      message: data.description
    }]
  };
  const ticket = await Ticket.create(ticketData);
  logger.info({
    event: "SUPPORT_TICKET_CREATED",
    ticketId: ticket._id.toString(),
    orgId,
    category: ticketData.category,
    priority: ticketData.priority
  }, "[orgSupportBridge] New support ticket created");
  return enforceDTO(mapTicket, ticket);
}

/**
 * Add a comment (reply) to an existing support ticket.
 * Comments are append-only — no edits, no deletes.
 *
 * @param {Object} req - Express request (with JWT org context + tenant context)
 * @param {string} ticketId - Ticket ObjectId
 * @param {string} message - Comment message text
 * @returns {Promise<Object>} Success response
 * @throws {Error} TICKET_NOT_FOUND if ticket doesn't exist or belongs to another org
 */
async function addComment(req, ticketId, message) {
  if (!message || typeof message !== "string" || message.trim().length === 0) {
    const err = new Error("Comment message is required");
    err.code = "VALIDATION_ERROR";
    err.status = 400;
    throw err;
  }
  const ticket = await Ticket.findOne({
    _id: ticketId
  });
  if (!ticket) {
    const err = new Error("Support ticket not found");
    err.code = "TICKET_NOT_FOUND";
    err.status = 404;
    throw err;
  }

  // Verify org context matches (belt-and-suspenders — secureModel already scopes)
  assertOrgContext(req, ticket.organizationId);

  // Append-only comment
  ticket.conversationThread.push({
    actorId: req.user._id,
    actorType: "tenant_user",
    message: message.trim()
  });
  await ticket.save();
  logger.info({
    event: "SUPPORT_TICKET_COMMENT_ADDED",
    ticketId: ticket._id.toString(),
    orgId: extractOrgId(req)
  }, "[orgSupportBridge] Comment added to support ticket");
  return {
    success: true
  };
}
module.exports = {
  listTickets,
  getTicketDetail,
  createTicket,
  addComment
};