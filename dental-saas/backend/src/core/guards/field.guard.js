/**
 * field.guard.js — Field Guards (V2 — Projection-Based)
 *
 * CRITICAL RULE:
 *   ❌ NEVER use `delete data.field` after fetching
 *   ✅ ALWAYS use MongoDB projection (.select()) BEFORE fetching
 *
 * Field guards modify the MongoDB projection object so sensitive
 * fields are NEVER transferred from the DB. Zero overfetch.
 *
 * Each guard is a factory that returns:
 *   (projection, context) => modifiedProjection
 */

"use strict";

// ─── Field Restriction Rules ────────────────────────────────────────────────
// resource → role → denied fields
// If a role is not listed, no restrictions apply (full access).

const FIELD_RULES = Object.freeze({
    patient: {
        assistant: ["diagnosis", "medicalHistory", "clinicalNotes"],
        receptionist: ["diagnosis", "medicalHistory", "clinicalNotes", "financials"],
        lab_technician: ["financials", "insuranceDetails", "paymentHistory"],
    },
    treatment: {
        receptionist: ["internalNotes", "clinicalFindings"],
        lab_technician: ["financials", "patientPayments"],
    },
    invoice: {
        lab_technician: ["*"], // Full deny
    },
    prescription: {
        receptionist: ["clinicalNotes"],
        lab_technician: ["*"],
    },
});

// ─── Generic Field Restriction ──────────────────────────────────────────────

/**
 * Creates a field guard that restricts fields based on configured rules.
 *
 * @param {string} resourceType - Key in FIELD_RULES (e.g., "patient", "invoice")
 * @returns {Function} Field guard: (projection, context) => modifiedProjection
 */
function restrictFields(resourceType) {
    return (projection, { user }) => {
        const role = user.role || user.roleName;
        if (!role) return projection;

        const deniedFields = FIELD_RULES[resourceType]?.[role];
        if (!deniedFields) return projection;

        // Full deny — return only _id
        if (deniedFields.includes("*")) {
            return { _id: 1 };
        }

        // Add exclusions to projection
        const restricted = { ...projection };
        for (const field of deniedFields) {
            restricted[field] = 0;
        }
        return restricted;
    };
}

// ─── Custom Field Restriction ───────────────────────────────────────────────

/**
 * Creates a field guard that excludes specific fields for specific roles.
 *
 * @param {Object} roleFieldMap - { roleName: ["field1", "field2"] }
 * @returns {Function} Field guard
 */
function restrictFieldsByRole(roleFieldMap) {
    return (projection, { user }) => {
        const role = user.role || user.roleName;
        if (!role) return projection;

        const denied = roleFieldMap[role];
        if (!denied) return projection;

        const restricted = { ...projection };
        for (const field of denied) {
            restricted[field] = 0;
        }
        return restricted;
    };
}

/**
 * Creates a field guard that restricts sensitive fields.
 * Use for one-off restrictions without defining a full rule set.
 *
 * @param {string[]} fields - Fields to exclude
 * @param {Function} [shouldApply] - (context) => boolean. If false, no restriction.
 * @returns {Function} Field guard
 */
function excludeFields(fields, shouldApply) {
    return (projection, context) => {
        if (shouldApply && !shouldApply(context)) return projection;

        const restricted = { ...projection };
        for (const field of fields) {
            restricted[field] = 0;
        }
        return restricted;
    };
}

/**
 * Creates a field guard that only includes specific fields (whitelist).
 *
 * @param {string[]} fields - Fields to include
 * @returns {Function} Field guard
 */
function onlyFields(fields) {
    return (projection) => {
        const includes = {};
        for (const field of fields) {
            includes[field] = 1;
        }
        return includes;
    };
}

module.exports = {
    restrictFields,
    restrictFieldsByRole,
    excludeFields,
    onlyFields,
    FIELD_RULES,
};
