/**
 * refundStateMachine.js
 * Sprint 7.2 — Enterprise Refund State Machine
 *
 * Defines the strict, immutable transition graph for refund lifecycle.
 * No service or controller may change a refund status without passing
 * through assertValidRefundTransition().
 *
 * State diagram:
 *
 *   refund_requested
 *       │
 *       ▼
 *   refund_under_review ──────────► refund_rejected (terminal)
 *       │
 *       ▼
 *   refund_approved
 *       │
 *       ▼
 *   refund_processing ────────────► refund_failed (terminal)
 *       │
 *       ▼
 *   refund_completed (terminal)
 *
 * PLANE: Platform / Billing Domain
 * DEPENDENCIES: none (pure domain object)
 */

"use strict";

// ─── Transition Graph ─────────────────────────────────────────────────────────
const ALLOWED_REFUND_TRANSITIONS = {
    refund_requested: ["refund_under_review"],
    refund_under_review: ["refund_approved", "refund_rejected"],
    refund_approved: ["refund_processing"],
    refund_processing: ["refund_completed", "refund_failed"],
    // Terminal states — no exit
    refund_rejected: [],
    refund_completed: [],
    refund_failed: []
};

const VALID_REFUND_STATUSES = Object.keys(ALLOWED_REFUND_TRANSITIONS);

// ─── assertValidRefundTransition ─────────────────────────────────────────────
/**
 * Enforces refund state machine rules.
 * Throws descriptively on ANY invalid transition.
 *
 * @param {string} currentStatus - Current refund status
 * @param {string} nextStatus    - Desired next refund status
 * @throws {Error}               - On invalid state or forbidden transition
 */
function assertValidRefundTransition(currentStatus, nextStatus) {
    if (!VALID_REFUND_STATUSES.includes(currentStatus)) {
        throw new Error(
            `[RefundStateMachine] INVALID_STATE: "${currentStatus}" is not a recognized refund status. ` +
            `Valid statuses: ${VALID_REFUND_STATUSES.join(", ")}`
        );
    }

    if (!VALID_REFUND_STATUSES.includes(nextStatus)) {
        throw new Error(
            `[RefundStateMachine] INVALID_STATE: "${nextStatus}" is not a recognized refund status. ` +
            `Valid statuses: ${VALID_REFUND_STATUSES.join(", ")}`
        );
    }

    const allowed = ALLOWED_REFUND_TRANSITIONS[currentStatus];

    if (!allowed.includes(nextStatus)) {
        const isTerminal = allowed.length === 0;
        const err = new Error(
            `[RefundStateMachine] FORBIDDEN_TRANSITION: Cannot transition refund from ` +
            `"${currentStatus}" → "${nextStatus}". ` +
            (isTerminal
                ? `"${currentStatus}" is a terminal state — no further transitions are permitted.`
                : `Allowed from "${currentStatus}": ${allowed.join(", ")}`)
        );
        err.code = "REFUND_FORBIDDEN_TRANSITION";
        err.status = 409;
        throw err;
    }
}

/**
 * isTerminalRefundStatus
 * @param {string} status
 * @returns {boolean}
 */
function isTerminalRefundStatus(status) {
    return ALLOWED_REFUND_TRANSITIONS[status]?.length === 0;
}

/**
 * getAllowedRefundTransitions
 * @param {string} status
 * @returns {string[]}
 */
function getAllowedRefundTransitions(status) {
    return ALLOWED_REFUND_TRANSITIONS[status] || [];
}

module.exports = {
    assertValidRefundTransition,
    isTerminalRefundStatus,
    getAllowedRefundTransitions,
    VALID_REFUND_STATUSES,
    ALLOWED_REFUND_TRANSITIONS
};
