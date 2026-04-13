/**
 * schemaRegistry.js
 * 
 * Centralized Domain Event Contracts (v3.1)
 * Enforces schema stability and emission authority.
 */

const Events = require("../core/domainEvents");

const SCHEMA_REGISTRY = {
    [Events.PATIENT_CREATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "patientId", "actorId"],
        allowedEmitters: ["patient.aggregate.service", "patient.create.service"]
    },
    [Events.PATIENT_UPDATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "patientId", "actorId"],
        allowedEmitters: ["patient.aggregate.service", "patient.update.service"]
    },
    [Events.PATIENT_DELETED]: {
        version: "1.0",
        requiredFields: ["organizationId", "patientId", "actorId"],
        allowedEmitters: ["patient.aggregate.service", "patient.lifecycle.service"]
    },
    [Events.PATIENT_STATUS_CHANGED]: {
        version: "1.0",
        requiredFields: ["organizationId", "patientId", "actorId", "isActive"],
        allowedEmitters: ["patient.aggregate.service", "patient.lifecycle.service"]
    },
    [Events.PATIENT_BRANCH_UPDATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "patientId", "actorId"],
        allowedEmitters: ["patient.aggregate.service", "patient.update.service"]
    },
    [Events.PATIENT_MEDICAL_UPDATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "patientId", "actorId"],
        allowedEmitters: ["patient.aggregate.service", "patient.clinical.service"]
    },
    [Events.PATIENT_POLICY_UPDATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "actorId"],
        allowedEmitters: ["patient.aggregate.service", "patient.policy.service"]
    },
    [Events.DOCTOR_ASSIGNED_TO_PATIENT]: {
        version: "1.0",
        requiredFields: ["organizationId", "patientId", "doctorId"],
        allowedEmitters: ["patient.aggregate.service", "patient.lifecycle.service"]
    },
    [Events.APPOINTMENT_CREATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "appointmentId", "patientId"],
        allowedEmitters: ["appointment.service"]
    },
    [Events.APPOINTMENT_COMPLETED]: {
        version: "1.0",
        requiredFields: ["organizationId", "appointmentId", "patientId", "doctorId"],
        allowedEmitters: ["appointment.service"]
    },
    [Events.CLINICAL_CASE_CREATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "patientId", "doctorId"],
        allowedEmitters: ["clinicalCase.aggregate.service", "clinical.service"]
    },
    [Events.INVOICE_OVERDUE]: {
        version: "1.0",
        requiredFields: ["organizationId", "invoiceId", "amount"],
        allowedEmitters: ["financial.orchestrator"]
    },
    [Events.SECURITY_ALERT]: {
        version: "1.0",
        requiredFields: ["type", "severity", "details"],
        allowedEmitters: ["sovereignGuard", "auth.service", "platformUser.service"]
    },
    // Financial Projection Event (Phase G — Billing Domain Restructure)
    [Events.FINANCIAL_SNAPSHOT_REQUESTED]: {
        version: "1.0",
        requiredFields: ["eventId", "organizationId", "patientId", "type", "amount"],
        allowedEmitters: ["test.simulation", "ledger.orchestrator.service"]
    },
    [Events.PLAN_CHANGED]: {
        version: "1.0",
        requiredFields: ["organizationId", "newPlanId", "actorId"],
        allowedEmitters: ["subscription.mutation.controller"]
    },
    [Events.ADDON_ADDED]: {
        version: "1.0",
        requiredFields: ["organizationId", "addOnId", "actorId"],
        allowedEmitters: ["subscription.mutation.controller"]
    },
    [Events.ADDON_REMOVED]: {
        version: "1.0",
        requiredFields: ["organizationId", "orgAddOnId", "actorId"],
        allowedEmitters: ["subscription.mutation.controller"]
    },

    // Platform Billing Lifecycle Events (v23.0 — TASK-AUTH-LIFECYCLE-HARDENING Phase 2)
    [Events.CONTRACT_CREATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "contractId"],
        allowedEmitters: ["contractEngine.service", "publicController", "contractActivation.service"]
    },
    [Events.CONTRACT_ACTIVATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "contractId"],
        allowedEmitters: ["contractActivation.service"]
    },
    [Events.PLATFORM_INVOICE_CREATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "invoiceId", "contractId"],
        allowedEmitters: ["invoiceEngine.service", "billingOrchestrator.service"]
    },
    [Events.PLATFORM_INVOICE_PAID]: {
        version: "1.0",
        requiredFields: ["organizationId", "invoiceId", "amount"],
        allowedEmitters: ["paymentApplicationService", "canonicalEventProcessor"]
    },

    // Phase 14 — Audit Intelligence Events
    [Events.AUDIT_EVENT_CREATED]: {
        version: "1.0",
        requiredFields: ["organizationId", "action", "entity"],
        allowedEmitters: ["auditInterceptor", "auditService"]
    },
    [Events.GOVERNANCE_VIOLATION_DETECTED]: {
        version: "1.0",
        requiredFields: ["rule", "severity", "message"],
        allowedEmitters: ["governanceEngine", "secureRoute", "auditInterceptor"]
    },

    // Phase B.2 — Module Lifecycle Events
    [Events.MODULE_ENABLED]: {
        version: "1.0",
        requiredFields: ["organizationId", "moduleKey"],
        allowedEmitters: ["moduleLifecycle.service", "lifecycleHooks"]
    },
    [Events.MODULE_DISABLED]: {
        version: "1.0",
        requiredFields: ["organizationId", "moduleKey"],
        allowedEmitters: ["moduleLifecycle.service", "lifecycleHooks"]
    },
    [Events.MODULE_INSTALLED]: {
        version: "1.0",
        requiredFields: ["organizationId", "moduleKey"],
        allowedEmitters: ["moduleLifecycle.service", "lifecycleHooks"]
    }
};

/**
 * validateEventSchema
 * @param {string} type 
 * @param {object} payload 
 * @param {string} emitter 
 */
function validateEventSchema(type, payload, emitter = "unknown") {
    const schema = SCHEMA_REGISTRY[type];

    // 1. Existence check
    if (!schema) {
        throw new Error(`Architecural Violation: Event type '${type}' is not registered in schemaRegistry.`);
    }

    // 2. Required fields check
    const missingFields = schema.requiredFields.filter(f => payload[f] === undefined);
    if (missingFields.length > 0) {
        throw new Error(`Schema Violation: Event '${type}' missing required fields: ${missingFields.join(", ")}`);
    }

    // 3. Emitter check (Warn in dev, block in prod)
    if (schema.allowedEmitters && !schema.allowedEmitters.includes(emitter)) {
        const msg = `Authority Violation: Emitter '${emitter}' is not authorized to emit event '${type}'.`;
        if (process.env.NODE_ENV === "production") {
            throw new Error(msg);
        } else {
            console.warn(`⚠️ [EventBus] ${msg}`);
        }
    }

    return true;
}

module.exports = {
    validateEventSchema,
    SCHEMA_REGISTRY
};
