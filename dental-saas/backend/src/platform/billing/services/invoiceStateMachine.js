/**
 * invoiceStateMachine.js
 * Platform Billing — Invoice Lifecycle State Machine
 * v22.0 — Phase 2 Safety Hardening
 *
 * Centralises ALL allowed status transitions for PlatformInvoice.
 * No controller or service should mutate invoice.status directly —
 * they must call assertTransition() and let this module enforce the rules.
 *
 * ─── Lifecycle ────────────────────────────────────────────────────────────
 *
 *   draft ─────────────────────► issued ──────────────────────► open
 *     │                             │                               │
 *     └──────► void                 └──► processing ─► paid        └──► partial ──► paid
 *                                   │         │                     │
 *                                   └──► overdue ─► uncollectible   └──► overdue
 *                                   │
 *                                   └──► void (only if amountPaid === 0)
 *
 * ─── Transition table ─────────────────────────────────────────────────────
 *
 *   FROM           TO               TRIGGER
 *   draft          open             finalizeInvoice()
 *   draft          issued           issueInvoice()
 *   draft          void             voidDraftInvoice() — amountPaid MUST be 0
 *   issued         open             payment gateway confirms receipt
 *   issued         processing       async payment initiated (v22.0)
 *   issued         partial          partial payment received
 *   issued         paid             full payment captured
 *   issued         overdue          due date passed, unpaid
 *   issued         void             only if amountPaid === 0 (see assertVoidable)
 *   open           partial          partial payment received
 *   open           paid             full payment captured
 *   open           overdue          due date passed, unpaid
 *   open           uncollectible    dunning exhausted
 *   partial        paid             remaining balance paid
 *   partial        overdue          not fully settled, due date passed
 *   partial        uncollectible    dunning exhausted on partial amount
 *   processing     paid             async provider confirms success (v22.0)
 *   processing     failed           async provider reports failure (v22.0)
 *   overdue        paid             late payment received
 *   overdue        partial          partial late payment
 *   overdue        uncollectible    written off
 *   paid, void, uncollectible, failed  → LOCKED (terminal states)
 *
 * ─── Rules (v22.0) ────────────────────────────────────────────────────────
 *   1. Only DRAFT invoices may be edited (add/remove line items, update amounts).
 *   2. Only OPEN/ISSUED/PARTIAL/OVERDUE invoices may receive payments.
 *   3. PAID, VOID, UNCOLLECTIBLE, FAILED are terminal — no further transitions.
 *   4. VOID is only allowed when amountPaid === 0 (use assertVoidable).
 *      partial → void: REMOVED. overdue → void: REMOVED.
 *      Refund first, then void if needed.
 *   5. PROCESSING state handles async payment providers (v22.0).
 *   6. All transitions emit a BillingTimeline event (non-blocking).
 *   7. All transitions write a BillingLedger entry where applicable.
 *
 * PLANE: Platform
 */

"use strict";

// ─── Allowed transition map ───────────────────────────────────────────────────
// v22.0: Removed partial → void, overdue → void (Safety Rule 4).
//         Added processing state for async payment providers.
const ALLOWED_TRANSITIONS = Object.freeze({
    draft: ["open", "issued", "void"],
    issued: ["open", "partial", "paid", "processing", "overdue", "void"],
    open: ["partial", "paid", "uncollectible", "overdue"],
    partial: ["paid", "uncollectible", "overdue"],          // void REMOVED
    processing: ["paid", "failed"],                            // v22.0 async state
    overdue: ["paid", "partial", "uncollectible"],          // void REMOVED
    paid: [],               // terminal
    void: [],               // terminal
    uncollectible: [],               // terminal
    failed: []                // terminal (v22.0 async failure)
});

// ─── Terminal states ──────────────────────────────────────────────────────────
const TERMINAL_STATES = new Set(["paid", "void", "uncollectible", "failed"]);

// ─── Editable states ──────────────────────────────────────────────────────────
// Line items, amounts, dueDate etc. may only be mutated in DRAFT.
const EDITABLE_STATES = new Set(["draft"]);

// ─── Payment-accepting states ─────────────────────────────────────────────────
// Only these statuses may receive payment applications.
const PAYMENT_ACCEPTING_STATES = new Set(["open", "issued", "partial", "overdue"]);

// ─── Voidable states ──────────────────────────────────────────────────────────
// Statuses from which void is a state-machine-allowed transition.
// Actual void is further gated by assertVoidable (amountPaid must be 0).
const VOIDABLE_STATES = new Set(["draft", "issued"]);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * canTransition
 * Returns true if the transition from `from` to `to` is permitted by the machine.
 *
 * @param {string} from  Current invoice status
 * @param {string} to    Target invoice status
 * @returns {boolean}
 */
function canTransition(from, to) {
    const allowed = ALLOWED_TRANSITIONS[from];
    return Array.isArray(allowed) && allowed.includes(to);
}

/**
 * assertTransition
 * Throws a structured error if the transition is not allowed by the state machine.
 * Does NOT enforce the amountPaid === 0 guard — call assertVoidable separately for void.
 *
 * @param {string} from
 * @param {string} to
 * @param {string|null} invoiceId  For error context
 * @throws {Error} with .status=409 and .code="INVALID_INVOICE_TRANSITION"
 */
function assertTransition(from, to, invoiceId = null) {
    if (!canTransition(from, to)) {
        const err = new Error(
            `Invalid invoice transition: ${from} → ${to}` +
            (invoiceId ? ` (invoice: ${invoiceId})` : "")
        );
        err.status = 409;
        err.code = "INVALID_INVOICE_TRANSITION";
        err.from = from;
        err.to = to;
        throw err;
    }
}

/**
 * assertVoidable
 * v22.0 — Enforces Safety Rule 4: void is only allowed when amountPaid === 0.
 *
 * Call this BEFORE assertTransition when voiding an invoice.
 * If the invoice has any payments recorded, the caller must refund them first.
 *
 * @param {object} invoice           - The invoice document (Mongoose doc or lean)
 * @param {string|null} invoiceId    - For error context
 * @throws {Error} with .status=422 and .code="CANNOT_VOID_PAID_INVOICE"
 */
function assertVoidable(invoice, invoiceId = null) {
    const paid = invoice.amountPaid ?? 0;
    if (paid > 0) {
        const err = new Error(
            `Cannot void invoice with payments applied (amountPaid=${paid}).` +
            (invoiceId ? ` (invoice: ${invoiceId})` : "") +
            " Refund all payments before voiding."
        );
        err.status = 422;
        err.code = "CANNOT_VOID_PAID_INVOICE";
        err.amountPaid = paid;
        throw err;
    }

    // Also check the state machine allows the transition
    if (!VOIDABLE_STATES.has(invoice.status)) {
        const err = new Error(
            `Invoice in status "${invoice.status}" cannot be voided.` +
            (invoiceId ? ` (invoice: ${invoiceId})` : "")
        );
        err.status = 409;
        err.code = "INVALID_INVOICE_TRANSITION";
        throw err;
    }
}

/**
 * assertEditable
 * Throws if the invoice is not in a state that allows field mutations.
 *
 * @param {string} status
 * @param {string|null} invoiceId
 * @throws {Error} with .status=409 and .code="INVOICE_NOT_EDITABLE"
 */
function assertEditable(status, invoiceId = null) {
    if (!EDITABLE_STATES.has(status)) {
        const err = new Error(
            `Invoice is not editable in status "${status}"` +
            (invoiceId ? ` (invoice: ${invoiceId})` : "") +
            " — only DRAFT invoices may be modified."
        );
        err.status = 409;
        err.code = "INVOICE_NOT_EDITABLE";
        throw err;
    }
}

/**
 * assertPaymentAccepting
 * Throws if the invoice cannot receive a payment.
 *
 * @param {string} status
 * @param {string|null} invoiceId
 * @throws {Error} with .status=409 and .code="INVOICE_NOT_PAYABLE"
 */
function assertPaymentAccepting(status, invoiceId = null) {
    if (!PAYMENT_ACCEPTING_STATES.has(status)) {
        const err = new Error(
            `Invoice cannot receive payments in status "${status}"` +
            (invoiceId ? ` (invoice: ${invoiceId})` : "") +
            " — only OPEN/ISSUED/PARTIAL/OVERDUE invoices accept payments."
        );
        err.status = 409;
        err.code = "INVOICE_NOT_PAYABLE";
        throw err;
    }
}

/**
 * isTerminal
 * Returns true if the status is a terminal (immutable) state.
 *
 * @param {string} status
 * @returns {boolean}
 */
function isTerminal(status) {
    return TERMINAL_STATES.has(status);
}

/**
 * isProcessing
 * Returns true if the invoice is in an async payment processing state (v22.0).
 *
 * @param {string} status
 * @returns {boolean}
 */
function isProcessing(status) {
    return status === "processing";
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    ALLOWED_TRANSITIONS,
    TERMINAL_STATES,
    EDITABLE_STATES,
    PAYMENT_ACCEPTING_STATES,
    VOIDABLE_STATES,
    canTransition,
    assertTransition,
    assertVoidable,        // v22.0 — Safety Rule 4 enforcement
    assertEditable,
    assertPaymentAccepting,
    isTerminal,
    isProcessing           // v22.0 — processing state helper
};
