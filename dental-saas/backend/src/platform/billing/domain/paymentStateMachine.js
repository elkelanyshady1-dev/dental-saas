/**
 * paymentStateMachine.js
 * v13.0 — Provider-Agnostic Payment State Machine
 *
 * ENFORCEMENT RULE:
 * All payment status transitions MUST pass through assertValidTransition().
 * No controller or service may mutate payment.status directly.
 *
 * This is a pure domain object — no database calls, no imports.
 * It is a pure function that throws on violation.
 */

"use strict";

/**
 * ALLOWED_TRANSITIONS
 * Adjacency map defining every valid state transition.
 * If a (current → next) pair is not listed here, it is FORBIDDEN.
 *
 * State lifecycle:
 *
 *   pending → authorized → captured → refunded
 *                       ↓           ↓
 *                     failed    partially_refunded → refunded
 *                                   ↓
 *                              disputed → refunded
 */
const ALLOWED_TRANSITIONS = {
    pending: [
        "authorized",
        "failed"         // Direct failure before authorization (e.g. card declined at checkout)
    ],
    authorized: [
        "captured",
        "failed"
    ],
    captured: [
        "refunded",
        "partially_refunded",
        "disputed"
    ],
    disputed: [
        "refunded"
    ],
    partially_refunded: [
        "refunded"
    ],
    // Terminal states — no transitions allowed out
    failed: [],
    refunded: []
};

/**
 * VALID_STATUSES
 * The complete set of payment statuses recognized by this system.
 * Any status not in this set is architecturally invalid.
 */
const VALID_STATUSES = Object.keys(ALLOWED_TRANSITIONS);

/**
 * assertValidTransition
 * Enforces payment state machine rules.
 * Throws descriptively on ANY invalid transition.
 *
 * @param {string} currentStatus - The current payment status
 * @param {string} nextStatus - The desired next status
 * @throws {Error} If the transition is not allowed
 */
function assertValidTransition(currentStatus, nextStatus) {
    if (!VALID_STATUSES.includes(currentStatus)) {
        throw new Error(
            `[PaymentStateMachine] INVALID_STATE: "${currentStatus}" is not a recognized payment status. ` +
            `Valid statuses: ${VALID_STATUSES.join(", ")}`
        );
    }

    if (!VALID_STATUSES.includes(nextStatus)) {
        throw new Error(
            `[PaymentStateMachine] INVALID_STATE: "${nextStatus}" is not a recognized payment status. ` +
            `Valid statuses: ${VALID_STATUSES.join(", ")}`
        );
    }

    const allowed = ALLOWED_TRANSITIONS[currentStatus];

    if (!allowed.includes(nextStatus)) {
        const isTerminal = allowed.length === 0;
        throw new Error(
            `[PaymentStateMachine] FORBIDDEN_TRANSITION: Cannot transition payment from ` +
            `"${currentStatus}" → "${nextStatus}". ` +
            (isTerminal
                ? `"${currentStatus}" is a terminal state — no further transitions are permitted.`
                : `Allowed from "${currentStatus}": ${allowed.join(", ") || "none"}`)
        );
    }
}

/**
 * isTerminalStatus
 * Returns true if no further transitions are allowed from this status.
 * @param {string} status
 * @returns {boolean}
 */
function isTerminalStatus(status) {
    return ALLOWED_TRANSITIONS[status]?.length === 0;
}

/**
 * getAllowedTransitions
 * Returns the list of valid next statuses from a given status.
 * Useful for UI and validation layers.
 * @param {string} status
 * @returns {string[]}
 */
function getAllowedTransitions(status) {
    return ALLOWED_TRANSITIONS[status] || [];
}

module.exports = {
    assertValidTransition,
    isTerminalStatus,
    getAllowedTransitions,
    VALID_STATUSES,
    ALLOWED_TRANSITIONS
};
