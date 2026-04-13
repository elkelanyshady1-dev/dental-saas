/**
 * procedureTypes.js
 * Domain: orthodontic-cases
 * Layer: Constants
 *
 * SINGLE SOURCE OF TRUTH for all valid procedure type strings.
 * Used by:
 *   - procedureGenerator.service.js (to produce procedures)
 *   - snapshot.service.js (to validate generator output)
 *   - ClinicalTimeline.tsx / useVisitDetail.ts (type-safe formatter map)
 *
 * RULES:
 *   - Add new types here FIRST, then add detection logic in procedureGenerator.service.js
 *   - NEVER use string literals for procedure types in application code
 *   - Object.freeze() prevents mutation at runtime
 */

"use strict";

const PROCEDURE_TYPES = Object.freeze({
    // ── Bracket / Bonding ─────────────────────────────────────────────────────
    BONDING:              "bonding",
    DEBONDING:            "debonding",
    REBONDING:            "rebonding",

    // ── Surgery ───────────────────────────────────────────────────────────────
    EXTRACTION:           "extraction",

    // ── Archwires ─────────────────────────────────────────────────────────────
    WIRE_PLACEMENT:       "wire_placement",
    WIRE_CHANGE:          "wire_change",
    WIRE_REMOVAL:         "wire_removal",

    // ── Elastics ──────────────────────────────────────────────────────────────
    ELASTIC_PLACEMENT:    "elastic_placement",
    ELASTIC_REMOVAL:      "elastic_removal",

    // ── Power Chains ──────────────────────────────────────────────────────────
    POWERCHAIN_PLACEMENT: "powerchain_placement",
    POWERCHAIN_REMOVAL:   "powerchain_removal",

    // ── Appliances ────────────────────────────────────────────────────────────
    APPLIANCE_PLACEMENT:  "appliance_placement",
    APPLIANCE_REMOVAL:    "appliance_removal",

    // ── Miniscrews ────────────────────────────────────────────────────────────
    MINISCREW_PLACEMENT:  "miniscrew_placement",
    MINISCREW_REMOVAL:    "miniscrew_removal",

    // ── IPR ───────────────────────────────────────────────────────────────────
    IPR:                  "ipr",

    // ── Status / Alert ────────────────────────────────────────────────────────
    TOOTH_STATUS_CHANGE:  "tooth_status_change",
    TOOTH_ALERT:          "tooth_alert",
});

// Set of valid type strings for O(1) membership tests
const VALID_PROCEDURE_TYPE_SET = new Set(Object.values(PROCEDURE_TYPES));

/**
 * isValidProcedureType — runtime guard for generator output validation.
 * @param {string} type
 * @returns {boolean}
 */
function isValidProcedureType(type) {
    return VALID_PROCEDURE_TYPE_SET.has(type);
}

/**
 * assertValidProcedureType — throws if type is not in registry.
 * Used as a hard gate in snapshot.service.js after procedure generation.
 * @param {string} type
 * @throws {Error} INVALID_PROCEDURE_TYPE
 */
function assertValidProcedureType(type) {
    if (!VALID_PROCEDURE_TYPE_SET.has(type)) {
        throw Object.assign(
            new Error(`INVALID_PROCEDURE_TYPE: ${type}`),
            { code: "INVALID_PROCEDURE_TYPE", invalidType: type }
        );
    }
}

module.exports = { PROCEDURE_TYPES, VALID_PROCEDURE_TYPE_SET, isValidProcedureType, assertValidProcedureType };
