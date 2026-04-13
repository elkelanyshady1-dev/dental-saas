/**
 * accountingEventContracts.js
 * AccountingDomain — Event Contract Registry
 *
 * CLASSIFICATION: Infrastructure — Schema enforcement for incoming eventBus events.
 *
 * PURPOSE:
 *   Defines the canonical JSON Schema for all events that accountingDomain
 *   consumes. Any event payload that does not match its schema is REJECTED
 *   before reaching the projection layer.
 *
 * EVENTS REGISTERED:
 *   - invoice.created
 *   - payment.received
 *   - refund.processed
 *
 * USAGE:
 *   const { validateEventPayload } = require("./accountingEventContracts");
 *   const result = validateEventPayload("invoice.created", payload);
 *   if (!result.valid) { ... }
 *
 * PLANE: Org only
 *
 * @module accountingDomain/eventContracts/accountingEventContracts
 */

"use strict";

const logger = require("@utils/logger");

// ─── Event Schemas ────────────────────────────────────────────────────────────
// Light validation (no Joi/Zod dependency) for zero-overhead boot integration.
// Format: { required: string[], optionals: string[], types: Record<string, string> }

const EVENT_SCHEMAS = {
    "invoice.created": {
        required: ["eventId", "organizationId", "dbConnection", "invoice"],
        nested: {
            invoice: {
                required: ["_id", "totalAmount"],
                optional: ["amountPaid", "status", "issuedAt", "branchId", "patientId"],
            }
        }
    },

    "payment.received": {
        required: ["eventId", "organizationId", "dbConnection", "payment"],
        nested: {
            payment: {
                required: ["_id", "amountPaid"],
                optional: ["method", "paidAt", "branchId", "patientId", "invoiceId"],
            }
        }
    },

    "refund.processed": {
        required: ["eventId", "organizationId", "dbConnection", "refund"],
        nested: {
            refund: {
                required: ["_id", "amount"],
                optional: ["invoiceId", "paymentId", "refundedAt", "reason"],
            }
        }
    },
};

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * validateEventPayload
 *
 * Validates an incoming event payload against the registered contract.
 *
 * @param {string} eventType — e.g. "invoice.created"
 * @param {Object} payload   — The raw event payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateEventPayload(eventType, payload) {
    const schema = EVENT_SCHEMAS[eventType];

    if (!schema) {
        return {
            valid: false,
            errors: [`[accounting:events] Unknown event type: "${eventType}". Not in contract registry.`]
        };
    }

    const errors = [];

    // Check top-level required fields
    for (const field of schema.required) {
        if (field === "dbConnection") continue; // Runtime object — skip schema check
        if (payload[field] === undefined || payload[field] === null) {
            errors.push(`Missing required field: "${field}"`);
        }
    }

    // Check nested object required fields
    for (const [key, nestedSchema] of Object.entries(schema.nested || {})) {
        const nested = payload[key];
        if (!nested || typeof nested !== "object") {
            errors.push(`Field "${key}" must be an object`);
            continue;
        }
        for (const nestedField of nestedSchema.required) {
            if (nested[nestedField] === undefined || nested[nestedField] === null) {
                errors.push(`Missing required nested field: "${key}.${nestedField}"`);
            }
        }
    }

    if (errors.length > 0) {
        logger.warn({
            eventType,
            errors,
        }, "[accounting:events] Contract validation failed");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * assertEventPayload
 *
 * Throws if payload is invalid. Use in strict contexts.
 */
function assertEventPayload(eventType, payload) {
    const result = validateEventPayload(eventType, payload);
    if (!result.valid) {
        throw new Error(
            `[accounting:events] Schema validation failed for "${eventType}": ${result.errors.join("; ")}`
        );
    }
}

/**
 * getSupportedEvents
 * Returns the list of events this domain can consume.
 */
function getSupportedEvents() {
    return Object.keys(EVENT_SCHEMAS);
}

module.exports = {
    validateEventPayload,
    assertEventPayload,
    getSupportedEvents,
    EVENT_SCHEMAS,
};
