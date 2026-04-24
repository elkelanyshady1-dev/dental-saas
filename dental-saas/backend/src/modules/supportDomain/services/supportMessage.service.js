// TODO(5e-B-manual): 1 .default import(s) not auto-migrated:
//   - TicketMessage (@modules/supportDomain/models/TicketMessage.model) — tenant + req present but no _getModels(req) helper
/**
 * supportMessage.service.js — Phase 3 E5
 *
 * Authoritative service for the paginated TicketMessage collection. Wraps:
 *   - createMessage({ req, ticketId, message, sender, senderId, attachments })
 *   - listMessages({ req, ticketId, limit, cursor })
 *
 * Isolation:
 *   - Tenant: enforced by DB-per-org (req.dbConnection).
 *   - Ownership: every query is scoped by `{ ticketId, organizationId }` so
 *     a stolen ticketId from another org cannot leak messages.
 *
 * Pagination:
 *   - Cursor = ISO timestamp of the last returned message's createdAt.
 *   - Forward scan: `createdAt > cursor`, limit capped at 100.
 *
 * Counters:
 *   - On each successful create we $inc `Ticket.threadMessageCount` and set
 *     `lastMessageAt`. This mirrors the metadata-only model the user spec
 *     describes ("keep only metadata on Ticket").
 */

"use strict";

const getPlatformModel = require("@core/db/getPlatformModel");
const mongoose = require("mongoose");
const TicketMessage = require("@modules/supportDomain/models/TicketMessage.model").default;
const TicketDef = require("@shared/models/Ticket");
const Ticket = getPlatformModel(TicketDef);
const {
  metrics
} = require("@infra/metrics/metrics");
const logger = require("@utils/logger");
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
class NotFoundError extends Error {
  constructor(code = "TICKET_NOT_FOUND") {
    super(code);
    this.code = code;
    this.status = 404;
  }
}
class ValidationError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
    this.status = 400;
  }
}
class DuplicateMessageError extends Error {
  constructor() {
    super("DUPLICATE_MESSAGE");
    this.code = "DUPLICATE_MESSAGE";
    this.status = 409;
  }
}

/**
 * Optimistic-concurrency guard failure (Plan E1).
 *
 * Thrown when an incoming `createMessage` call carries an `expectedVersion`
 * that no longer matches the persisted `Ticket.version`. This is the same
 * shape as `platformTicket.service.VersionConflictError` so the global
 * error handler can map both to HTTP 409 with a stable body.
 *
 * Why this matters: the ticket metadata update ($inc version, $inc
 * threadMessageCount, $set lastMessageAt) is a mutation — NOT append-only —
 * so two tabs reading the same ticket and racing to add a message would
 * otherwise silently interleave. The CAS filter `{ _id, version: expected }`
 * ensures at-most-one writer per version step.
 */
class VersionConflictError extends Error {
  constructor(currentVersion) {
    super("VERSION_CONFLICT");
    this.name = "VersionConflictError";
    this.code = "VERSION_CONFLICT";
    this.status = 409;
    this.currentVersion = currentVersion;
  }
}
function recordFailure(reason) {
  try {
    metrics.ticketMessagesFailedTotal?.inc({
      reason
    });
  } catch {
    /* noop */
  }
}
function extractOrgId(req) {
  const orgId = req?.context?.organizationId || req?.user?.organizationId;
  if (!orgId) throw new ValidationError("ORG_CONTEXT_MISSING", "Organization context missing");
  return orgId;
}
function senderFromReq(req) {
  // Org-plane calls always produce ORG_USER messages. Platform-plane callers
  // pass `sender: "PLATFORM_AGENT"` explicitly.
  return {
    sender: "ORG_USER",
    senderId: req?.context?.userId || req?.user?._id
  };
}

/**
 * Create a new ticket message and bump ticket metadata atomically.
 *
 * Uses a transaction so the message insert + ticket counter bump either both
 * commit or both roll back — required by CLAUDE.md §8.1.
 */
async function createMessage({
  req,
  ticketId,
  message,
  sender,
  senderId,
  attachments,
  expectedVersion
}) {
  if (!mongoose.isValidObjectId(ticketId)) {
    recordFailure("invalid_ticket_id");
    throw new ValidationError("INVALID_TICKET_ID");
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    recordFailure("empty_message");
    throw new ValidationError("MESSAGE_REQUIRED");
  }
  if (message.length > 5000) {
    recordFailure("too_long");
    throw new ValidationError("MESSAGE_TOO_LONG", "Message exceeds 5000 characters");
  }
  // Plan E1 — optimistic concurrency guard. The client MUST announce which
  // ticket version it's operating against. See VersionConflictError for
  // the full rationale; omitting this is a bug that allows two-tab drift.
  if (expectedVersion === undefined || expectedVersion === null) {
    recordFailure("expected_version_missing");
    throw new ValidationError("EXPECTED_VERSION_REQUIRED", "expectedVersion is required for message creation (optimistic concurrency)");
  }
  const expVer = Number(expectedVersion);
  if (!Number.isInteger(expVer) || expVer < 0) {
    recordFailure("expected_version_invalid");
    throw new ValidationError("EXPECTED_VERSION_INVALID");
  }
  const orgId = extractOrgId(req);
  const resolved = sender ? {
    sender: String(sender).toUpperCase(),
    senderId: senderId || null
  } : senderFromReq(req);
  if (!["ORG_USER", "PLATFORM_AGENT", "SYSTEM"].includes(resolved.sender)) {
    throw new ValidationError("INVALID_SENDER");
  }

  // Ownership guard: the ticket must exist in this org DB AND the caller
  // must be its creator OR have platform-plane context. Org-plane callers
  // can only message their own tickets.
  const ticket = await Ticket.findOne({
    _id: ticketId,
    isArchived: {
      $ne: true
    }
  }).lean();
  if (!ticket) {
    recordFailure("ticket_not_found");
    throw new NotFoundError();
  }
  if (resolved.sender === "ORG_USER") {
    const callerId = String(req?.context?.userId || req?.user?._id || "");
    if (callerId && String(ticket.createdBy) !== callerId) {
      // Surface as 404 to avoid leaking existence (E4).
      recordFailure("ownership_denied");
      throw new NotFoundError();
    }
  }

  // Anti-spam: block immediate identical repost by the same sender. This is
  // cheap (hits the {ticketId, createdAt:-1} index) and catches click-spam
  // that rate limits alone can't. Note: same-user different message is fine.
  const trimmed = message.trim();
  const lastMsg = await TicketMessage.findOne({
    ticketId
  }).sort({
    createdAt: -1
  }).select("senderId message").lean();
  if (lastMsg && String(lastMsg.senderId || "") === String(resolved.senderId || "") && lastMsg.message === trimmed) {
    recordFailure("duplicate");
    throw new DuplicateMessageError();
  }
  if (!req?.dbConnection) {
    throw new ValidationError("DB_CONTEXT_MISSING", "Tenant database connection missing from request context");
  }
  const session = await req.dbConnection.startSession();
  let created;
  let versionConflict = null;
  try {
    await session.withTransaction(async () => {
      const docs = await TicketMessage.create([{
        ticketId,
        sender: resolved.sender,
        senderId: resolved.senderId || undefined,
        message: trimmed,
        attachments: Array.isArray(attachments) ? attachments : []
      }], {
        session
      });
      created = docs[0];

      // CAS guard — only the writer that sees the expected version
      // commits. If another tab/request beat us, matchedCount === 0
      // and we abort the transaction by throwing. The TicketMessage
      // insert above is rolled back with us.
      const result = await Ticket.updateOne({
        _id: ticketId,
        version: expVer
      }, {
        $inc: {
          threadMessageCount: 1,
          version: 1
        },
        $set: {
          lastMessageAt: created.createdAt
        }
      }, {
        session
      });
      if (result.matchedCount === 0) {
        // Mark the conflict; we re-read current version AFTER the
        // transaction aborts so the read isn't inside a doomed txn.
        versionConflict = true;
        throw new VersionConflictError(null);
      }
    });
  } catch (err) {
    if (err instanceof VersionConflictError) {
      versionConflict = true;
    } else {
      throw err;
    }
  } finally {
    session.endSession();
  }
  if (versionConflict) {
    recordFailure("version_conflict");
    const current = await Ticket.findById(ticketId).select("version").lean();
    throw new VersionConflictError(current?.version ?? null);
  }

  // E17 observability — never let metric emission block the write.
  try {
    metrics.ticketMessagesCreatedTotal?.inc({
      sender: resolved.sender
    });
  } catch {
    /* noop */
  }
  logger.info({
    event: "TICKET_MESSAGE_CREATED",
    ticketId: String(ticketId),
    messageId: String(created._id),
    sender: resolved.sender
  }, "[supportMessage] message created");
  return created.toObject();
}

/**
 * List messages for a ticket with cursor pagination.
 *
 * Returns `{ items, nextCursor, hasMore }`. The cursor is the ISO string of
 * the last item's `createdAt`; clients pass it back verbatim to fetch the
 * next page. Stable ordering is guaranteed by the `{ ticketId, createdAt }`
 * index plus `_id` as a tiebreaker.
 */
async function listMessages({
  req,
  ticketId,
  limit,
  cursor
}) {
  if (!mongoose.isValidObjectId(ticketId)) {
    throw new ValidationError("INVALID_TICKET_ID");
  }
  const orgId = extractOrgId(req);

  // Ownership guard (org plane can only see own tickets).
  const ticket = await Ticket.findOne({
    _id: ticketId
  }).lean();
  if (!ticket) throw new NotFoundError();
  const callerId = String(req?.context?.userId || req?.user?._id || "");
  const isPlatform = req?.context?.plane === "platform";
  if (!isPlatform && callerId && String(ticket.createdBy) !== callerId) {
    throw new NotFoundError();
  }
  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const filter = {
    ticketId
  };
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      throw new ValidationError("INVALID_CURSOR");
    }
    filter.createdAt = {
      $gt: cursorDate
    };
  }
  const items = await TicketMessage.find(filter).sort({
    createdAt: 1,
    _id: 1
  }).limit(pageSize + 1).lean();
  const hasMore = items.length > pageSize;
  const page = hasMore ? items.slice(0, pageSize) : items;
  const nextCursor = hasMore ? page[page.length - 1].createdAt.toISOString() : null;
  return {
    items: page.map(m => ({
      _id: String(m._id),
      ticketId: String(m.ticketId),
      sender: m.sender,
      senderId: m.senderId ? String(m.senderId) : null,
      message: m.message,
      attachments: m.attachments || [],
      createdAt: m.createdAt
    })),
    nextCursor,
    hasMore
  };
}
module.exports = {
  createMessage,
  listMessages,
  NotFoundError,
  ValidationError,
  DuplicateMessageError,
  VersionConflictError
};