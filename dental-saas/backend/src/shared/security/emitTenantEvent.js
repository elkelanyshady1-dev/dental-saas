/**
 * emitTenantEvent.js — Tenant-Scoped Event Emission Helper
 * Phase 5 — Runtime Enforcement Layer (Tenant Isolation Hardening)
 *
 * PURPOSE:
 * Convenience function that combines tenantResolver + eventBus to emit
 * domain events with guaranteed tenant context. Eliminates the pattern
 * where callers manually extract organizationId from req.context and
 * pass it in the event payload (error-prone, easy to forget).
 *
 * USAGE:
 *   const { emitTenantEvent } = require("@shared/security/emitTenantEvent");
 *
 *   // In a service or controller:
 *   emitTenantEvent(req, "appointment.created", {
 *       appointmentId: apt._id,
 *       patientId: apt.patientId,
 *   }, "appointmentService");
 *
 * The helper automatically injects organizationId, actorId, and
 * correlationId from the request's tenant context.
 *
 * @module shared/security/emitTenantEvent
 */

"use strict";

const eventBus = require("@core/eventBus");
const { resolveTenantContext } = require("./tenantResolver");

/**
 * Emit a domain event with tenant context auto-injected from the request.
 *
 * @param {import("express").Request} req - Express request (must have auth context)
 * @param {string} eventType - Domain event type (e.g., "appointment.created")
 * @param {object} payload - Event payload (organizationId will be injected)
 * @param {string} emitter - Logical name of the emitting service
 * @returns {boolean} Result of EventEmitter.emit()
 */
function emitTenantEvent(req, eventType, payload, emitter) {
    // Use pre-resolved context if available, otherwise resolve
    const tenantContext = req.tenantContext || resolveTenantContext(req);
    return eventBus.emitWithTenantContext(eventType, payload, emitter, tenantContext);
}

module.exports = { emitTenantEvent };
