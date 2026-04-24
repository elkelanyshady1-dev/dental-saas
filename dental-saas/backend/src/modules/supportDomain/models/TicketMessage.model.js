/**
 * TicketMessage.model.js — Phase 3 E5: Ticket message collection split
 *
 * Authoritative store for ticket conversation messages. Replaces the embedded
 * `Ticket.conversationThread[]` array which had a 200-message hard cap and
 * could not be paginated efficiently.
 *
 * Plane: Org DB (per-tenant). `organizationId` is carried for audit clarity
 * only — tenant scoping is enforced by DB-per-org architecture.
 *
 * Sender enum is intentionally broader than the v10 Ticket's `actorType` enum
 * so future platform-agent messaging has a first-class type. A "SYSTEM"
 * variant is reserved for automated posts (SLA escalation, status change).
 */

"use strict";

const mongoose = require("mongoose");
const attachmentSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2048
  },
  type: {
    type: String,
    trim: true,
    maxlength: 64
  }
}, {
  _id: false
});
const ticketMessageSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Ticket",
    required: true,
    index: true
  },
  sender: {
    type: String,
    enum: ["ORG_USER", "PLATFORM_AGENT", "SYSTEM"],
    required: true,
    uppercase: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId
  },
  message: {
    type: String,
    required: true,
    maxlength: 5000
  },
  // Read-state tracking (future unread counts / notifications).
  read: {
    type: Boolean,
    default: false
  },
  attachments: {
    type: [attachmentSchema],
    default: [],
    validate: {
      validator: v => v.length <= 10,
      message: "TICKET_MESSAGE_ATTACHMENT_LIMIT: max 10 attachments per message"
    }
  },
  // Migration provenance — set by the backfill script so reruns stay
  // idempotent. Not exposed via DTO.
  legacyEmbeddedMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    index: {
      unique: true,
      sparse: true
    }
  }
}, {
  timestamps: {
    createdAt: true,
    updatedAt: false
  }
});

// ─── Indexes ─────────────────────────────────────────────────────────
// Primary paging query: `ticketId` + `createdAt` for cursor pagination.
ticketMessageSchema.index({
  ticketId: 1,
  createdAt: 1
});
// Reverse scan for "latest first" list views.
ticketMessageSchema.index({
  ticketId: 1,
  createdAt: -1
});
// Partial index for unread-count queries — only indexes unread rows so it
// stays tiny even on busy tickets.
ticketMessageSchema.index({
  ticketId: 1,
  createdAt: -1
}, {
  name: "ticketId_unread_partial",
  partialFilterExpression: {
    read: false
  }
});
const modelName = "TicketMessage";
module.exports = {
  modelName,
  schema: ticketMessageSchema
};