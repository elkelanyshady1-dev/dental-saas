/**
 * procedures.validator.js
 * Phase 3 — Clinical Operations
 */

"use strict";

function validateCreateProcedure(data) {
    const errors = [];

    if (!data.code || typeof data.code !== "string" || data.code.trim().length < 2) {
        errors.push("code is required and must be at least 2 characters");
    }
    if (!data.name || typeof data.name !== "string" || data.name.trim().length < 2) {
        errors.push("name is required and must be at least 2 characters");
    }
    if (data.defaultPrice === undefined || data.defaultPrice === null || typeof data.defaultPrice !== "number" || data.defaultPrice < 0) {
        errors.push("defaultPrice is required and must be a non-negative number");
    }

    const validCategories = [
        "diagnostic", "preventive", "restorative", "endodontic",
        "periodontic", "prosthodontic", "orthodontic", "oral_surgery",
        "implant", "cosmetic", "pediatric", "emergency", "other"
    ];
    if (data.category && !validCategories.includes(data.category)) {
        errors.push(`category must be one of: ${validCategories.join(", ")}`);
    }
    if (data.estimatedDuration !== undefined && (typeof data.estimatedDuration !== "number" || data.estimatedDuration < 0)) {
        errors.push("estimatedDuration must be a non-negative number");
    }

    return { error: errors.length > 0 ? errors.join("; ") : null };
}

function validateUpdateProcedure(data) {
    const errors = [];

    if (data.code !== undefined && (typeof data.code !== "string" || data.code.trim().length < 2)) {
        errors.push("code must be at least 2 characters");
    }
    if (data.name !== undefined && (typeof data.name !== "string" || data.name.trim().length < 2)) {
        errors.push("name must be at least 2 characters");
    }
    if (data.defaultPrice !== undefined && (typeof data.defaultPrice !== "number" || data.defaultPrice < 0)) {
        errors.push("defaultPrice must be a non-negative number");
    }

    return { error: errors.length > 0 ? errors.join("; ") : null };
}

module.exports = { validateCreateProcedure, validateUpdateProcedure };
