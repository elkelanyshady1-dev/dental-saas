/**
 * email.events.js
 * Platform Events — Email Event Listeners
 * v2.0 — EventBus → emailQueue bridge
 *
 * Registers listeners on the platform EventBus for all email-triggering events.
 * Each listener enqueues a job to emailQueue (non-blocking, fire-and-forget).
 *
 * Event routing:
 *   email.magic_link      → MAGIC_LINK job
 *   email.password_reset  → PASSWORD_RESET job
 *   email.otp             → EMAIL_OTP job
 *   email.invoice         → INVOICE job
 *   email.refund          → REFUND job
 *   email.ticket_reply    → TICKET_REPLY job
 *
 * Emitters queue jobs via:
 *   eventBus.emit("email.magic_link", { email, name, link }, "emitterName")
 *
 * NOTE: These events are NOT registered in the schemaRegistry because they are
 * internal infrastructure events emitted only by the email emitter helpers below.
 * The schemaRegistry governs domain events cross-cutting business invariants.
 *
 * PLANE: Platform / Shared
 * MUST BE: bootstrapped in server.js/app.js after eventBus is ready
 */

"use strict";

const eventBus = require("../core/eventBus");
const { enqueueEmail } = require("../infrastructure/queues/emailQueue");
const logger = require("../utils/logger");

// ─── Type-safe emitter helpers ────────────────────────────────────────────────
// These are the ONLY allowed callers of the email events.
// Auth services, billing services, etc. import and call these helpers.
// They never import the queue directly.

/**
 * emitMagicLink
 * @param {{ email: string, name: string, link: string, ipAddress?: string }} payload
 */
function emitMagicLink(payload) {
    _enqueueOrWarn("email.magic_link", "MAGIC_LINK", payload);
}

/**
 * emitPasswordReset
 * @param {{ email: string, name?: string, resetUrl: string }} payload
 */
function emitPasswordReset(payload) {
    _enqueueOrWarn("email.password_reset", "PASSWORD_RESET", payload);
}

/**
 * emitOtp
 * @param {{ email: string, name?: string, otp: string }} payload
 */
function emitOtp(payload) {
    _enqueueOrWarn("email.otp", "EMAIL_OTP", payload);
}

/**
 * emitInvoiceEmail
 * @param {{ email: string, orgName: string, invoiceNumber: string, totalAmount: number, currency: string, dueDate: Date }} payload
 */
function emitInvoiceEmail(payload) {
    _enqueueOrWarn("email.invoice", "INVOICE", payload);
}

/**
 * emitRefundEmail
 * @param {{ email: string, orgName: string, refundAmount: number, currency: string }} payload
 */
function emitRefundEmail(payload) {
    _enqueueOrWarn("email.refund", "REFUND", payload);
}

/**
 * emitTicketReply
 * @param {{ email: string, recipientName: string, ticketId: string, ticketSubject: string, replyBody: string }} payload
 */
function emitTicketReply(payload) {
    _enqueueOrWarn("email.ticket_reply", "TICKET_REPLY", payload);
}

/**
 * emitGraceEmail
 * @param {{ email: string, orgName: string, expiredAt?: Date, graceEndsAt?: Date, gracePeriodDays?: number, renewUrl?: string }} payload
 */
function emitGraceEmail(payload) {
    _enqueueOrWarn("email.grace", "GRACE", payload);
}

/**
 * emitSuspensionEmail
 * @param {{ email: string, orgName: string, suspendedAt?: Date, reasonCode?: string, renewUrl?: string }} payload
 */
function emitSuspensionEmail(payload) {
    _enqueueOrWarn("email.suspension", "SUSPENSION", payload);
}

/**
 * emitRetryFailed
 * @param {{ email: string, orgName: string, invoiceNumber: string, amount: number, currency: string, retryCount: number, maxRetries: number, isExhausted: boolean, failedAt?: Date, updatePaymentUrl?: string }} payload
 */
function emitRetryFailed(payload) {
    _enqueueOrWarn("email.retry_failed", "RETRY_FAILED", payload);
}

// ─── Internal: Event listeners → queue bridge ─────────────────────────────────
// Listeners are registered using Node's built-in EventEmitter API.
// The EventBus.emit() path (with schemaRegistry) is used by domain services.
// Direct _enqueueOrWarn() is used by this module's exported helpers.

function _enqueueOrWarn(eventName, jobType, payload) {
    if (!payload?.email) {
        logger.warn({ eventName, jobType }, "[email.events] Skipped enqueue — missing email in payload");
        return;
    }

    enqueueEmail(jobType, payload).catch((err) => {
        logger.error(
            { eventName, jobType, to: payload.email, err: err.message },
            "[email.events] Failed to enqueue email job"
        );
    });
}

// ─── Register EventBus listeners ─────────────────────────────────────────────
// Any module can call eventBus.emit("email.magic_link", payload) and
// this bridge will pick it up and queue the job.
// Note: These events bypass schema validation (no allowedEmitters restriction)
// because email events are emitted by many surfaces (auth, billing, support).

function _registerEmailListeners() {
    // Unregister first to allow hot-reload in tests without listener leaks
    const events = [
        "email.magic_link",
        "email.password_reset",
        "email.otp",
        "email.invoice",
        "email.refund",
        "email.ticket_reply",
        "email.grace",
        "email.suspension",
        "email.retry_failed",
    ];

    const handlers = {
        "email.magic_link": (p) => _enqueueOrWarn("email.magic_link", "MAGIC_LINK", p),
        "email.password_reset": (p) => _enqueueOrWarn("email.password_reset", "PASSWORD_RESET", p),
        "email.otp": (p) => _enqueueOrWarn("email.otp", "EMAIL_OTP", p),
        "email.invoice": (p) => _enqueueOrWarn("email.invoice", "INVOICE", p),
        "email.refund": (p) => _enqueueOrWarn("email.refund", "REFUND", p),
        "email.ticket_reply": (p) => _enqueueOrWarn("email.ticket_reply", "TICKET_REPLY", p),
        "email.grace": (p) => _enqueueOrWarn("email.grace", "GRACE", p),
        "email.suspension": (p) => _enqueueOrWarn("email.suspension", "SUSPENSION", p),
        "email.retry_failed": (p) => _enqueueOrWarn("email.retry_failed", "RETRY_FAILED", p),
    };

    for (const event of events) {
        // Use Node's raw EventEmitter to bypass schemaRegistry for internal email triggers
        eventBus.removeAllListeners(event);
        EventEmitter_on(event, handlers[event]);
    }

    logger.info({ events }, "[email.events] Email event listeners registered");
}

// Use the underlying Node.js EventEmitter prototype to bypass schema validation
// for these infrastructure-level events
const { EventEmitter } = require("events");
function EventEmitter_on(event, handler) {
    EventEmitter.prototype.on.call(eventBus, event, handler);
}

// Bootstrap on require
_registerEmailListeners();

module.exports = {
    emitMagicLink,
    emitPasswordReset,
    emitOtp,
    emitInvoiceEmail,
    emitRefundEmail,
    emitTicketReply,
    emitGraceEmail,
    emitSuspensionEmail,
    emitRetryFailed,
};
