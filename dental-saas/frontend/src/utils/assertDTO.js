/**
 * assertDTO.js — Frontend DTO Contract Guard
 * Phase 9.1 — Self-Defending Architecture
 *
 * Validates that a patient object received from the API conforms to the DTO contract.
 * Throws in development, logs in production to prevent silent contract drift.
 *
 * Usage:
 *   import { assertPatientDTO } from "@/utils/assertDTO";
 *   assertPatientDTO(patient);            // single item
 *   assertPatientListDTO(patients);       // array of items
 */

const REQUIRED_FIELDS = ["displayName"];

/**
 * Validates a single patient object against the DTO contract.
 * @param {object} patient — Patient object from API response
 * @param {string} [context] — Caller identifier for debugging (e.g., component name)
 * @throws {Error} in development if DTO is violated
 */
export function assertPatientDTO(patient, context = "unknown") {
    if (!patient || typeof patient !== "object") return;

    const missing = REQUIRED_FIELDS.filter(f => patient[f] === undefined);

    if (missing.length > 0) {
        const message = `[DTO_VIOLATION] Patient ${patient._id || "?"} missing: ${missing.join(", ")} (caller: ${context})`;

        if (import.meta.env.DEV) {
            throw new Error(message);
        } else {
            console.error(message);
        }
    }
}

/**
 * Validates an array of patient objects against the DTO contract.
 * @param {object[]} patients — Array of patient objects from API response
 * @param {string} [context] — Caller identifier for debugging
 */
export function assertPatientListDTO(patients, context = "unknown") {
    if (!Array.isArray(patients)) return;
    patients.forEach(p => assertPatientDTO(p, context));
}
