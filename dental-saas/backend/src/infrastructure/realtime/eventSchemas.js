/**
 * eventSchemas.js — Real-Time Event Schema Registry (R2 + R3 + R7)
 * ═══════════════════════════════════════════════════════════════
 *
 * PLANE:     Organization only
 * PURPOSE:   Validate, version, and whitelist every real-time event
 *
 * ZERO-TRUST RULES:
 *   ❌ NEVER emit a payload that isn't registered here
 *   ❌ NEVER include fields beyond the whitelist (R7: strict field whitelist)
 *   ✅ ALL events MUST include version suffix (R3: versioning)
 *   ✅ ALL payloads MUST pass schema validation before emit (R2: validation)
 *   ✅ Schema serves as the SSOT for frontend event handlers
 *
 * VERSIONING (R3):
 *   Event names MUST follow: "domain.action.vN"
 *   Examples: "appointment.created.v1", "patient.updated.v1"
 *   When breaking changes are needed → increment version (v2), keep v1 alive.
 *
 * ADDING A NEW EVENT:
 *   1. Add entry to EVENT_SCHEMAS below
 *   2. Define requiredFields + optionalFields (whitelist)
 *   3. Optionally set requiredPermission (R1: authorization)
 *   4. Frontend: subscribe via useOrgSocket("appointment.created.v1", queryKey)
 *
 * @module infrastructure/realtime/eventSchemas
 */

"use strict";

// ═══════════════════════════════════════════════════════════════
// EVENT SCHEMA REGISTRY
// ═══════════════════════════════════════════════════════════════
//
// Each key is a versioned event name.
// Fields:
//   requiredFields     — MUST be present in payload (validation fails otherwise)
//   optionalFields     — MAY be present (all others are STRIPPED)
//   requiredPermission — If set, only sockets with this permission receive the event (R1)
//   description        — Human-readable purpose (for docs/observability)

const EVENT_SCHEMAS = {
    // ─── Appointments (Phase 13 — full lifecycle) ─────────────────────────
    "appointment.created.v1": {
        requiredFields: ["id"],
        optionalFields: ["date", "patientId", "branchId", "dentistId", "startTime"],
        requiredPermission: "appointments.read",
        description: "New appointment created — triggers calendar invalidation",
    },
    "appointment.updated.v1": {
        requiredFields: ["id"],
        optionalFields: ["status", "date", "startTime", "endTime", "branchId"],
        requiredPermission: "appointments.read",
        description: "Appointment rescheduled or edited — triggers calendar invalidation",
    },
    "appointment.status_changed.v1": {
        requiredFields: ["id", "status"],
        optionalFields: ["previousStatus", "branchId"],
        requiredPermission: "appointments.read",
        description: "Appointment FSM status transition — triggers status badge update",
    },
    "appointment.deleted.v1": {
        requiredFields: ["id"],
        optionalFields: ["branchId"],
        requiredPermission: "appointments.read",
        description: "Appointment cancelled/deleted — triggers calendar invalidation",
    },
    "appointment.cancelled.v1": {
        requiredFields: ["id"],
        optionalFields: ["reason"],
        requiredPermission: "appointments.read",
        description: "Appointment cancelled (legacy — prefer appointment.deleted.v1)",
    },

    // ─── Patients ────────────────────────────────────────────────────────
    "patient.created.v1": {
        requiredFields: ["id"],
        optionalFields: [],
        requiredPermission: "patients.read",
        description: "New patient registered",
    },
    "patient.updated.v1": {
        requiredFields: ["id"],
        optionalFields: ["fields"],
        requiredPermission: "patients.read",
        description: "Patient record modified",
    },
    "patient.deleted.v1": {
        requiredFields: ["id"],
        optionalFields: [],
        requiredPermission: "patients.read",
        description: "Patient record removed",
    },
    "patient.status_changed.v1": {
        requiredFields: ["id"],
        optionalFields: ["status"],
        requiredPermission: "patients.read",
        description: "Patient status transitioned",
    },

    // ─── Bookings (legacy eventBus compat) ───────────────────────────────
    "booking.update.v1": {
        requiredFields: ["type"],
        optionalFields: ["appointmentId", "patientId", "branchId", "timestamp"],
        requiredPermission: "appointments.read",
        description: "Booking lifecycle event",
    },

    // ─── Treatments ──────────────────────────────────────────────────────
    "treatment.created.v1": {
        requiredFields: ["id"],
        optionalFields: ["patientId", "type"],
        requiredPermission: "treatments.read",
        description: "New treatment plan created",
    },
    "treatment.updated.v1": {
        requiredFields: ["id"],
        optionalFields: ["status"],
        requiredPermission: "treatments.read",
        description: "Treatment plan updated",
    },

    // ─── Finance ─────────────────────────────────────────────────────────
    "invoice.created.v1": {
        requiredFields: ["id"],
        optionalFields: ["patientId", "amount"],
        requiredPermission: "accounting.read",
        description: "New invoice generated",
    },
    "payment.received.v1": {
        requiredFields: ["id"],
        optionalFields: ["invoiceId", "amount"],
        requiredPermission: "accounting.read",
        description: "Payment received",
    },

    // ─── Accounting Analytics (accountingDomain — projection updates) ─────
    "accounting.updated.v1": {
        requiredFields: ["type"],
        optionalFields: ["date", "branchId", "method"],
        requiredPermission: "accounting.read",
        description: "Accounting projection updated (revenue or cashflow signal)",
    },
    "accounting.rebuild.v1": {
        requiredFields: ["orgId"],
        optionalFields: ["invoicesProcessed", "paymentsProcessed", "completedAt"],
        requiredPermission: "accounting.manage",
        description: "Accounting projection rebuild completed (admin signal)",
    },
    "accounting.dlq.v1": {
        requiredFields: ["type"],
        optionalFields: ["eventType", "dlqSize"],
        requiredPermission: "accounting.manage",
        description: "DLQ event failure or retry result",
    },

    // ─── Audit / Governance ──────────────────────────────────────────────
    "audit.event.v1": {
        requiredFields: ["type"],
        optionalFields: ["action", "entity", "entityId", "actorId", "timestamp"],
        requiredPermission: "audit.read",
        description: "Audit trail event",
    },
    "governance.violation.v1": {
        requiredFields: ["type"],
        optionalFields: ["rule", "severity", "message", "timestamp"],
        requiredPermission: "audit.read",
        description: "Governance rule violation detected",
    },

    // ─── Inventory ───────────────────────────────────────────────────────
    "inventory.updated.v1": {
        requiredFields: ["id"],
        optionalFields: ["itemName", "quantity"],
        requiredPermission: "inventory.read",
        description: "Inventory stock changed",
    },

    // ─── Notifications (user-scoped — no permission needed) ──────────────
    "notification.created.v1": {
        requiredFields: ["id"],
        optionalFields: ["title", "type"],
        requiredPermission: null, // user-scoped via emitToUser
        description: "Personal notification",
    },

    // ─── Visit Session Presence (Phase 6B — Lightweight Lock Awareness) ──
    // Zero-trust: carries visitId + doctorName ONLY.
    // No chart state. Frontend reacts by invalidating active-visit query.
    "visit.presence.joined.v1": {
        requiredFields: ["visitId"],
        optionalFields: ["doctorName", "doctorId"],
        requiredPermission: "orthodontics.read",
        description: "Doctor opened a visit session — presence awareness for other viewers",
    },
    "visit.presence.left.v1": {
        requiredFields: ["visitId"],
        optionalFields: ["doctorName"],
        requiredPermission: "orthodontics.read",
        description: "Doctor closed or left a visit session — presence cleared",
    },

    // ─── U-CAP Asset Job (thumbnail / DICOM processing lifecycle) ─────────
    // Single event carries every phase (started / progress / done / failed /
    // skipped). `phase` distinguishes; `progress` is 0–100 only on the
    // "progress" and "done" phases. Frontend hook (useAssetRealtime) patches
    // the photos query cache directly so the grid updates without a refetch.
    "asset.job.v1": {
        requiredFields: ["photoId", "caseId", "phase"],
        optionalFields: ["progress", "jobType", "error", "retryCount"],
        requiredPermission: "orthodontics.read",
        description: "Thumbnail / DICOM job lifecycle update — drives grid progress bars and dashboard",
    },
};

// ═══════════════════════════════════════════════════════════════
// VALIDATION ENGINE
// ═══════════════════════════════════════════════════════════════

/**
 * validateEvent
 *
 * Validates a payload against its registered schema.
 * Returns a sanitized payload containing ONLY whitelisted fields (R7).
 *
 * @param {string} event   — Versioned event name (e.g. "appointment.created.v1")
 * @param {object} payload — Raw payload from domain service
 * @returns {{ valid: boolean, sanitized: object|null, error: string|null }}
 */
function validateEvent(event, payload = {}) {
    const schema = EVENT_SCHEMAS[event];

    if (!schema) {
        return {
            valid: false,
            sanitized: null,
            error: `Unregistered event: "${event}". Add it to eventSchemas.js.`,
        };
    }

    // Check required fields
    const missingFields = schema.requiredFields.filter((key) => !(key in payload));
    if (missingFields.length > 0) {
        return {
            valid: false,
            sanitized: null,
            error: `Missing required fields for "${event}": ${missingFields.join(", ")}`,
        };
    }

    // Build sanitized payload — ONLY whitelisted fields (R7)
    const allowedFields = [...schema.requiredFields, ...schema.optionalFields];
    const sanitized = {};
    for (const key of allowedFields) {
        if (key in payload) {
            sanitized[key] = payload[key];
        }
    }

    return { valid: true, sanitized, error: null };
}

/**
 * getEventSchema
 *
 * Returns the schema for a given event, or null if unregistered.
 *
 * @param {string} event — Versioned event name
 * @returns {object|null}
 */
function getEventSchema(event) {
    return EVENT_SCHEMAS[event] || null;
}

/**
 * isVersionedEvent
 *
 * Checks if an event name follows the versioning convention: "domain.action.vN"
 *
 * @param {string} event — Event name to check
 * @returns {boolean}
 */
function isVersionedEvent(event) {
    return /\.\bv\d+$/.test(event);
}

/**
 * listEvents
 *
 * Returns all registered event names. Useful for observability dashboards.
 *
 * @returns {string[]}
 */
function listEvents() {
    return Object.keys(EVENT_SCHEMAS);
}

module.exports = {
    EVENT_SCHEMAS,
    validateEvent,
    getEventSchema,
    isVersionedEvent,
    listEvents,
};
