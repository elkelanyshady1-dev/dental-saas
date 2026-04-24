/**
 * observability.listener.js
 * Platform Observability — Event Bus Listener
 *
 * Subscribes to a fixed allowlist of billing-lifecycle events on the
 * in-memory eventBus and persists sanitized records to the platform DB.
 *
 * Guarantees:
 *   • NON-BLOCKING — persistence failures are logged and swallowed; the
 *     original emitter's control flow is never affected.
 *   • CARDINALITY GUARD — only events in EVENT_ALLOWLIST are persisted,
 *     even if extra listeners are later wired in by mistake.
 *   • SOFT THROTTLE — per-event, per-process 5ms floor between writes.
 *     Protects the platform DB from storm cascades (e.g. a failing
 *     checkout retry loop). Drops are counted per event and a warn is
 *     logged every 1000th drop.
 *   • INGEST-TIME MASKING — only allowlisted payload keys ever hit disk.
 *
 * Auto-registers on require. Idempotent across hot-reloads: removes any
 * prior handlers for the tracked event names before re-subscribing.
 *
 * PLANE: Platform
 */

"use strict";

const eventBus = require("@core/eventBus");
const logger = require("@utils/logger");
const { EVENT_ALLOWLIST, sanitizePayload } = require("./payloadSanitizer");
const { getObservabilityEventModel } = require("./models");

const ALLOWED_EVENTS = new Set(Object.keys(EVENT_ALLOWLIST));

// Per-event soft throttle (process-local).
const THROTTLE_MS = 5;
const lastWriteAt = new Map(); // eventName -> ms timestamp of last persisted write
const dropCounts = new Map();  // eventName -> cumulative drop count

function mapSeverity(eventName) {
    if (eventName === "CHECKOUT_FAILED") return "ERROR";
    if (eventName === "QUOTA_EXCEEDED_POST_UPLOAD") return "WARN";
    return "INFO";
}

async function handleEvent(eventName, payload = {}) {
    // Belt-and-braces cardinality guard.
    if (!ALLOWED_EVENTS.has(eventName)) return;

    // Per-event soft throttle.
    const now = Date.now();
    const prev = lastWriteAt.get(eventName) || 0;
    if (now - prev < THROTTLE_MS) {
        const n = (dropCounts.get(eventName) || 0) + 1;
        dropCounts.set(eventName, n);
        if (n % 1000 === 0) {
            logger.warn(
                { eventName, dropped: n },
                "[observability.listener] throttle dropping events"
            );
        }
        return;
    }
    lastWriteAt.set(eventName, now);

    try {
        const ObservabilityEvent = getObservabilityEventModel();
        await ObservabilityEvent.create({
            eventName,
            organizationId: payload.organizationId,
            contractId: payload.contractId,
            invoiceId: payload.invoiceId,
            payload: sanitizePayload(eventName, payload),
            severity: mapSeverity(eventName),
        });
    } catch (err) {
        // Non-blocking: log and swallow. Must never break the emitter's flow.
        logger.warn(
            { err: err && err.message, eventName },
            "[observability.listener] ingest failed"
        );
    }
}

function registerObservabilityListeners() {
    for (const eventName of ALLOWED_EVENTS) {
        eventBus.removeAllListeners(eventName);
        eventBus.on(eventName, (payload) => {
            // Fire-and-forget; never await inside the bus callback.
            handleEvent(eventName, payload).catch((err) => {
                logger.warn(
                    { err: err && err.message, eventName },
                    "[observability.listener] unhandled error"
                );
            });
        });
    }
    logger.info(
        { events: Array.from(ALLOWED_EVENTS) },
        "[observability.listener] billing observability listeners registered"
    );
}

// ── Auto-register on require ──────────────────────────────────────────────────
registerObservabilityListeners();

module.exports = {
    registerObservabilityListeners,
    // Exported for tests only.
    _internals: { ALLOWED_EVENTS, lastWriteAt, dropCounts, handleEvent, mapSeverity },
};
