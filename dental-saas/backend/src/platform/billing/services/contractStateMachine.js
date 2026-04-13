/**
 * contractStateMachine.js
 * Platform Billing — Contract Lifecycle Guard
 * v3.0 — Invoice-First Lifecycle (SAFE ARCHITECTURE REFACTOR)
 *
 * Single source of truth for valid OrgContract state transitions.
 *
 * ── Contract Lifecycle ────────────────────────────────────────────────────────
 *
 *   draft
 *     → ready             (contract finalized, invoice generation starts)
 *     → terminated        (cancelled before any invoice)
 *     → void              (operator-voided draft)
 *
 *   ready
 *     → pending_payment   (invoice issued, awaiting payment)
 *     → terminated        (cancelled before payment collected)
 *     → void
 *
 *   pending_payment
 *     → active            (invoice.status = paid → contract activates)
 *     → canceled          (org cancels before payment deadline)
 *     → terminated        (platform force-terminates)
 *     → void
 *
 *   active
 *     → superseded        (replaced by upgrade/downgrade contract)
 *     → expired           (period ended, not renewed)
 *     → canceled          (customer-initiated cancellation at period end)
 *     → terminated        (platform-initiated hard termination mid-period)
 *     → grace             (payment overdue — reversible within grace period)
 *     → suspended         (non-payment after grace — reversible on payment)
 *
 *   grace
 *     → active            (payment received during grace period)
 *     → suspended         (grace period expired without payment)
 *     → terminated
 *
 *   suspended
 *     → active            (payment received — reactivation)
 *     → terminated
 *     → void
 *
 * ── Legacy states (kept for backward compatibility / historical records) ──────
 *
 *   pending_activation    (scheduled future-date contracts — superseded by pending_payment model)
 *     → active
 *     → canceled
 *     → terminated
 *     → void
 *
 * ── Terminal states — immutable ───────────────────────────────────────────────
 *   superseded  → historical record
 *   expired     → historical record
 *   terminated  → platform/operator action
 *   canceled    → customer-initiated
 *   void        → operator-voided
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SENTINEL PRE-CHECK:
 *   Contract impact: BEHAVIORAL GUARD — adds "ready" and "pending_payment" states
 *   Regression risk: LOW — new states additive; existing transitions unchanged
 */

"use strict";

const logger = require("@utils/logger");

// ─── Transition Table ─────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS = Object.freeze({
    // ── Invoice-first states ───────────────────────────────────────────────────
    // v3.0: Orchestrator creates contracts DIRECTLY in pending_payment via initialStatus.
    // "draft" and "ready" are preserved here for backward compatibility only.
    // The active upgrade path is: createContract(initialStatus: "pending_payment") → active (after payment).
    draft: ["ready", "active", "pending_activation", "terminated", "void"],
    ready: ["pending_payment", "terminated", "void"],   // legacy — no longer used by orchestrator v3.0
    pending_payment: ["active", "canceled", "terminated", "void"],

    // ── Active / dunning states ────────────────────────────────────────────────
    active: ["superseded", "expired", "canceled", "terminated", "grace", "suspended"],
    grace: ["active", "suspended", "terminated"],
    suspended: ["active", "terminated", "void"],

    // ── Legacy scheduled-activation state (backward compat) ───────────────────
    pending_activation: ["active", "canceled", "terminated", "void"],

    // ── Terminal states — no valid outgoing transitions ────────────────────────
    superseded: [],
    expired: [],
    terminated: [],
    canceled: [],   // customer-initiated cancellation
    void: []    // operator-voided
});

const ALL_VALID_STATUSES = Object.freeze(Object.keys(ALLOWED_TRANSITIONS));

// ─── assertValidTransition ────────────────────────────────────────────────────

/**
 * assertValidTransition
 *
 * Throws if the requested status transition is not permitted.
 * Call this BEFORE mutating contract.contractStatus.
 *
 * @param {string} current  - Current contractStatus value
 * @param {string} next     - Proposed contractStatus value
 * @throws {Error}          - Error with code CONTRACT_INVALID_TRANSITION
 */
function assertValidTransition(current, next) {
    // Guard against unknown statuses (schema drift or data corruption)
    if (!ALL_VALID_STATUSES.includes(current)) {
        const err = new Error(
            `[ContractStateMachine] Unknown source status "${current}". ` +
            `Valid statuses: ${ALL_VALID_STATUSES.join(", ")}`
        );
        err.code = "CONTRACT_INVALID_TRANSITION";
        logger.error({ current, next }, err.message);
        throw err;
    }

    if (!ALL_VALID_STATUSES.includes(next)) {
        const err = new Error(
            `[ContractStateMachine] Unknown target status "${next}". ` +
            `Valid statuses: ${ALL_VALID_STATUSES.join(", ")}`
        );
        err.code = "CONTRACT_INVALID_TRANSITION";
        logger.error({ current, next }, err.message);
        throw err;
    }

    const allowed = ALLOWED_TRANSITIONS[current];

    if (!allowed.includes(next)) {
        const err = new Error(
            `[ContractStateMachine] Invalid transition: "${current}" → "${next}". ` +
            (allowed.length > 0
                ? `Allowed from "${current}": ${allowed.join(", ")}.`
                : `"${current}" is a terminal state with no valid outgoing transitions.`)
        );
        err.code = "CONTRACT_INVALID_TRANSITION";
        err.status = 422;

        logger.error(
            { current, next, allowedTransitions: allowed },
            `[ContractStateMachine] CONTRACT_INVALID_TRANSITION: ${current} → ${next}`
        );

        throw err;
    }
}

// ─── isTerminal ───────────────────────────────────────────────────────────────

/**
 * isTerminal
 * Returns true if the given status is a terminal (immutable) state.
 *
 * @param {string} status
 * @returns {boolean}
 */
function isTerminal(status) {
    return ALLOWED_TRANSITIONS[status]?.length === 0;
}

/**
 * isPendingPayment
 * Returns true if the contract is awaiting payment (invoice-first model).
 *
 * @param {string} status
 * @returns {boolean}
 */
function isPendingPayment(status) {
    return status === "pending_payment";
}

/**
 * canActivate
 * Returns true if the contract can be transitioned to "active".
 *
 * @param {string} status
 * @returns {boolean}
 */
function canActivate(status) {
    return ALLOWED_TRANSITIONS[status]?.includes("active") ?? false;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    assertValidTransition,
    isTerminal,
    isPendingPayment,
    canActivate,
    ALLOWED_TRANSITIONS,
    ALL_VALID_STATUSES
};
