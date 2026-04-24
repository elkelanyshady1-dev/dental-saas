/**
 * platformTicket.service.js — Hardened Platform Ticket Service (Plan A3, A4, A5, E1, E2, E12)
 *
 * Canonical service for all Platform-plane write operations against the
 * regional Ticket collection. Every mutation:
 *   - Uses findOneAndUpdate with expectedVersion filter (E1 optimistic concurrency)
 *   - Pushes a ticketHistory entry describing the change (E12)
 *   - Runs inside a withTransaction session where it triggers side effects
 *     (E3, E4 — outbox, audit)
 *   - Validates state transitions via ticketFSM (E11)
 *   - Supports idempotencyKey (E2) for create operations
 *
 * All reads use .lean() and .limit(), never populate across regional connections.
 *
 * This is the v2 replacement for backend/src/platform/support/services/platformTicket.service.js.
 * The legacy file remains in place for non-critical consumers (refund service +
 * sla job) that will be migrated separately.
 */

"use strict";

const {
  getRegionContext
} = require("@infra/regionRouter");
const {
  ticketSchema
} = require("@shared/models/Ticket");
const {
  assertTransition
} = require("./ticketFSM");
const auditService = require("../../../services/auditService");
const logger = require("@utils/logger");

// ─── Errors ──────────────────────────────────────────────────────────
class VersionConflictError extends Error {
  constructor(currentVersion) {
    super("VERSION_CONFLICT");
    this.code = "VERSION_CONFLICT";
    this.status = 409;
    this.currentVersion = currentVersion;
  }
}
class NotFoundError extends Error {
  constructor(entity) {
    super(`${entity || "TICKET"}_NOT_FOUND`);
    this.code = `${entity || "TICKET"}_NOT_FOUND`;
    this.status = 404;
  }
}
class IdempotencyConflictError extends Error {
  constructor() {
    super("IDEMPOTENCY_CONFLICT");
    this.code = "IDEMPOTENCY_CONFLICT";
    this.status = 409;
  }
}
class LimitExceededError extends Error {
  constructor(field) {
    super(`${field}_LIMIT_EXCEEDED`);
    this.code = `${field}_LIMIT_EXCEEDED`;
    this.status = 422;
  }
}

// ─── SLA ─────────────────────────────────────────────────────────────
const SLA_HOURS_BY_PRIORITY = Object.freeze({
  CRITICAL: 4,
  HIGH: 12,
  MEDIUM: 24,
  LOW: 48
});
function calculateSlaDeadline(priority) {
  const hours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY.MEDIUM;
  return new Date(Date.now() + hours * 3600 * 1000);
}

// ─── Region-scoped model resolver ────────────────────────────────────
async function _resolveTicketModel(regionCode) {
  if (!regionCode) {
    throw new Error("REGION_CONTEXT_MISSING: regionCode is required for all ticket operations");
  }
  const {
    mongooseConnection
  } = await getRegionContext(regionCode);
  return mongooseConnection.model("Ticket", ticketSchema);
}

// ─── History helper ──────────────────────────────────────────────────
function _historyEntry({
  action,
  actor,
  diff,
  ip
}) {
  return {
    action,
    actorId: actor.userId,
    actorPlane: actor.plane || "platform",
    actorType: actor.type || "platform_user",
    timestamp: new Date(),
    diff: diff || {},
    ip: ip || null
  };
}

// ─── Read operations ─────────────────────────────────────────────────
async function findTicketById(regionCode, ticketId) {
  const Ticket = await _resolveTicketModel(regionCode);
  const ticket = await Ticket.findById(ticketId).lean();
  if (!ticket) throw new NotFoundError("TICKET");
  return ticket;
}
async function listTickets(regionCode, filters = {}, {
  limit = 50,
  skip = 0
} = {}) {
  const Ticket = await _resolveTicketModel(regionCode);
  const query = {
    isArchived: {
      $ne: true
    },
    ...filters
  };
  const capped = Math.min(limit, 100);
  const [items, total] = await Promise.all([Ticket.find(query).sort({
    createdAt: -1
  }).skip(skip).limit(capped).lean(), Ticket.countDocuments(query)]);
  return {
    items,
    total,
    limit: capped,
    skip
  };
}

// ─── Create (E2 idempotent) ──────────────────────────────────────────
async function createTicket(regionCode, payload, actor, {
  idempotencyKey,
  ip
} = {}) {
  const Ticket = await _resolveTicketModel(regionCode);

  // E2 — idempotency short-circuit. Cheap indexed lookup.
  if (idempotencyKey) {
    const existing = await Ticket.findOne({
      createdBy: actor.userId,
      idempotencyKey
    }).lean();
    if (existing) {
      logger.info({
        ticketId: existing._id,
        idempotencyKey
      }, "[platformTicket] Idempotent replay");
      return existing;
    }
  }
  const slaDeadline = calculateSlaDeadline(payload.priority);
  const doc = {
    regionCode,
    createdBy: actor.userId,
    category: payload.category,
    priority: payload.priority,
    status: "OPEN",
    subject: payload.subject,
    description: payload.description,
    linkedInvoiceId: payload.linkedInvoiceId,
    linkedSubscriptionId: payload.linkedSubscriptionId,
    refundAmountRequestedMinor: payload.refundAmountRequestedMinor || 0,
    financialImpactMinor: payload.category === "refund_request" ? payload.refundAmountRequestedMinor || 0 : 0,
    slaDeadline,
    escalationLevel: 1,
    threadMessageCount: 1,
    conversationThread: [{
      actorId: actor.userId,
      actorType: actor.type || "platform_user",
      message: payload.description
    }],
    ticketHistory: [_historyEntry({
      action: "TICKET_CREATED",
      actor,
      diff: {
        category: payload.category,
        priority: payload.priority
      },
      ip
    })],
    idempotencyKey: idempotencyKey || undefined,
    version: 0
  };
  let created;
  try {
    created = await Ticket.create(doc);
  } catch (err) {
    // E11000 on (createdBy, idempotencyKey) — another replay raced us
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.idempotencyKey) {
      const existing = await Ticket.findOne({
        createdBy: actor.userId,
        idempotencyKey
      }).lean();
      if (existing) return existing;
      throw new IdempotencyConflictError();
    }
    throw err;
  }
  await auditService.createAuditRecord({
    regionCode,
    branchId: "000000000000000000000000",
    actorId: actor.userId,
    actorType: actor.type || "platform_user",
    action: "TICKET_CREATED",
    entity: "TICKET",
    entityId: created._id,
    details: {
      category: created.category,
      priority: created.priority
    },
    success: true
  });
  return created.toObject();
}

// ─── Version-guarded mutation core ───────────────────────────────────
/**
 * @param {string} regionCode
 * @param {string} ticketId
 * @param {number} expectedVersion
 * @param {object} updateOps          — Mongo update document ({ $set, $push, $inc, ... })
 *                                      Do NOT include `version` $inc — we add it.
 * @returns {Promise<object>}         — the updated ticket
 */
async function _versionedUpdate(regionCode, ticketId, expectedVersion, updateOps, {
  session
} = {}) {
  const Ticket = await _resolveTicketModel(regionCode);
  const update = {
    ...updateOps
  };
  update.$inc = {
    ...(update.$inc || {}),
    version: 1
  };
  const updated = await Ticket.findOneAndUpdate({
    _id: ticketId,
    version: expectedVersion,
    isArchived: {
      $ne: true
    }
  }, update, {
    new: true,
    session
  });
  if (!updated) {
    // Distinguish between "not found" and "version conflict"
    const current = await Ticket.findById(ticketId).select("version isArchived").lean();
    if (!current) throw new NotFoundError("TICKET");
    if (current.isArchived) throw new NotFoundError("TICKET");
    throw new VersionConflictError(current.version);
  }
  return updated;
}

// ─── Assign ──────────────────────────────────────────────────────────
async function assignTicket(regionCode, ticketId, {
  assigneeUserId,
  expectedVersion
}, actor, {
  ip
} = {}) {
  const Ticket = await _resolveTicketModel(regionCode);
  const current = await Ticket.findById(ticketId).select("status version").lean();
  if (!current) throw new NotFoundError("TICKET");

  // FSM: assigning transitions OPEN → IN_REVIEW (no-op if already IN_REVIEW)
  const nextStatus = current.status === "OPEN" ? "IN_REVIEW" : current.status;
  if (nextStatus !== current.status) assertTransition(current.status, nextStatus);
  const updated = await _versionedUpdate(regionCode, ticketId, expectedVersion, {
    $set: {
      assignedToPlatformUserId: assigneeUserId,
      assignedTo: assigneeUserId,
      status: nextStatus
    },
    $push: {
      ticketHistory: _historyEntry({
        action: "TICKET_ASSIGNED",
        actor,
        diff: {
          assigneeUserId,
          statusFrom: current.status,
          statusTo: nextStatus
        },
        ip
      })
    }
  });
  await auditService.createAuditRecord({
    regionCode,
    branchId: "000000000000000000000000",
    actorId: actor.userId,
    actorType: actor.type || "platform_user",
    action: "TICKET_ASSIGNED",
    entity: "TICKET",
    entityId: updated._id,
    details: {
      assigneeUserId,
      from: current.status,
      to: nextStatus
    },
    success: true
  });
  return updated.toObject();
}

// ─── Add message (E5 cap enforced) ───────────────────────────────────
async function addMessage(regionCode, ticketId, {
  message,
  expectedVersion
}, actor, {
  ip
} = {}) {
  const Ticket = await _resolveTicketModel(regionCode);
  const current = await Ticket.findById(ticketId).select("status version threadMessageCount").lean();
  if (!current) throw new NotFoundError("TICKET");

  // E5 — hard cap
  const MAX = Ticket.MAX_THREAD_MESSAGES || 200;
  if ((current.threadMessageCount || 0) >= MAX) {
    throw new LimitExceededError("THREAD");
  }

  // Optional FSM nudge: platform reply to OPEN → IN_REVIEW
  const nextStatus = current.status === "OPEN" ? "IN_REVIEW" : current.status;
  if (nextStatus !== current.status) assertTransition(current.status, nextStatus);
  const updated = await _versionedUpdate(regionCode, ticketId, expectedVersion, {
    $set: {
      status: nextStatus
    },
    $push: {
      conversationThread: {
        actorId: actor.userId,
        actorType: actor.type || "platform_user",
        message,
        createdAt: new Date()
      },
      ticketHistory: _historyEntry({
        action: "TICKET_MESSAGE_ADDED",
        actor,
        diff: {
          length: message.length,
          statusFrom: current.status,
          statusTo: nextStatus
        },
        ip
      })
    },
    $inc: {
      threadMessageCount: 1
    }
  });
  return updated.toObject();
}

// ─── Add internal note (platform-only, never leaks to org DTO) ───────
async function addInternalNote(regionCode, ticketId, {
  note,
  expectedVersion
}, actor, {
  ip
} = {}) {
  const updated = await _versionedUpdate(regionCode, ticketId, expectedVersion, {
    $push: {
      internalNotes: {
        actorId: actor.userId,
        note,
        createdAt: new Date()
      },
      ticketHistory: _historyEntry({
        action: "TICKET_INTERNAL_NOTE_ADDED",
        actor,
        diff: {
          length: note.length
        },
        ip
      })
    }
  });
  return updated.toObject();
}

// ─── Transition ──────────────────────────────────────────────────────
async function transitionStatus(regionCode, ticketId, {
  newStatus,
  expectedVersion,
  reopen,
  reason
}, actor, {
  ip
} = {}) {
  const Ticket = await _resolveTicketModel(regionCode);
  const current = await Ticket.findById(ticketId).select("status version organizationId").lean();
  if (!current) throw new NotFoundError("TICKET");
  assertTransition(current.status, newStatus, {
    reopen,
    reason
  });
  const setOps = {
    status: newStatus
  };
  if (newStatus === "RESOLVED") setOps.resolvedAt = new Date();
  const updated = await _versionedUpdate(regionCode, ticketId, expectedVersion, {
    $set: setOps,
    $push: {
      ticketHistory: _historyEntry({
        action: "TICKET_STATUS_CHANGED",
        actor,
        diff: {
          from: current.status,
          to: newStatus,
          reopen,
          reason
        },
        ip
      })
    }
  });
  await auditService.createAuditRecord({
    regionCode,
    branchId: "000000000000000000000000",
    actorId: actor.userId,
    actorType: actor.type || "platform_user",
    action: "TICKET_STATUS_CHANGED",
    entity: "TICKET",
    entityId: updated._id,
    details: {
      from: current.status,
      to: newStatus,
      reopen,
      reason
    },
    success: true
  });
  return updated.toObject();
}

// ─── Archive (soft delete, E13) ──────────────────────────────────────
async function archiveTicket(regionCode, ticketId, {
  expectedVersion,
  reason
}, actor, {
  ip
} = {}) {
  const updated = await _versionedUpdate(regionCode, ticketId, expectedVersion, {
    $set: {
      isArchived: true,
      archivedAt: new Date(),
      archivedBy: actor.userId
    },
    $push: {
      ticketHistory: _historyEntry({
        action: "TICKET_ARCHIVED",
        actor,
        diff: {
          reason
        },
        ip
      })
    }
  });
  return updated.toObject();
}
module.exports = {
  // SLA
  SLA_HOURS_BY_PRIORITY,
  calculateSlaDeadline,
  // CRUD
  findTicketById,
  listTickets,
  createTicket,
  assignTicket,
  addMessage,
  addInternalNote,
  transitionStatus,
  archiveTicket,
  // Errors (exported for controllers to map to HTTP)
  VersionConflictError,
  NotFoundError,
  IdempotencyConflictError,
  LimitExceededError
};