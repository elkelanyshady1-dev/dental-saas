/**
 * eventHandlerRegistry.js
 * Core Infrastructure — Event Replay
 *
 * Maps eventType → replay handler. The replay engine uses this to decide
 * how to re-process a stuck outbox event. The default strategy is to
 * re-emit the event on the in-process eventBus — the same mechanism the
 * live outbox worker uses — which guarantees existing subscribers stay
 * the single source of truth for side-effects.
 *
 * Handlers must be IDEMPOTENT. The replay engine enforces at-least-once
 * semantics (same as outbox.worker), and many downstream subscribers
 * already dedupe by aggregateId/eventType.
 *
 * Registering a custom handler:
 *   register("billing.invoice.issued", async ({ payload, record, ctx }) => { ... })
 *
 * If no handler is registered for an eventType, the DEFAULT handler
 * re-emits via eventBus. Unknown events are never silently dropped —
 * they either flow through eventBus or are logged and left pending.
 *
 * PLANE: Core Infrastructure (cross-cutting)
 */

"use strict";

const eventBus = require("@core/eventBus");
const logger = require("@utils/logger");

const _handlers = new Map();

// ─── Default Handler ─────────────────────────────────────────────────────────

/**
 * Default replay strategy: re-emit via eventBus (matches live worker).
 * Subscribers MUST be idempotent.
 */
async function defaultHandler({ payload, record }) {
    eventBus.emit(record.eventType, payload);
}

// ─── Registration API ────────────────────────────────────────────────────────

function register(eventType, handler) {
    if (typeof eventType !== "string" || !eventType) {
        throw new Error("eventHandlerRegistry.register: eventType required");
    }
    if (typeof handler !== "function") {
        throw new Error("eventHandlerRegistry.register: handler must be a function");
    }
    _handlers.set(eventType, handler);
}

function resolve(eventType) {
    return _handlers.get(eventType) || defaultHandler;
}

function has(eventType) {
    return _handlers.has(eventType);
}

function list() {
    return [...new Set([..._handlers.keys(), "__default__"])];
}

// ─── Safety Wrapper ──────────────────────────────────────────────────────────

/**
 * Execute a handler with uniform error handling. Returns { ok, err }.
 */
async function invoke(eventType, args) {
    const handler = resolve(eventType);
    try {
        await handler(args);
        return { ok: true, handler: _handlers.has(eventType) ? "custom" : "default" };
    } catch (err) {
        logger.error(
            { event: "REPLAY_HANDLER_ERROR", eventType, err: err.message },
            "[Replay] Handler threw"
        );
        return { ok: false, err, handler: _handlers.has(eventType) ? "custom" : "default" };
    }
}

module.exports = {
    register,
    resolve,
    has,
    list,
    invoke,
    defaultHandler,
};
