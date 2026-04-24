/**
 * payloadSanitizer.js
 * Platform Observability — Ingest-Time Payload Masking
 *
 * Per-event allowlist. Any field not explicitly listed is stripped BEFORE
 * the payload is persisted. This guarantees no raw PII or sensitive billing
 * detail lands in the observability store, regardless of what the event
 * emitter sends.
 *
 * Adding a new event:
 *   1. Add the event name + its allowlisted fields here.
 *   2. Add the event name to TRACKED_EVENTS in observability.listener.js.
 *   3. Update severity mapping if non-default.
 *
 * PLANE: Platform
 */

"use strict";

const EVENT_ALLOWLIST = Object.freeze({
    PRICING_RESOLVED:           ["organizationId", "planVersionId", "resolvedVia"],
    FX_RATE_USED:               ["from", "to", "rate", "source"],
    CHECKOUT_CREATED:           ["organizationId", "invoiceId", "amount", "currency"],
    CHECKOUT_FAILED:            ["organizationId", "reasonCode"],
    QUOTA_EXCEEDED_POST_UPLOAD: ["organizationId", "usedMB", "totalQuotaMB"],
});

/**
 * Return a new object containing only the allowlisted keys for the given
 * event. Unknown events return `{}`.
 *
 * @param {string} eventName
 * @param {object} [payload={}]
 * @returns {object}
 */
function sanitizePayload(eventName, payload = {}) {
    const allowed = EVENT_ALLOWLIST[eventName];
    if (!allowed) return {};
    const out = {};
    for (const key of allowed) {
        if (payload[key] !== undefined) out[key] = payload[key];
    }
    return out;
}

module.exports = { EVENT_ALLOWLIST, sanitizePayload };
