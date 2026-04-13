/**
 * orgSupport.contract.js — Org Support Bridge Contract
 * @rls-bridge-contract — Contract definition only. ZERO DB access.
 *
 * Defines the DTO shapes that the org-facing support bridge may return.
 * Bridge services MUST map platform Ticket model to these shapes.
 *
 * INVARIANTS:
 *   ✔ No platform-internal IDs exposed (assignedTo, internalNotes, etc.)
 *   ✔ conversationThread filtered to exclude "system" actorType messages
 *   ✔ organizationId is NEVER in the output
 *   ✔ All dates are ISO strings
 *   ✔ Comments are append-only — no edits, no deletes
 *
 * PLANE: Bridge layer (Org → Platform read/write)
 *
 * @module specs/contracts/bridges/orgSupport.contract
 */

"use strict";

const OrgSupportContract = Object.freeze({

    // ── createTicket ─────────────────────────────────────────────────
    // Creates a new support ticket scoped to the org.
    // Source: Ticket model (platform/support)
    createTicket: {
        input: ["organizationId", "subject", "description", "category", "priority"],
        output: {
            ticketId:    "string",
            status:      "OPEN",
            slaDeadline: "date",
            createdAt:   "date",
        },
    },

    // ── listTickets ──────────────────────────────────────────────────
    // Returns paginated tickets for this org (sorted newest first).
    // Source: Ticket.find({ organizationId }) — org-scoped only
    listTickets: {
        input: ["organizationId", "page?", "limit?", "status?"],
        output: [{
            id:        "string",
            subject:   "string",
            category:  "string",
            status:    "OPEN | IN_REVIEW | WAITING_CUSTOMER | ESCALATED | RESOLVED | CLOSED",
            priority:  "CRITICAL | HIGH | MEDIUM | LOW",
            createdAt: "date",
            updatedAt: "date",
        }],
    },

    // ── getTicketDetail ──────────────────────────────────────────────
    // Returns full ticket detail with conversation thread.
    // FILTERS: internalNotes are NEVER exposed; system messages stripped.
    getTicketDetail: {
        input: ["organizationId", "ticketId"],
        output: {
            id:          "string",
            subject:     "string",
            description: "string",
            category:    "string",
            status:      "string",
            priority:    "string",
            slaDeadline: "date",
            createdAt:   "date",
            updatedAt:   "date",
            comments: [{
                authorRole: "org_user | support_agent",
                message:    "string",
                createdAt:  "date",
            }],
        },
    },

    // ── addComment ───────────────────────────────────────────────────
    // Appends a comment to the ticket's conversation thread.
    // APPEND-ONLY: No edits, no deletes. Preserves audit trail.
    addComment: {
        input: ["organizationId", "ticketId", "message"],
        output: {
            commentIndex: "number",
            createdAt:    "date",
        },
    },
});

module.exports = { OrgSupportContract };
