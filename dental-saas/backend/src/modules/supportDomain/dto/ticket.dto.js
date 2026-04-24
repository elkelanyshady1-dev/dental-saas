/**
 * ticket.dto.js — Ticket DTO builders (Plan A2 + E9 anti-drift base builder)
 *
 * One base builder (`buildBaseTicketDTO`) produces the common shape; plane-
 * specific builders extend it. Unit tests enforce:
 *   - Object.keys(orgDTO) ⊆ Object.keys(platformDTO)
 *   - !('internalNotes' in orgDTO)
 *   - !('ticketHistory' in orgDTO)
 *
 * Backend is authoritative. Frontends MUST NOT recompute these fields.
 */

"use strict";

const TICKET_DTO_VERSION = "1.0.0";
function toId(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v._id) return String(v._id);
  return String(v);
}
function iso(v) {
  return v ? new Date(v).toISOString() : null;
}

/**
 * Base DTO — fields safe for ANY authenticated caller with read permission.
 * No internal notes, no forensic PII, no financial internals.
 */
function buildBaseTicketDTO(ticket) {
  if (!ticket) return null;
  return {
    id: toId(ticket._id),
    regionCode: ticket.regionCode,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    subject: ticket.subject,
    description: ticket.description,
    slaDeadline: iso(ticket.slaDeadline),
    breachFlag: Boolean(ticket.breachFlag),
    escalationLevel: ticket.escalationLevel || 1,
    threadMessageCount: ticket.threadMessageCount || ticket.conversationThread?.length || 0,
    isArchived: Boolean(ticket.isArchived),
    version: ticket.version || 0,
    createdBy: toId(ticket.createdBy),
    createdAt: iso(ticket.createdAt),
    updatedAt: iso(ticket.updatedAt),
    resolvedAt: iso(ticket.resolvedAt)
  };
}

/**
 * Maps a single conversation message — strips raw _id, keeps string id only.
 */
function mapMessage(m) {
  return {
    id: toId(m._id),
    actorId: toId(m.actorId),
    actorType: m.actorType,
    message: m.message,
    createdAt: iso(m.createdAt)
  };
}

/**
 * Org plane DTO — NEVER includes internal notes, forensic fields, or
 * platform user identities. Used by org bridge.
 */
function buildOrgTicketDTO(ticket) {
  const base = buildBaseTicketDTO(ticket);
  if (!base) return null;
  return {
    ...base,
    linkedInvoiceId: toId(ticket.linkedInvoiceId),
    refundAmountRequestedMinor: ticket.refundAmountRequestedMinor || 0,
    // Conversation thread is filtered: omit messages flagged as internal (if any)
    conversationThread: (ticket.conversationThread || []).map(mapMessage)
  };
  // explicitly NO: internalNotes, ticketHistory, assignedToPlatformUserId,
  // providerDisputeId, providerRefundId, financialImpactMinor, slaProcessedAt
}

/**
 * Org list DTO — summary only; used for list endpoints to keep payloads small.
 */
function buildOrgTicketListItemDTO(ticket) {
  const base = buildBaseTicketDTO(ticket);
  if (!base) return null;
  return {
    id: base.id,
    category: base.category,
    priority: base.priority,
    status: base.status,
    subject: base.subject,
    slaDeadline: base.slaDeadline,
    breachFlag: base.breachFlag,
    threadMessageCount: base.threadMessageCount,
    isArchived: base.isArchived,
    version: base.version,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt
  };
}

/**
 * Platform plane DTO — includes forensic envelope for support staff.
 * `opts.role` controls optional masking for sub-roles (e.g. "support_readonly").
 */
function buildPlatformTicketDTO(ticket, opts = {}) {
  const base = buildBaseTicketDTO(ticket);
  if (!base) return null;
  const role = opts.role || "platform_support";
  const dto = {
    ...base,
    // Linkage
    linkedInvoiceId: toId(ticket.linkedInvoiceId),
    linkedSubscriptionId: ticket.linkedSubscriptionId || null,
    linkedMutationId: toId(ticket.linkedMutationId),
    providerDisputeId: ticket.providerDisputeId || null,
    providerRefundId: ticket.providerRefundId || null,
    // Refund envelope
    refundAmountRequestedMinor: ticket.refundAmountRequestedMinor || 0,
    refundAmountApprovedMinor: ticket.refundAmountApprovedMinor || 0,
    financialImpactMinor: ticket.financialImpactMinor || 0,
    // Assignment
    assignedTo: toId(ticket.assignedTo),
    assignedToPlatformUserId: toId(ticket.assignedToPlatformUserId),
    // SLA
    slaProcessedAt: iso(ticket.slaProcessedAt),
    // Thread + notes (platform sees internal notes)
    conversationThread: (ticket.conversationThread || []).map(mapMessage),
    internalNotes: (ticket.internalNotes || []).map(n => ({
      id: toId(n._id),
      actorId: toId(n.actorId),
      note: n.note,
      createdAt: iso(n.createdAt)
    })),
    // Dispute trail (platform only)
    ticketHistory: (ticket.ticketHistory || []).map(h => ({
      action: h.action,
      actorId: toId(h.actorId),
      actorPlane: h.actorPlane,
      actorType: h.actorType,
      timestamp: iso(h.timestamp),
      diff: h.diff,
      ip: h.ip
    }))
  };

  // Role-based masking: readonly roles don't see financial minors
  if (role === "platform_support_readonly") {
    dto.refundAmountRequestedMinor = null;
    dto.refundAmountApprovedMinor = null;
    dto.financialImpactMinor = null;
    dto.providerRefundId = null;
  }
  return dto;
}

/**
 * Platform list DTO — summary for dashboards; keeps forensic bits out.
 */
function buildPlatformTicketListItemDTO(ticket) {
  const base = buildBaseTicketDTO(ticket);
  if (!base) return null;
  return {
    id: base.id,
    regionCode: base.regionCode,
    category: base.category,
    priority: base.priority,
    status: base.status,
    subject: base.subject,
    slaDeadline: base.slaDeadline,
    breachFlag: base.breachFlag,
    escalationLevel: base.escalationLevel,
    assignedToPlatformUserId: toId(ticket.assignedToPlatformUserId),
    threadMessageCount: base.threadMessageCount,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    version: base.version
  };
}

/**
 * Envelope helper — wraps data with version metadata for FE contract gate.
 */
function envelope(data) {
  return {
    success: true,
    version: TICKET_DTO_VERSION,
    data
  };
}
module.exports = {
  TICKET_DTO_VERSION,
  buildBaseTicketDTO,
  buildOrgTicketDTO,
  buildOrgTicketListItemDTO,
  buildPlatformTicketDTO,
  buildPlatformTicketListItemDTO,
  envelope
};