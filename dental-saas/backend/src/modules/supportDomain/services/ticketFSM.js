/**
 * ticketFSM.js — Canonical Ticket Status Finite-State Machine (Plan E11)
 *
 * Single source of truth for ALL ticket status transitions.
 * Both platform-plane and org-plane code paths MUST route mutations through
 * assertTransition() before persisting — this replaces ad-hoc `ALLOWED_TRANSITIONS`
 * literals previously scattered in services/controllers.
 *
 * States (aligned with Ticket.js enum):
 *   OPEN              → initial
 *   IN_REVIEW         → platform support has picked it up
 *   WAITING_CUSTOMER  → awaiting org/tenant reply
 *   ESCALATED         → SLA breach or manual escalation
 *   REFUND_APPROVED   → refund category: approved, awaiting provider settlement
 *   RESOLVED          → fixed, pending close
 *   CLOSED            → terminal (billing-safe)
 *   REJECTED          → terminal (invalid request)
 *
 * Usage:
 *   const { assertTransition } = require('@modules/supportDomain/services/ticketFSM');
 *   assertTransition(ticket.status, 'IN_REVIEW');   // throws INVALID_STATE_TRANSITION
 */

"use strict";

const ALLOWED_TRANSITIONS = Object.freeze({
    OPEN:             ["IN_REVIEW", "REJECTED", "ESCALATED", "CLOSED"],
    IN_REVIEW:        ["WAITING_CUSTOMER", "RESOLVED", "REFUND_APPROVED", "ESCALATED", "REJECTED"],
    WAITING_CUSTOMER: ["IN_REVIEW", "RESOLVED", "ESCALATED", "CLOSED"],
    ESCALATED:        ["IN_REVIEW", "RESOLVED", "REFUND_APPROVED", "CLOSED"],
    REFUND_APPROVED:  ["RESOLVED", "CLOSED"],
    RESOLVED:         ["CLOSED", "IN_REVIEW"], // re-open only with explicit reopen flag
    CLOSED:           [],
    REJECTED:         [],
});

const REOPEN_RULES = Object.freeze({
    RESOLVED_TO_IN_REVIEW: {
        from: "RESOLVED",
        to: "IN_REVIEW",
        requires: ["reopen", "reason"],
    },
});

class InvalidTransitionError extends Error {
    constructor(from, to) {
        super(`INVALID_STATE_TRANSITION: ${from} → ${to}`);
        this.code = "INVALID_STATE_TRANSITION";
        this.status = 422;
        this.from = from;
        this.to = to;
    }
}

class ReopenRequirementError extends Error {
    constructor(message) {
        super(message);
        this.code = "REOPEN_REQUIREMENT_MISSING";
        this.status = 422;
    }
}

/**
 * Pure predicate — returns boolean. Use in UI guards or precondition checks.
 */
function canTransition(from, to) {
    if (from === to) return true; // idempotent no-op
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed) return false;
    return allowed.includes(to);
}

/**
 * Throws on invalid transition. Use before every persistence call.
 *
 * @param {string} from - current status
 * @param {string} to   - target status
 * @param {Object} [context] - optional reopen context { reopen: true, reason: '...' }
 */
function assertTransition(from, to, context = {}) {
    if (from === to) return; // no-op allowed

    if (!canTransition(from, to)) {
        throw new InvalidTransitionError(from, to);
    }

    // Re-open guard: RESOLVED → IN_REVIEW requires explicit flag + reason
    if (from === "RESOLVED" && to === "IN_REVIEW") {
        if (!context.reopen) {
            throw new ReopenRequirementError("Explicit reopen flag required to transition RESOLVED → IN_REVIEW");
        }
        if (!context.reason || String(context.reason).trim().length === 0) {
            throw new ReopenRequirementError("Reopen reason is mandatory");
        }
    }
}

function isTerminal(status) {
    return status === "CLOSED" || status === "REJECTED";
}

function allStates() {
    return Object.keys(ALLOWED_TRANSITIONS);
}

module.exports = {
    ALLOWED_TRANSITIONS,
    REOPEN_RULES,
    canTransition,
    assertTransition,
    isTerminal,
    allStates,
    InvalidTransitionError,
    ReopenRequirementError,
};
