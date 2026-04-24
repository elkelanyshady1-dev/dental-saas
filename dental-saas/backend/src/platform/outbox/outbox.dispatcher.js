/**
 * outbox.dispatcher.js — Side-Effect Event Dispatcher
 * Layer: Infrastructure > Outbox
 * Version: v25.0 — Outbox Hardening
 *
 * PURPOSE:
 *   Routes side-effect outbox events to their handler functions.
 *   Called by the outbox worker for each pending event.
 *
 * HANDLER CONTRACT:
 *   - Each handler is async: (payload) => result
 *   - Handlers MUST be idempotent (worker may retry on failure)
 *   - Handlers should NOT throw for expected "already done" cases
 *   - Unknown event types throw UNKNOWN_EVENT_TYPE (moves to dead letter)
 *
 * EVENT TYPES:
 *   BILLING_TIMELINE_WRITE  → emitBillingTimelineEvent()
 *   AUDIT_LOG_WRITE         → platformAudit.log()
 *   LEDGER_ENTRY_WRITE      → writeLedgerEntry()
 *   AUDIT_SERVICE_LOG       → auditService.log()
 *   DUNNING_REACTIVATION    → reactivateOnPayment()
 *   SNAPSHOT_PROMOTION      → snapshotPromotion.promote()
 *   IDEMPOTENCY_UPDATE      → SignupIdempotency.findOneAndUpdate()
 *   EVENTBUS_EMIT           → eventBus.emit() (non-DB, in-process)
 */

"use strict";

const logger = require("@utils/logger");

// ── Lazy-loaded handlers (prevent circular deps at module init) ──────────────
// Each getter returns the handler function. Lazy loading ensures imports
// are resolved AFTER all modules are initialized.

const HANDLERS = {

    /**
     * BILLING_TIMELINE_WRITE — Write a billing timeline event.
     * payload: { organizationId, contractId, invoiceId?, eventType, ... }
     */
    BILLING_TIMELINE_WRITE: async (payload) => {
        const { emitBillingTimelineEvent } = require("../billing/services/billingTimeline.service");
        await emitBillingTimelineEvent(payload);
        return { action: "billing_timeline_written", eventType: payload.eventType };
    },

    /**
     * AUDIT_LOG_WRITE — Write a platform audit log entry.
     * payload: { action, organizationId?, actorId, metadata? }
     */
    AUDIT_LOG_WRITE: async (payload) => {
        let auditLog;
        try {
            auditLog = require("../../domain/services/platformAudit.service").log;
        } catch {
            // Fallback: log only (mirrors existing controller pattern)
            logger.info(payload, "[OutboxDispatcher][AuditFallback] Audit log written via fallback");
            return { action: "audit_log_fallback" };
        }
        await auditLog(payload);
        return { action: "audit_log_written" };
    },

    /**
     * LEDGER_ENTRY_WRITE — Write a financial ledger entry.
     * payload: { eventType, organizationId, contractId, amount?, ... }
     */
    LEDGER_ENTRY_WRITE: async (payload) => {
        const { writeLedgerEntry } = require("../billing/services/ledgerIntegration.service");
        await writeLedgerEntry(payload);
        return { action: "ledger_entry_written", eventType: payload.eventType };
    },

    /**
     * AUDIT_SERVICE_LOG — Write via auditService (contract activation path).
     * payload: { action, organizationId, ... }
     */
    AUDIT_SERVICE_LOG: async (payload) => {
        let auditService;
        try {
            auditService = require("../../services/audit.service");
        } catch {
            logger.info(payload, "[OutboxDispatcher][AuditServiceFallback]");
            return { action: "audit_service_fallback" };
        }
        await auditService.log(payload);
        return { action: "audit_service_logged" };
    },

    /**
     * DUNNING_REACTIVATION — Reactivate a suspended contract after payment.
     * payload: { invoiceId }
     */
    DUNNING_REACTIVATION: async (payload) => {
        const { reactivateOnPayment } = require("../../services/dunningProcessor.service");
        await reactivateOnPayment(payload.invoiceId);
        return { action: "dunning_reactivated", invoiceId: payload.invoiceId };
    },

    /**
     * IDEMPOTENCY_UPDATE — Update signup idempotency record.
     * payload: { idempotencyKey, orgId, status, contractId? }
     */
    IDEMPOTENCY_UPDATE: async (payload) => {
        const mongoose = require("mongoose");
        const SignupIdempotency = mongoose.models.SignupIdempotency;
        if (!SignupIdempotency) {
            logger.warn({ event: "IDEMPOTENCY_MODEL_NOT_FOUND" },
                "[OutboxDispatcher] SignupIdempotency model not registered — skipping");
            return { action: "skipped", reason: "model_not_found" };
        }
        await SignupIdempotency.findOneAndUpdate(
            { idempotencyKey: payload.idempotencyKey },
            { $set: payload.update },
            { upsert: false }
        );
        return { action: "idempotency_updated" };
    },

    /**
     * EVENTBUS_EMIT — Emit a domain event to the in-process EventBus.
     * payload: { eventName, eventPayload }
     * NOTE: Non-DB side effect. Used for event-driven choreography.
     */
    EVENTBUS_EMIT: async (payload) => {
        const eventBus = require("@core/eventBus");
        eventBus.emit(payload.eventName, payload.eventPayload);
        return { action: "event_emitted", eventName: payload.eventName };
    },
};

// ── Dispatch ─────────────────────────────────────────────────────────────────

/**
 * Dispatch a side-effect event to its handler.
 *
 * @param {Object} event — The outbox event document
 * @param {string} event.eventType — Handler key
 * @param {Object} event.payload   — Handler payload
 * @returns {Promise<Object>} Handler result
 * @throws {Error} For unknown event types (moves to dead letter)
 */
async function dispatchSideEffect(event) {
    const handler = HANDLERS[event.eventType];

    if (!handler) {
        const err = new Error(`Unknown side-effect event type: "${event.eventType}"`);
        err.code = "UNKNOWN_EVENT_TYPE";
        throw err;
    }

    return handler(event.payload);
}

module.exports = {
    dispatchSideEffect,
    // Exported for testing — NOT for direct use
    HANDLERS,
};
