/**
 * orthodonticCase.validator.js
 * Phase 4 — Orthodontic Intelligence
 */

"use strict";

const VALID_MALOCCLUSIONS = ["CLASS_I", "CLASS_II_DIV_1", "CLASS_II_DIV_2", "CLASS_III"];
const VALID_CASE_TYPES = ["comprehensive", "limited", "interceptive", "surgical", "aligner", "retention"];

function validateCreateCase(data) {
    const errors = [];

    if (!data.patientId) errors.push("patientId is required");
    if (data.malocclusionClass && !VALID_MALOCCLUSIONS.includes(data.malocclusionClass)) {
        errors.push(`malocclusionClass must be one of: ${VALID_MALOCCLUSIONS.join(", ")}`);
    }
    if (data.caseType && !VALID_CASE_TYPES.includes(data.caseType)) {
        errors.push(`caseType must be one of: ${VALID_CASE_TYPES.join(", ")}`);
    }

    return { error: errors.length > 0 ? errors.join("; ") : null };
}

function validateUpdateCase(data) {
    const errors = [];

    if (data.malocclusionClass && !VALID_MALOCCLUSIONS.includes(data.malocclusionClass)) {
        errors.push(`malocclusionClass must be one of: ${VALID_MALOCCLUSIONS.join(", ")}`);
    }
    if (data.caseType && !VALID_CASE_TYPES.includes(data.caseType)) {
        errors.push(`caseType must be one of: ${VALID_CASE_TYPES.join(", ")}`);
    }

    return { error: errors.length > 0 ? errors.join("; ") : null };
}

module.exports = { validateCreateCase, validateUpdateCase, VALID_MALOCCLUSIONS, VALID_CASE_TYPES };
