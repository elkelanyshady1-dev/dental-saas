/**
 * commLogger.js
 * Fire-and-forget instrumentation helper for the Hybrid Execution Model.
 *
 * HARD INVARIANTS (non-negotiable):
 *   1. Never `await` this from the hot path. setImmediate defers the DB
 *      write to the next tick so the caller's latency is unaffected.
 *   2. Never throw. All failure modes swallow the error and emit a warn
 *      log. A broken telemetry pipeline MUST NOT break message delivery.
 *   3. Never import models at module load — lazy-require inside the
 *      helper so a Mongo-connection blip at boot can't tank the handler.
 *
 * Usage:
 *   tryLogCommEvent({
 *     channel, type, status, mode, provider, error, attempts,
 *     qstashMessageId, organizationId, metadata,
 *   });
 *
 * @per-plane Infrastructure
 */

"use strict";

const logger = require("@utils/logger");

// Accepts string | Error | null | undefined and returns a truncated string or null.
// Callers often pass `err` directly (Error instance) or `err.message` (string).
function _normalizeError(input, max = 500) {
    if (input == null) return null;
    if (typeof input === "string") return input.slice(0, max);
    // Error or Error-like — extract message; fall back to String(input) so we
    // never return [object Object] if something weird comes through.
    const msg = typeof input.message === "string" && input.message.length
        ? input.message
        : String(input);
    return msg.slice(0, max);
}

function tryLogCommEvent(event) {
    // Snapshot now — caller may mutate the object after we return.
    const doc = {
        channel: event.channel,
        type: event.type,
        status: event.status,
        mode: event.mode,
        provider: event.provider || null,
        error: _normalizeError(event.error),
        attempts: event.attempts || 1,
        durationMs: Number.isFinite(event.durationMs) ? event.durationMs : null,
        qstashMessageId: event.qstashMessageId || null,
        organizationId: event.organizationId || null,
        metadata: event.metadata || null,
        createdAt: new Date(),
    };

    setImmediate(async () => {
        try {
            const { default: CommunicationLog } = require("../../platform/models/CommunicationLog.model");
            await CommunicationLog.create(doc);
        } catch (err) {
            // Telemetry failures must never propagate. Use warn, not error —
            // this is expected during DB reconnection / shutdown windows and
            // shouldn't page anyone.
            logger.warn(
                { err: err.message, channel: doc.channel, type: doc.type, mode: doc.mode },
                "[COMM_LOG_FAILED]"
            );
        }
    });
}

module.exports = { tryLogCommEvent };
